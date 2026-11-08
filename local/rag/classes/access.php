<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();

final class access {
    public static function require_course(int $courseid): \stdClass {
        $course = get_course($courseid);
        require_login($course);
        $context = \context_course::instance($courseid);
        require_capability('local/rag:use', $context);
        if (!self::can_use_course($courseid)) {
            throw new \required_capability_exception($context, 'local/rag:use', 'nopermissions', '');
        }
        return $course;
    }
    public static function can_use_course(int $courseid): bool {
        global $USER;
        if (!isloggedin() || isguestuser()) {
            return false;
        }
        $context = \context_course::instance($courseid);
        return has_capability('local/rag:use', $context) && ($courseid === (int)SITEID ||
            is_enrolled($context, $USER, '', true) || has_capability('moodle/course:view', $context));
    }
    public static function can_read_module(int $courseid, int $cmid): bool {
        global $CFG;
        $modinfo = get_fast_modinfo($courseid);
        if (!isset($modinfo->cms[$cmid])) {
            return false;
        }
        $cm = $modinfo->get_cm($cmid);
        if (!in_array($cm->modname, content_catalog::MODULES, true) || !$cm->uservisible) {
            return false;
        }
        // Labels were inline course content before Moodle 3.2 introduced this capability.
        if ($cm->modname === 'label' && !get_capability_info('mod/label:view')) {
            if (!in_array((int)$CFG->branch, [30, 31], true)) {
                return false;
            }
            $course = get_course($courseid);
            return self::can_use_course($courseid) && ($course->visible ||
                has_capability('moodle/course:viewhiddencourses', \context_course::instance($courseid)));
        }
        return has_capability($cm->modname === 'data' ? 'mod/data:viewentry' :
            ($cm->modname === 'book' ? 'mod/book:read' : 'mod/' . $cm->modname . ':view'),
            \context_module::instance($cmid));
    }
    public static function allowed_documents(int $courseid): array {
        global $DB;
        $records = $DB->get_records('local_rag_documents', ['courseid' => $courseid, 'status' => 'indexed']);
        return array_values(array_filter($records, static function($record) use ($courseid) {
            return self::can_read_document($record);
        }));
    }
    public static function file(\stdClass $record) {
        $metadata = json_decode($record->metadata ?? '{}', true) ?: [];
        if (isset($metadata['source'])) {
            $current = content_catalog::current($record);
            return $current && $current->fileid ? get_file_storage()->get_file_by_id($current->fileid) : false;
        }
        $file = get_file_storage()->get_file_by_id($record->fileid);
        if (!$file || $file->is_directory() || !in_array($file->get_component(), ['mod_resource', 'mod_folder', 'mod_data'], true) ||
                $file->get_filearea() !== 'content' || (int)$file->get_contextid() !== (int)\context_module::instance($record->cmid)->id) {
            return false;
        }
        return $file;
    }
    public static function can_read_document(\stdClass $document): bool {
        global $CFG, $DB, $USER;
        $metadata = json_decode($document->metadata ?? '{}', true) ?: [];
        if (isset($metadata['source'])) {
            return self::can_read_native($document);
        }
        if (!self::can_read_module($document->courseid, $document->cmid) || !($file = self::file($document))) {
            return false;
        }
        if ($file->get_component() !== 'mod_data') {
            return true;
        }
        require_once($CFG->dirroot . '/mod/data/locallib.php');
        $cm = get_coursemodule_from_id('data', $document->cmid, 0, false, MUST_EXIST);
        $context = \context_module::instance($cm->id);
        $content = $DB->get_record('data_content', ['id' => $file->get_itemid()]);
        $entry = $content ? $DB->get_record('data_records', ['id' => $content->recordid, 'dataid' => $cm->instance]) : false;
        $field = $content ? $DB->get_record('data_fields', ['id' => $content->fieldid, 'dataid' => $cm->instance, 'type' => 'file']) : false;
        if (!$entry || !$field || !has_capability('mod/data:manageentries', $context, $entry->userid)) {
            return false;
        }
        $data = $DB->get_record('data', ['id' => $cm->instance], '*', MUST_EXIST);
        $canmanage = has_capability('mod/data:manageentries', $context);
        if (!self::database_available($data, $canmanage)) {
            return false;
        }
        if ($entry->userid != $USER->id && ((!empty($data->timeviewfrom) && time() < $data->timeviewfrom) ||
                (!empty($data->timeviewto) && time() > $data->timeviewto))) {
            return false;
        }
        if ($data->approval && !$entry->approved && $entry->userid != $USER->id && !has_capability('mod/data:approve', $context)) {
            return false;
        }
        if ($entry->userid != $USER->id && !$canmanage && !empty($data->requiredentriestoview) &&
                $DB->count_records('data_records', ['dataid' => $data->id, 'userid' => $USER->id]) < $data->requiredentriestoview) {
            return false;
        }
        if ($entry->groupid && groups_get_activity_groupmode($cm) == SEPARATEGROUPS &&
                !has_capability('moodle/site:accessallgroups', $context) && !groups_is_member($entry->groupid)) {
            return false;
        }
        return true;
    }
    /** Match native Database viewing bounds before its 3.3 helper existed. */
    private static function database_available(\stdClass $data, bool $canmanage): bool {
        if (function_exists('data_get_time_availability_status')) {
            $status = data_get_time_availability_status($data, $canmanage);
            return (bool)$status[0];
        }
        if ($canmanage) {
            return true;
        }
        $now = time();
        return (empty($data->timeavailablefrom) || $data->timeavailablefrom <= $now) &&
            (empty($data->timeavailableto) || $now <= $data->timeavailableto);
    }

    private static function can_read_native(\stdClass $record): bool {
        global $CFG, $DB;
        if (!self::can_use_course((int)$record->courseid) || !($current = content_catalog::current($record)) ||
                $current->contenthash !== $record->contenthash) {
            return false;
        }
        $metadata = json_codec::decode($current->metadata);
        $source = $metadata['source'];
        if ((int)$record->cmid > 0) {
            if (!self::can_read_module((int)$record->courseid, (int)$record->cmid)) {
                return false;
            }
            if ($source['kind'] !== 'chapter') {
                return true;
            }
            require_once($CFG->dirroot . '/mod/book/locallib.php');
            $cm = get_coursemodule_from_id('book', $record->cmid);
            $book = $DB->get_record('book', ['id' => $cm->instance], '*', MUST_EXIST);
            $chapters = book_preload_chapters($book);
            $chapter = $chapters[$source['itemid']] ?? false;
            return $chapter && (!$chapter->hidden ||
                has_capability('mod/book:viewhiddenchapters', \context_module::instance($cm->id)));
        }
        if ($source['kind'] === 'section') {
            $sections = get_fast_modinfo($record->courseid)->get_section_info_all();
            foreach ($sections as $section) {
                if ((int)$section->id === (int)$source['itemid']) {
                    return (bool)$section->uservisible;
                }
            }
            return false;
        }
        return $source['kind'] === 'block' && self::visible_block((int)$record->courseid, (int)$source['itemid']);
    }

    private static function visible_block(int $courseid, int $blockid): bool {
        $course = get_course($courseid);
        $page = new \moodle_page();
        $page->set_course($course);
        $page->set_context(\context_course::instance($courseid));
        $page->set_url('/course/view.php', ['id' => $courseid]);
        $page->set_pagetype('course-view-' . $course->format);
        $page->blocks->add_region('side-pre', true);
        $page->blocks->load_blocks(false);
        foreach ($page->blocks->get_blocks_for_region('side-pre') as $block) {
            if ((int)$block->instance->id === $blockid) {
                return has_capability('moodle/block:view', \context_block::instance($blockid));
            }
        }
        return false;
    }

    public static function source_url(\stdClass $record): string {
        $metadata = json_decode($record->metadata ?? '{}', true) ?: [];
        if (isset($metadata['source']) && (int)$record->fileid === 0) {
            $current = content_catalog::current($record);
            if (!$current || !self::can_read_document($record)) {
                return '';
            }
            $metadata = json_codec::decode($current->metadata);
            return (new \moodle_url($metadata['url']))->out(false);
        }
        $file = self::file($record);
        if (!$file || !self::can_read_document($record)) {
            return '';
        }
        return \moodle_url::make_pluginfile_url($file->get_contextid(), $file->get_component(),
            $file->get_filearea(), $file->get_itemid(), $file->get_filepath(), $file->get_filename(), true)->out(false);
    }
}

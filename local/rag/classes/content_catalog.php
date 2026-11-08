<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();

/** Explicit adapters for course-authored content, never a general file/table crawler. */
final class content_catalog {
    public const MODULES = ['resource', 'folder', 'data', 'page', 'book', 'label'];

    public static function scope(int $scope): array {
        global $DB;
        if ($scope < 0) {
            return self::course(-$scope);
        }
        $cm = get_coursemodule_from_id('', $scope, 0, false, IGNORE_MISSING);
        if (!$cm || !in_array($cm->modname, self::MODULES, true)) {
            return [];
        }
        $context = \context_module::instance($cm->id);
        $items = [];
        if (in_array($cm->modname, ['resource', 'folder', 'data'], true)) {
            self::files($items, $cm, $context->id, 'mod_' . $cm->modname, 'content', false, ['kind' => 'file']);
            return $items;
        }
        $module = $DB->get_record($cm->modname, ['id' => $cm->instance], '*', MUST_EXIST);
        if ($cm->modname === 'book') {
            foreach ($DB->get_records('book_chapters', ['bookid' => $module->id], 'pagenum, id') as $chapter) {
                $source = ['kind' => 'chapter', 'itemid' => (int)$chapter->id];
                self::html($items, $cm, $source, $module->name . ' — ' . $chapter->title, (string)$chapter->content,
                    '/mod/book/view.php?id=' . $cm->id . '&chapterid=' . $chapter->id);
                self::files($items, $cm, $context->id, 'mod_book', 'chapter', (int)$chapter->id, $source);
            }
            return $items;
        }
        $source = ['kind' => $cm->modname, 'itemid' => (int)$module->id];
        $html = $cm->modname === 'page' ? ($module->content ?? '') : ($module->intro ?? '');
        $url = $cm->modname === 'page' ? '/mod/page/view.php?id=' . $cm->id : '/course/view.php?id=' . $cm->course . '#module-' . $cm->id;
        self::html($items, $cm, $source, $cm->name, $html, $url);
        self::files($items, $cm, $context->id, 'mod_' . $cm->modname, $cm->modname === 'page' ? 'content' : 'intro', 0, $source);
        return $items;
    }

    private static function course(int $courseid): array {
        global $DB;
        if (!$DB->record_exists('course', ['id' => $courseid])) {
            return [];
        }
        $items = [];
        $context = \context_course::instance($courseid);
        $cm = (object)['id' => -$courseid, 'course' => $courseid, 'modname' => 'course', 'name' => 'Course'];
        foreach ($DB->get_records('course_sections', ['course' => $courseid], 'section') as $section) {
            $source = ['kind' => 'section', 'itemid' => (int)$section->id];
            self::html($items, $cm, $source, $section->name ?: 'Section ' . $section->section, (string)$section->summary,
                '/course/view.php?id=' . $courseid . '#section-' . $section->section);
            self::files($items, $cm, $context->id, 'course', 'section', (int)$section->id, $source);
        }
        foreach ($DB->get_records('block_instances', ['parentcontextid' => $context->id, 'blockname' => 'html']) as $instance) {
            // Only course-owned blocks rendered on a course page; no dashboards or inherited system blocks.
            if (!in_array($instance->pagetypepattern, ['course-*', 'course-view-*', 'course-view-' . get_course($courseid)->format, '*'], true) ||
                    !empty($instance->subpagepattern)) {
                continue;
            }
            if (!self::block_visible($instance, $courseid)) {
                continue;
            }
            $config = unserialize(base64_decode($instance->configdata), ['allowed_classes' => ['stdClass']]);
            if (!$config instanceof \stdClass) {
                continue;
            }
            $source = ['kind' => 'block', 'itemid' => (int)$instance->id];
            self::html($items, $cm, $source, $config->title ?? 'HTML', $config->text ?? '',
                '/course/view.php?id=' . $courseid . '#inst' . $instance->id);
            self::files($items, $cm, \context_block::instance($instance->id)->id, 'block_html', 'content', 0, $source);
        }
        return $items;
    }

    private static function block_visible(\stdClass $instance, int $courseid): bool {
        global $DB;
        if (!$DB->get_field('block', 'visible', ['name' => 'html'])) {
            return false;
        }
        $conditions = ['blockinstanceid' => $instance->id,
            'pagetype' => 'course-view-' . get_course($courseid)->format, 'subpage' => ''];
        $position = $DB->get_record('block_positions', $conditions +
            ['contextid' => \context_course::instance($courseid)->id]);
        if (!$position) {
            $position = $DB->get_record('block_positions', $conditions +
                ['contextid' => \context_system::instance()->id]);
        }
        return !$position || (bool)$position->visible;
    }

    private static function html(array &$items, \stdClass $cm, array $source, string $title, string $html, string $url): void {
        $text = native_document::text($html);
        if ($text === '') {
            return;
        }
        $identity = $source['kind'] . ':' . $source['itemid'];
        $docid = document_identity::make($cm->course, $cm->id, 'native', $identity);
        $metadata = ['source' => $source, 'url' => $url, 'text' => $text, 'author' => '', 'keywords' => []];
        $items[$docid] = (object)['docid' => $docid, 'courseid' => $cm->course, 'cmid' => $cm->id,
            'fileid' => 0, 'contenthash' => sha1($text), 'title' => \core_text::substr(strip_tags($title), 0, 255),
            'metadata' => json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)];
    }

    private static function files(array &$items, \stdClass $cm, int $contextid, string $component, string $area, $itemid, array $source): void {
        global $DB;
        foreach (get_file_storage()->get_area_files($contextid, $component, $area, $itemid, 'id', false) as $file) {
            if (!in_array(strtolower(pathinfo($file->get_filename(), PATHINFO_EXTENSION)), ['pdf', 'docx', 'pptx'], true)) {
                continue;
            }
            if ($component === 'mod_data') {
                $content = $DB->get_record('data_content', ['id' => $file->get_itemid()]);
                $entry = $content ? $DB->get_record('data_records', ['id' => $content->recordid, 'dataid' => $cm->instance]) : false;
                $field = $content ? $DB->get_record('data_fields', ['id' => $content->fieldid, 'dataid' => $cm->instance, 'type' => 'file']) : false;
                if (!$entry || !$field || !has_capability('mod/data:manageentries', \context_module::instance($cm->id), $entry->userid)) {
                    continue;
                }
            }
            $path = ($component === 'mod_data' ? $file->get_itemid() . ':' : '') . $file->get_filepath();
            if ($source['kind'] !== 'file') {
                $path = $component . ':' . $area . ':' . $file->get_itemid() . ':' . $path;
            }
            $docid = document_identity::make($cm->course, $cm->id, $path, $file->get_filename());
            $metadata = document_metadata::for_file($cm, $file);
            if ($source['kind'] !== 'file') {
                $metadata['source'] = $source;
            }
            $items[$docid] = (object)['docid' => $docid, 'courseid' => $cm->course, 'cmid' => $cm->id,
                'fileid' => $file->get_id(), 'contenthash' => $file->get_contenthash(),
                'title' => \core_text::substr($metadata['title'], 0, 255),
                'metadata' => json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)];
        }
    }

    /** Re-discover by stable identity, so deleted/reassigned items fail closed before cron. */
    public static function current(\stdClass $record) {
        $items = self::scope((int)$record->cmid);
        $current = $items[$record->docid] ?? false;
        return $current && (int)$current->courseid === (int)$record->courseid ? $current : false;
    }
}

<?php
defined('MOODLE_INTERNAL') || die();

/** Resolve scope from the parent Moodle page, before rendering can change globals. */
function local_rag_page_course(moodle_page $page = null) {
    global $PAGE;
    $page = $page ?? $PAGE;
    $course = $page->course;
    $context = $page->context;
    $pagetype = $page->pagetype;
    if ($context->contextlevel === CONTEXT_MODULE) {
        $cm = $page->cm;
        if (!$cm || (int)$context->instanceid !== (int)$cm->id || (int)$cm->course !== (int)$course->id ||
                strpos($pagetype, 'mod-' . $cm->modname . '-') !== 0) {
            return null;
        }
        // SITEID is permitted only for a real, readable native knowledge-base activity.
        if ((int)$course->id === (int)SITEID &&
                ($cm->modname !== 'data' || !\local_rag\access::can_read_module((int)$course->id, (int)$cm->id))) {
            return null;
        }
        return $course;
    }
    if ($context->contextlevel === CONTEXT_COURSE && (int)$course->id !== (int)SITEID &&
            (int)$context->instanceid === (int)$course->id && strpos($pagetype, 'course-') === 0) {
        return $course;
    }
    return null;
}

function local_rag_get_bootstrap(stdClass $course = null, moodle_page $page = null): array {
    global $USER;
    if (!\local_rag\configuration::enabled() || !isloggedin() || isguestuser()) {
        return ['enabled' => false];
    }
    $pagecourse = local_rag_page_course($page);
    if (!$pagecourse || ($course && (int)$course->id !== (int)$pagecourse->id) ||
            !\local_rag\access::can_use_course((int)$pagecourse->id)) {
        return ['enabled' => false];
    }
    $course = $pagecourse;
    return ['enabled' => true, 'courseid' => (int)$course->id,
        'endpoint' => (new moodle_url('/local/rag/ask.php'))->out(false),
        'userid' => (int)$USER->id,
        'historyendpoint' => (new moodle_url('/local/rag/history.php'))->out(false),
        'preferenceendpoint' => (new moodle_url('/local/rag/preference.php'))->out(false),
        'sesskey' => sesskey(), 'enabledpreference' => (bool)get_user_preferences('local_rag_enabled', 1),
        'maxLength' => 4000, 'rootid' => 'rag-chat'];
}

function local_rag_render_chat(moodle_page $page = null): string {
    global $PAGE, $OUTPUT;
    static $rendered = false;
    if ($rendered) {
        return '';
    }
    $page = $page ?? $PAGE;
    $bootstrap = local_rag_get_bootstrap(null, $page);
    if (empty($bootstrap['enabled'])) {
        return '';
    }
    $rendered = true;
    $page->requires->js_call_amd('block_ragchat/chat', 'init', [$bootstrap]);
    return $OUTPUT->render_from_template('block_ragchat/chat', $bootstrap);
}

function local_rag_register_assets(): string {
    global $PAGE;
    if (!empty(local_rag_get_bootstrap()['enabled'])) {
        $PAGE->requires->css('/blocks/ragchat/fonts.css');
        $PAGE->requires->css('/blocks/ragchat/styles.css');
    }
    return '';
}

function local_rag_footer_content(): string {
    global $OUTPUT;
    if (!\local_rag\configuration::enabled()) {
        return is_siteadmin() ? $OUTPUT->notification(get_string('missingkey', 'local_rag'), 'warning') : '';
    }
    $course = local_rag_page_course();
    $control = '';
    if ($course && \local_rag\course_sync::can_queue((int)$course->id)) {
        $control = html_writer::div(html_writer::link(
            new moodle_url('/local/rag/sync.php', ['courseid' => $course->id]),
            get_string('synccourse', 'local_rag'), ['class' => 'btn btn-secondary']), 'local-rag-course-sync');
    }
    return $control . local_rag_render_chat();
}

function local_rag_extend_navigation_user_settings($navigation, $user, $usercontext, $course, $coursecontext) {
    global $USER;
    if ($user->id != $USER->id || empty(local_rag_get_bootstrap($course)['enabled'])) {
        return;
    }
    $navigation->add(get_string('togglechat', 'local_rag'),
        new moodle_url('/local/rag/toggle.php', ['courseid' => $course->id]), navigation_node::TYPE_SETTING);
}

/** Course actions appear only in the same course/knowledge-base scope as the integration. */
function local_rag_extend_settings_navigation($settingsnav, $context = null) {
    $course = local_rag_page_course();
    if (!$course || !\local_rag\course_sync::can_queue((int)$course->id)) {
        return;
    }
    $node = $settingsnav->find('courseadmin', navigation_node::TYPE_COURSE) ?: $settingsnav;
    $node->add(get_string('synccourse', 'local_rag'),
        new moodle_url('/local/rag/sync.php', ['courseid' => $course->id]), navigation_node::TYPE_SETTING);
}


/** Shared head integration for both the 4.4+ hooks and earlier output callbacks. */
function local_rag_head_content(): string {
    global $PAGE;
    static $prepared = false;
    if ($prepared) {
        return '';
    }
    $prepared = true;
    if (\local_rag\configuration::enabled() && isloggedin() && !isguestuser() &&
            $PAGE->context->contextlevel === CONTEXT_COURSE && strpos($PAGE->pagetype, 'course-view-') === 0 &&
            has_capability('moodle/course:manageactivities', $PAGE->context)) {
        // HTML block edits have no universal content event; course rendering retains reconciliation.
        $task = new \local_rag\task\sync_course_content();
        $task->set_custom_data(['courseid' => (int)$PAGE->course->id]);
        \local_rag\task_queue::queue($task);
    }
    return local_rag_register_assets();
}

// The exact output hooks were introduced in 4.4 (the general 4.3 Hooks API is insufficient).
// Do not expose deprecated callbacks on modern core, including callback discovery caches.
if (!class_exists(\core\hook\output\before_standard_head_html_generation::class)) {
    function local_rag_before_standard_html_head(): string {
        return local_rag_head_content();
    }
}
if (!class_exists(\core\hook\output\before_footer_html_generation::class)) {
    function local_rag_before_footer(): string {
        global $CFG;
        $html = local_rag_footer_content();
        // 3.9 discards callback returns; 3.10–4.3 collect returned HTML.
        if ((int)$CFG->branch < 310) {
            echo $html;
            return '';
        }
        return $html;
    }
}

/** Moodle 3.0–3.2 has no head/footer callbacks; mount through its local navigation callback. */
function local_rag_extend_navigation($navigation) {
    global $CFG, $PAGE;
    static $scheduled = false;
    if ((int)$CFG->branch >= 33 || $scheduled) {
        return;
    }
    $bootstrap = local_rag_get_bootstrap();
    if (empty($bootstrap['enabled'])) {
        return;
    }
    $scheduled = true;
    local_rag_head_content();
    $PAGE->requires->js_call_amd('block_ragchat/legacy', 'init', [$bootstrap]);
}

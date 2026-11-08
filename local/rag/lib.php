<?php
defined('MOODLE_INTERNAL') || die();

/** Resolve scope from the parent Moodle page, before rendering can change globals. */
function local_rag_page_course(?moodle_page $page = null): ?stdClass {
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

function local_rag_get_bootstrap(?stdClass $course = null, ?moodle_page $page = null): array {
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
        'preferenceendpoint' => (new moodle_url('/local/rag/preference.php'))->out(false),
        'sesskey' => sesskey(), 'enabledpreference' => (bool)get_user_preferences('local_rag_enabled', 1),
        'maxLength' => 4000, 'rootid' => 'rag-chat'];
}

function local_rag_render_chat(?moodle_page $page = null): string {
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
        $PAGE->requires->css('/blocks/ragchat/styles.css');
    }
    return '';
}

function local_rag_footer_content(): string {
    global $OUTPUT;
    if (!\local_rag\configuration::enabled()) {
        return is_siteadmin() ? $OUTPUT->notification(get_string('missingkey', 'local_rag'), 'warning') : '';
    }
    return local_rag_render_chat();
}

function local_rag_extend_navigation_user_settings($navigation, $user, $usercontext, $course, $coursecontext): void {
    global $USER;
    if ($user->id != $USER->id || empty(local_rag_get_bootstrap($course)['enabled'])) {
        return;
    }
    $navigation->add(get_string('togglechat', 'local_rag'),
        new moodle_url('/local/rag/toggle.php', ['courseid' => $course->id]), navigation_node::TYPE_SETTING);
}

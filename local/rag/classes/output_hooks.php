<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();
final class output_hooks {
    public static function head(\core\hook\output\before_standard_head_html_generation $hook): void {
        global $CFG, $PAGE;
        if (configuration::enabled() && isloggedin() && !isguestuser() &&
                $PAGE->context->contextlevel === CONTEXT_COURSE && strpos($PAGE->pagetype, 'course-view-') === 0 &&
                has_capability('moodle/course:manageactivities', $PAGE->context)) {
            // Moodle 4.5 has no block HTML edit/delete events. Course render after editing queues a refresh.
            $task = new \local_rag\task\sync_course_content();
            $task->set_custom_data(['courseid' => (int)$PAGE->course->id]);
            \core\task\manager::queue_adhoc_task($task, true);
        }
        require_once($CFG->dirroot . '/local/rag/lib.php');
        $hook->add_html(local_rag_register_assets());
    }
    public static function footer(\core\hook\output\before_footer_html_generation $hook): void {
        global $CFG;
        require_once($CFG->dirroot . '/local/rag/lib.php');
        $hook->add_html(local_rag_footer_content());
    }
}

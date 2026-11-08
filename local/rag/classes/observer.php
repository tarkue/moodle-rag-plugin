<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();
final class observer {
    public static function resource_changed(\core\event\base $event) {
        if (!configuration::enabled() || !in_array($event->other['modulename'] ?? '', content_catalog::MODULES, true)) {
            return;
        }
        $task = new \local_rag\task\sync_resource();
        $task->set_custom_data(['cmid' => (int)$event->objectid]);
        \local_rag\task_queue::queue($task);
    }
    public static function entry_changed(\core\event\base $event) {
        if (!configuration::enabled()) {
            return;
        }
        $task = new \local_rag\task\sync_resource();
        $task->set_custom_data(['cmid' => (int)$event->contextinstanceid]);
        \local_rag\task_queue::queue($task);
    }
    public static function course_content_changed(\core\event\base $event) {
        if (!configuration::enabled() || !$event->courseid) {
            return;
        }
        $task = new \local_rag\task\sync_course_content();
        $task->set_custom_data(['courseid' => (int)$event->courseid]);
        \local_rag\task_queue::queue($task);
    }
    public static function course_deleted(\core\event\base $event) {
        global $DB;
        if (!configuration::enabled()) {
            return;
        }
        $DB->set_field('local_rag_documents', 'status', 'deleting', ['courseid' => $event->objectid]);
        $DB->set_field('local_rag_documents', 'nextattempt', 0, ['courseid' => $event->objectid]);
    }
}

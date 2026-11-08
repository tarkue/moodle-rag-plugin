<?php
namespace local_rag\task;
defined('MOODLE_INTERNAL') || die();

/** Full existing-course discovery requested explicitly by an authorized editor. */
final class sync_full_course extends \core\task\adhoc_task {
    public function execute() {
        // Throw when disabled so Moodle retains the task until configuration is restored.
        \local_rag\course_sync::execute((int)$this->get_custom_data()->courseid);
    }
}

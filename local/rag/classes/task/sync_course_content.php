<?php
namespace local_rag\task;
defined('MOODLE_INTERNAL') || die();
final class sync_course_content extends \core\task\adhoc_task {
    public function execute() {
        if (\local_rag\configuration::enabled()) {
            \local_rag\synchronizer::resource(-(int)$this->get_custom_data()->courseid);
        }
    }
}

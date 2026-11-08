<?php
namespace local_rag\task;
defined('MOODLE_INTERNAL') || die();
final class reconcile_documents extends \core\task\scheduled_task {
    public function get_name(): string {
        return get_string('reconciletask', 'local_rag');
    }
    public function execute() {
        if (\local_rag\configuration::enabled()) {
            \local_rag\synchronizer::reconcile();
        }
    }
}

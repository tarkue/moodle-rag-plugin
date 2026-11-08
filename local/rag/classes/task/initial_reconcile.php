<?php
namespace local_rag\task;
defined('MOODLE_INTERNAL') || die();
/** One-shot discovery after installation/upgrade; scheduled reconcile also handles later configuration. */
final class initial_reconcile extends \core\task\adhoc_task {
    public function execute() {
        if (\local_rag\configuration::enabled()) {
            \local_rag\synchronizer::reconcile();
        }
    }
}

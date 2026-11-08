<?php
defined('MOODLE_INTERNAL') || die();
function xmldb_local_rag_install(): void {
    \core\task\manager::queue_adhoc_task(new \local_rag\task\initial_reconcile(), true);
}

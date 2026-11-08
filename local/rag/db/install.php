<?php
defined('MOODLE_INTERNAL') || die();
function xmldb_local_rag_install() {
    \local_rag\task_queue::queue(new \local_rag\task\initial_reconcile());
}

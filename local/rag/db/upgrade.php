<?php
defined('MOODLE_INTERNAL') || die();
function xmldb_local_rag_upgrade($oldversion): bool {
    if ($oldversion < 2026110801) {
        // Native source descriptors use existing metadata; no destructive schema migration.
        \core\task\manager::queue_adhoc_task(new \local_rag\task\initial_reconcile(), true);
        upgrade_plugin_savepoint(true, 2026110801, 'local', 'rag');
    }
    return true;
}

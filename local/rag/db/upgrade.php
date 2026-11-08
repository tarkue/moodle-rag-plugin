<?php
defined('MOODLE_INTERNAL') || die();
function xmldb_local_rag_upgrade($oldversion): bool {
    global $DB;
    if ($oldversion < 2026110801) {
        // Native source descriptors use existing metadata; no destructive schema migration.
        \local_rag\task_queue::queue(new \local_rag\task\initial_reconcile());
        upgrade_plugin_savepoint(true, 2026110801, 'local', 'rag');
    }
    if ($oldversion < 2026110803) {
        $dbman = $DB->get_manager();
        $table = new xmldb_table('local_rag_budget');
        $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
        $table->add_field('bucket', XMLDB_TYPE_CHAR, '100', null, XMLDB_NOTNULL, null, null);
        $table->add_field('state', XMLDB_TYPE_TEXT, null, null, XMLDB_NOTNULL, null, null);
        $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_key('primary', XMLDB_KEY_PRIMARY, array('id'));
        $table->add_index('bucket_unique', XMLDB_INDEX_UNIQUE, array('bucket'));
        $table->add_index('modified', XMLDB_INDEX_NOTUNIQUE, array('timemodified'));
        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }
        upgrade_plugin_savepoint(true, 2026110803, 'local', 'rag');
    }
    return true;
}

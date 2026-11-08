<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();

/** Atomic task deduplication, including Moodle versions without native dedup support. */
final class task_queue {
    public static function queue(\core\task\adhoc_task $task): bool {
        global $DB;
        $record = \core\task\manager::record_from_adhoc_task($task);
        $key = sha1($record->classname . "\0" . $record->customdata . "\0" . ($record->userid ?? 0));
        $lock = \core\lock\lock_config::get_lock_factory('local_rag')->get_lock('queue-task-' . $key, 10);
        if (!$lock) {
            throw new \moodle_exception('locktimeout', 'local_rag');
        }
        try {
            $conditions = ['classname' => $record->classname, 'customdata' => $record->customdata];
            if (property_exists($record, 'userid')) {
                $conditions['userid'] = $record->userid;
            }
            $sql = 'classname = :classname AND ' . $DB->sql_compare_text('customdata') . ' = :customdata';
            if (array_key_exists('userid', $conditions)) {
                $sql .= ' AND ' . ($record->userid === null ? 'userid IS NULL' : 'userid = :userid');
                if ($record->userid === null) {
                    unset($conditions['userid']);
                }
            }
            if ($DB->record_exists_select('task_adhoc', $sql, $conditions)) {
                return false;
            }
            // A single argument is the supported Moodle 3.0 task-manager contract.
            \core\task\manager::queue_adhoc_task($task);
            return true;
        } finally {
            $lock->release();
        }
    }
}

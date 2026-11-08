<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();

/** Manual course discovery uses the same catalogue, locks and retry state as cron. */
final class course_sync {
    public static function can_queue(int $courseid): bool {
        return configuration::enabled() && access::can_use_course($courseid) &&
            has_capability('moodle/course:update', \context_course::instance($courseid));
    }

    public static function queue(int $courseid) {
        configuration::require_enabled();
        access::require_course($courseid);
        require_capability('moodle/course:update', \context_course::instance($courseid));
        $task = new \local_rag\task\sync_full_course();
        $task->set_custom_data(['courseid' => $courseid]);
        $factory = \core\lock\lock_config::get_lock_factory('local_rag');
        $lock = $factory->get_lock('queue-course-' . $courseid, 10);
        if (!$lock) {
            throw new \moodle_exception('locktimeout', 'local_rag');
        }
        try {
            \local_rag\task_queue::queue($task);
        } finally {
            $lock->release();
        }
    }

    public static function execute(int $courseid) {
        global $DB;
        configuration::require_enabled();
        $scopes = $DB->get_fieldset_sql("SELECT cm.id FROM {course_modules} cm
            JOIN {modules} m ON m.id = cm.module WHERE cm.course = :courseid
            AND m.name IN ('resource', 'folder', 'data', 'page', 'book', 'label')", ['courseid' => $courseid]);
        $known = $DB->get_fieldset_select('local_rag_documents', 'DISTINCT cmid',
            'courseid = :courseid', ['courseid' => $courseid]);
        foreach (array_unique(array_merge([-$courseid], $scopes, $known)) as $scope) {
            synchronizer::resource((int)$scope);
        }
    }

    public static function status(int $courseid): array {
        global $DB;
        $queued = $DB->record_exists_select('task_adhoc',
            'classname = :classname AND ' . $DB->sql_compare_text('customdata') . ' = :customdata',
            ['classname' => '\\local_rag\\task\\sync_full_course', 'customdata' => json_encode(['courseid' => $courseid])]);
        $counts = ['indexed' => 0, 'pending' => 0, 'error' => 0, 'deleting' => 0];
        $last = 0;
        foreach ($DB->get_records('local_rag_documents', ['courseid' => $courseid]) as $record) {
            if (isset($counts[$record->status])) {
                $counts[$record->status]++;
            }
            $last = max($last, (int)$record->timemodified);
        }
        return ['queued' => $queued, 'counts' => $counts, 'last' => $last];
    }
}

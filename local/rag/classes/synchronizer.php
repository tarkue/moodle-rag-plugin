<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();

final class synchronizer {
    public static function resource(int $cmid): void {
        global $DB;
        configuration::require_enabled();
        $factory = \core\lock\lock_config::get_lock_factory('local_rag');
        $lock = $factory->get_lock('resource-' . $cmid, 10);
        if (!$lock) {
            throw new \moodle_exception('locktimeout', 'local_rag');
        }
        try {
            self::discover($cmid);
            self::process($cmid);
        } finally {
            $lock->release();
        }
    }
    private static function discover(int $cmid): void {
        global $DB;
        $seen = [];
        foreach (content_catalog::scope($cmid) as $candidate) {
            $seen[$candidate->docid] = true;
            self::remember($candidate);
        }
        foreach ($DB->get_records('local_rag_documents', ['cmid' => $cmid]) as $record) {
            if (!isset($seen[$record->docid]) && $record->status !== 'deleting') {
                $DB->update_record('local_rag_documents', (object)['id' => $record->id, 'status' => 'deleting',
                    'nextattempt' => 0, 'timemodified' => time()]);
            }
        }
    }
    private static function remember(\stdClass $candidate): void {
        global $DB;
        $record = $DB->get_record('local_rag_documents', ['docid' => $candidate->docid]);
        if ($record && $record->contenthash === $candidate->contenthash &&
                (int)$record->fileid === (int)$candidate->fileid && $record->title === $candidate->title &&
                $record->metadata === $candidate->metadata && $record->status !== 'deleting') {
            return;
        }
        $candidate->status = 'pending';
        $candidate->attempts = 0;
        $candidate->nextattempt = 0;
        $candidate->lasterror = '';
        $candidate->timemodified = time();
        if ($record) {
            $candidate->id = $record->id;
            $DB->update_record('local_rag_documents', $candidate);
            return;
        }
        $DB->insert_record('local_rag_documents', $candidate);
    }
    private static function process(int $cmid): void {
        global $DB;
        $records = $DB->get_records_select('local_rag_documents',
            "cmid = :cmid AND status <> 'indexed' AND nextattempt <= :now", ['cmid' => $cmid, 'now' => time()]);
        foreach ($records as $record) {
            self::transfer($record);
        }
    }
    private static function transfer(\stdClass $record): void {
        global $DB;
        configuration::require_enabled();
        try {
            $client = new service_client();
            if ($record->status === 'deleting') {
                $client->request('DELETE', '/ingest/' . rawurlencode($record->docid));
                $DB->delete_records('local_rag_documents', ['id' => $record->id]);
                return;
            }
            $current = content_catalog::current($record);
            if (!$current) {
                $record->status = 'deleting';
                $DB->update_record('local_rag_documents', $record);
                return;
            }
            if ((int)$record->fileid === 0) {
                $metadata = json_decode($current->metadata, true, 512, JSON_THROW_ON_ERROR);
                $client->upload_native($record, $metadata['text']);
            } else {
                $client->upload($record, get_file_storage()->get_file_by_id($current->fileid));
            }
            $record->status = 'indexed';
            $record->attempts = 0;
            $record->lasterror = '';
            $record->nextattempt = 0;
        } catch (\Throwable $error) {
            $record->attempts++;
            $record->nextattempt = time() + min(86400, 60 * (2 ** min($record->attempts, 10)));
            $record->lasterror = 'Transfer failed; automatic retry scheduled';
            if ($record->status !== 'deleting') {
                $record->status = 'error';
            }
        }
        $fresh = $DB->get_record('local_rag_documents', ['id' => $record->id]);
        if (!$fresh || ($fresh->status === 'deleting' && $record->status !== 'deleting') ||
                $fresh->contenthash !== $record->contenthash || (int)$fresh->fileid !== (int)$record->fileid) {
            return;
        }
        $record->timemodified = time();
        $DB->update_record('local_rag_documents', $record);
    }
    public static function retry(): void {
        global $DB;
        configuration::require_enabled();
        $cmids = $DB->get_fieldset_select('local_rag_documents', 'DISTINCT cmid',
            "status <> 'indexed' AND nextattempt <= :now", ['now' => time()]);
        foreach ($cmids as $cmid) {
            self::resource((int)$cmid);
        }
    }
    public static function reconcile(): void {
        global $DB;
        configuration::require_enabled();
        $cmids = $DB->get_fieldset_sql("SELECT cm.id FROM {course_modules} cm JOIN {modules} m ON m.id = cm.module
            WHERE m.name IN ('resource', 'folder', 'data', 'page', 'book', 'label')");
        $courses = array_map(static fn($id) => -(int)$id, $DB->get_fieldset_select('course', 'id', '1 = 1'));
        $cmids = array_merge($cmids, $courses);
        $known = $DB->get_fieldset_select('local_rag_documents', 'DISTINCT cmid', '1 = 1');
        foreach (array_unique(array_merge($cmids, $known)) as $cmid) {
            self::resource((int)$cmid);
        }
    }
}

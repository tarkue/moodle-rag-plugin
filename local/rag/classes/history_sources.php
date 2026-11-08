<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();

/** Restores only current, readable citations; browser-stored URLs are never trusted. */
final class history_sources {
    public static function validate(array $sources): array {
        if (count($sources) > 100) {
            throw new \invalid_parameter_exception('Too many history sources');
        }
        foreach ($sources as $source) {
            if (!is_array($source) || !is_string($source['doc_id'] ?? null) ||
                    strlen($source['doc_id']) > 128 || $source['doc_id'] === '' ||
                    !is_string($source['contenthash'] ?? null) || !preg_match('/\A[a-f0-9]{40}\z/D', $source['contenthash'])) {
                throw new \invalid_parameter_exception('Invalid history source');
            }
        }
        return $sources;
    }

    public static function current(int $courseid, array $sources): array {
        global $DB;
        self::validate($sources);
        access::require_course($courseid);
        budget::consume('history', $courseid);
        if (!$sources) {
            return ['sources' => []];
        }
        $ids = array_unique(array_column($sources, 'doc_id'));
        $records = $DB->get_records_list('local_rag_documents', 'docid', $ids);
        $byid = [];
        foreach ($records as $record) {
            if ((int)$record->courseid === $courseid && $record->status === 'indexed') {
                $byid[$record->docid] = $record;
            }
        }
        $verified = [];
        foreach ($sources as $source) {
            $record = $byid[$source['doc_id']] ?? null;
            if (!$record || !hash_equals($record->contenthash, $source['contenthash']) ||
                    !access::can_read_document($record) || ($url = access::source_url($record)) === '') {
                continue;
            }
            $verified[] = ['doc_id' => $record->docid, 'contenthash' => $record->contenthash,
                'doc' => $record->title, 'url' => $url];
        }
        return ['sources' => $verified];
    }
}

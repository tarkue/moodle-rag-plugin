<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();
final class chat {
    public static function ask(int $courseid, string $query): array {
        global $USER;
        configuration::require_enabled();
        access::require_course($courseid);
        $query = trim($query);
        if (\core_text::strlen($query) < 3 || \core_text::strlen($query) > 4000) {
            throw new \invalid_parameter_exception('Question must contain 3 to 4000 characters');
        }
        $allowed = [];
        foreach (access::allowed_documents($courseid) as $document) {
            $allowed[$document->docid] = $document;
        }
        if (!$allowed) {
            return ['answer' => get_string('nocontext', 'local_rag'), 'sources' => []];
        }
        $payload = ['query' => $query, 'course_id' => (string)$courseid,
            'user_id' => (string)$USER->id, 'allowed_doc_ids' => array_keys($allowed)];
        // The model call can be slow; other requests must retain access to this session.
        \core\session\manager::write_close();
        $response = (new service_client())->request('POST', '/ask', $payload);
        $sources = [];
        foreach ($response['sources'] ?? [] as $source) {
            $id = $source['doc_id'] ?? '';
            // Reject the entire answer if the service violates the permission scope.
            if (!isset($allowed[$id]) || ($url = access::source_url($allowed[$id])) === '') {
                throw new \moodle_exception('serviceerror', 'local_rag', '', 502);
            }
            $sources[] = ['doc_id' => $id, 'contenthash' => $allowed[$id]->contenthash, 'doc' => $allowed[$id]->title, 'url' => $url,
                'page' => (int)($source['page'] ?? 0), 'fragment' => (string)($source['fragment'] ?? '')];
        }
        return ['answer' => (string)($response['answer'] ?? ''), 'sources' => $sources];
    }
}

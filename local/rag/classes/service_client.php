<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();

final class service_client {
    public function request(string $method, string $path, ?array $payload = null, bool $admin = false): array {
        configuration::require_enabled();
        $headers = ['Accept: application/json', 'X-Service-Token: ' . configuration::token()];
        if ($admin) {
            $headers[] = 'X-Admin-Token: ' . configuration::admin_token();
        }
        $body = null;
        if ($payload !== null) {
            $headers[] = 'Content-Type: application/json';
            $body = json_encode($payload, JSON_THROW_ON_ERROR);
        }
        return $this->execute($method, $path, $headers, $body);
    }
    public function upload(\stdClass $record, \stored_file $file): array {
        configuration::require_enabled();
        $temporary = $file->copy_content_to_temp();
        try {
            $upload = new \CURLFile($temporary, $file->get_mimetype(), $file->get_filename());
            return $this->execute('POST', self::upload_path($record),
                ['X-Service-Token: ' . configuration::token()], ['file' => $upload]);
        } finally {
            @unlink($temporary);
        }
    }
    public function upload_native(\stdClass $record, string $text): array {
        configuration::require_enabled();
        $temporary = native_document::temporary_docx($text);
        try {
            return $this->execute('POST', self::upload_path($record),
                ['X-Service-Token: ' . configuration::token()],
                ['file' => new \CURLFile($temporary,
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'native.docx')]);
        } finally {
            @unlink($temporary);
        }
    }
    public static function upload_path(\stdClass $record): string {
        $metadata = json_decode($record->metadata ?? '{}', true) ?: [];
        $fields = ['doc_id' => $record->docid, 'course_id' => (string)$record->courseid,
            'title' => $record->title, 'author' => $metadata['author'] ?? ''];
        if (!empty($metadata['publish_date'])) {
            $fields['publish_date'] = $metadata['publish_date'];
        }
        // Moodle's HTML separator must never enter a server-to-server HTTP URL.
        $query = http_build_query($fields, '', '&', PHP_QUERY_RFC3986);
        foreach ($metadata['keywords'] ?? [] as $keyword) {
            $query .= '&keywords=' . rawurlencode($keyword);
        }
        return '/ingest/file?' . $query;
    }
    private function execute(string $method, string $path, array $headers, $body): array {
        configuration::require_enabled();
        $base = configuration::url();
        $url = $base . (substr($base, -4) === '/api' ? '' : '/api') . $path;
        $handle = curl_init($url);
        $options = [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 180,
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS];
        if ($body !== null) {
            $options[CURLOPT_POSTFIELDS] = $body;
        }
        curl_setopt_array($handle, $options);
        $response = curl_exec($handle);
        $status = curl_getinfo($handle, CURLINFO_HTTP_CODE);
        curl_close($handle);
        if ($response === false || $status < 200 || $status >= 300) {
            // Never log request headers, response bodies, URLs, or secrets.
            throw new \moodle_exception('serviceerror', 'local_rag', '', (int)$status);
        }
        $decoded = json_decode($response, true);
        if (!is_array($decoded)) {
            throw new \moodle_exception('serviceerror', 'local_rag', '', $status);
        }
        return $decoded;
    }
}

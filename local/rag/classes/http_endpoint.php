<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();
final class http_endpoint {
    public static function run(callable $handler): void {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        try {
            configuration::require_enabled();
            require_login();
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                http_response_code(405);
                echo json_encode(['error' => 'methodnotallowed']);
                return;
            }
            $raw = file_get_contents('php://input', false, null, 0, 65537);
            if (strlen($raw) > 65536) {
                throw new \invalid_parameter_exception('Request too large');
            }
            $payload = json_decode($raw, true);
            if (!is_array($payload)) {
                $payload = $_POST;
            }
            if (!confirm_sesskey($payload['sesskey'] ?? '')) {
                throw new \moodle_exception('invalidsesskey');
            }
            echo json_encode($handler($payload), JSON_THROW_ON_ERROR);
        } catch (\Throwable $error) {
            $status = $error instanceof \invalid_parameter_exception ? 400 : 403;
            if ($error instanceof \moodle_exception && in_array($error->errorcode, ['unavailable', 'adminunavailable'], true)) {
                $status = 503;
            }
            if ($error instanceof \moodle_exception && $error->errorcode === 'serviceerror') {
                $status = 502;
            }
            http_response_code($status);
            echo json_encode(['error' => 'requestfailed', 'message' => get_string('requestfailed', 'local_rag')]);
        }
    }
}

<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();
final class http_endpoint {
    public static function run(callable $handler) {
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
            if (isset($_SERVER['CONTENT_LENGTH']) && (int)$_SERVER['CONTENT_LENGTH'] > 65536) {
                throw new \invalid_parameter_exception('Request too large');
            }
            $raw = file_get_contents('php://input', false, null, 0, 65537);
            if ($raw === false || strlen($raw) > 65536) {
                throw new \invalid_parameter_exception('Request too large');
            }
            $payload = json_decode($raw, true);
            if (!is_array($payload)) {
                $payload = $_POST;
            }
            if (!confirm_sesskey($payload['sesskey'] ?? '')) {
                throw new \moodle_exception('invalidsesskey');
            }
            echo json_codec::encode($handler($payload));
        } catch (\Throwable $error) {
            if ($error instanceof budget_exceeded) {
                http_response_code(429);
                header('Retry-After: ' . $error->retryafter);
                echo json_encode(['error' => 'ratelimited',
                    'message' => get_string('ratelimited', 'local_rag', $error->retryafter)]);
                return;
            }
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

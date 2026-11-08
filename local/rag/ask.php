<?php
define('AJAX_SCRIPT', true);
require_once(__DIR__ . '/../../config.php');
\local_rag\http_endpoint::run(static function(array $payload): array {
    if (!is_string($payload['query'] ?? null) ||
            filter_var($payload['courseid'] ?? null, FILTER_VALIDATE_INT) === false) {
        throw new invalid_parameter_exception('Invalid question or course');
    }
    return \local_rag\chat::ask((int)($payload['courseid'] ?? 0), (string)($payload['query'] ?? ''));
});

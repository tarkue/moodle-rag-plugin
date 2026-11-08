<?php
define('AJAX_SCRIPT', true);
require_once(__DIR__ . '/../../config.php');
\local_rag\http_endpoint::run(static function(array $payload): array {
    if (filter_var($payload['courseid'] ?? null, FILTER_VALIDATE_INT) === false ||
            !is_array($payload['sources'] ?? null)) {
        throw new invalid_parameter_exception('Invalid history source request');
    }
    return \local_rag\history_sources::current((int)$payload['courseid'], $payload['sources']);
});

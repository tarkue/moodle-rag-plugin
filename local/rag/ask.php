<?php
define('AJAX_SCRIPT', true);
require_once(__DIR__ . '/../../config.php');
\local_rag\http_endpoint::run(static function(array $payload): array {
    if (!is_string($payload['query'] ?? null) ||
            filter_var($payload['courseid'] ?? null, FILTER_VALIDATE_INT) === false) {
        throw new invalid_parameter_exception('Invalid question or course');
    }
    $courseid = (int)$payload['courseid'];
    \local_rag\access::require_course($courseid);
    $length = \core_text::strlen(trim($payload['query']));
    if ($length < 3 || $length > 4000) {
        throw new invalid_parameter_exception('Invalid question length');
    }
    $lease = \local_rag\budget::consume('ask', $courseid, true);
    try {
        return \local_rag\chat::ask($courseid, $payload['query']);
    } finally {
        \local_rag\budget::release($lease);
    }
});

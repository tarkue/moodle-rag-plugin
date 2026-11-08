<?php
define('AJAX_SCRIPT', true);
require_once(__DIR__ . '/../../config.php');
\local_rag\http_endpoint::run(static function(array $payload): array {
    if (isguestuser()) {
        throw new required_capability_exception(context_system::instance(), 'local/rag:use', 'nopermissions', '');
    }
    $enabled = !empty($payload['enabled']);
    set_user_preference('local_rag_enabled', (int)$enabled);
    return ['enabled' => $enabled];
});

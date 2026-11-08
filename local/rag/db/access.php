<?php
defined('MOODLE_INTERNAL') || die();
$capabilities = [
    'local/rag:use' => ['captype' => 'read', 'contextlevel' => CONTEXT_COURSE,
        'archetypes' => ['frontpage' => CAP_ALLOW, 'student' => CAP_ALLOW, 'teacher' => CAP_ALLOW, 'editingteacher' => CAP_ALLOW, 'manager' => CAP_ALLOW]],
    'local/rag:manage' => ['captype' => 'write', 'riskbitmask' => RISK_CONFIG, 'contextlevel' => CONTEXT_SYSTEM,
        'archetypes' => ['manager' => CAP_ALLOW]],
];

<?php
defined('MOODLE_INTERNAL') || die();
$capabilities = [
    'block/ragchat:addinstance' => ['captype' => 'write', 'contextlevel' => CONTEXT_BLOCK,
        'archetypes' => ['editingteacher' => CAP_ALLOW, 'manager' => CAP_ALLOW], 'clonepermissionsfrom' => 'moodle/site:manageblocks'],
];

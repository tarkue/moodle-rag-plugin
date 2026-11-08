<?php
defined('MOODLE_INTERNAL') || die();
$callbacks = [];
// Moodle 4.3 has a hook manager, but these output hooks arrive in 4.4.
if (class_exists(\core\hook\output\before_standard_head_html_generation::class) &&
        class_exists(\core\hook\output\before_footer_html_generation::class)) {
    $callbacks = [
        ['hook' => \core\hook\output\before_standard_head_html_generation::class,
            'callback' => '\\local_rag\\output_hooks::head'],
        ['hook' => \core\hook\output\before_footer_html_generation::class,
            'callback' => '\\local_rag\\output_hooks::footer'],
    ];
}

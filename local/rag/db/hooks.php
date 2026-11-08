<?php
defined('MOODLE_INTERNAL') || die();
$callbacks = [
    ['hook' => \core\hook\output\before_standard_head_html_generation::class,
        'callback' => [\local_rag\output_hooks::class, 'head']],
    ['hook' => \core\hook\output\before_footer_html_generation::class,
        'callback' => [\local_rag\output_hooks::class, 'footer']],
];

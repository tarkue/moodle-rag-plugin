<?php
// This file is part of Moodle - http://moodle.org/.
defined('MOODLE_INTERNAL') || die();

/** Load Boost's supported preset, followed by the INZHE design system. */
function theme_inzhe_get_main_scss_content($theme) {
    global $CFG;
    require_once($CFG->dirroot . '/theme/boost/lib.php');
    $boost = theme_config::load('boost');
    return theme_boost_get_main_scss_content($boost) . "\n" .
        file_get_contents(__DIR__ . '/scss/inzhe.scss');
}

/** Set Bootstrap tokens before the Boost preset is compiled. */
function theme_inzhe_get_pre_scss($theme) {
    return '$primary: #008292; $body-color: #1e1e1e; $body-bg: #fff; ' .
        '$font-family-sans-serif: Inter, Arial, sans-serif; $border-radius: .5rem; ' .
        '$link-color: #006f7d; $headings-color: #30394a; $navbar-height: 96px;';
}

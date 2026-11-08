<?php
// This file is part of Moodle - http://moodle.org/.
defined('MOODLE_INTERNAL') || die();
require_once(__DIR__ . '/lib.php');
$THEME->name = 'inzhe';
$THEME->parents = ['boost'];
$THEME->sheets = [];
$THEME->editor_sheets = [];
$THEME->usefallback = true;
$THEME->yuicssmodules = [];
$THEME->rendererfactory = 'theme_overridden_renderer_factory';
$THEME->requiredblocks = '';
$THEME->addblockposition = BLOCK_ADDBLOCK_POSITION_FLATNAV;
$THEME->iconsystem = \core\output\icon_system::FONTAWESOME;
$THEME->haseditswitch = true;
$THEME->usescourseindex = true;
$THEME->enable_dock = false;
$THEME->activityheaderconfig = ['notitle' => true];
$THEME->scss = function($theme) {
    return theme_inzhe_get_main_scss_content($theme);
};
$THEME->prescsscallback = 'theme_inzhe_get_pre_scss';

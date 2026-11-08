<?php
// This file is part of Moodle - http://moodle.org/.
namespace theme_inzhe\privacy;

defined('MOODLE_INTERNAL') || die();

/** This presentation-only theme has no storage of its own. */
class provider implements \core_privacy\local\metadata\null_provider {
    public static function get_reason(): string {
        return 'privacy:metadata';
    }
}

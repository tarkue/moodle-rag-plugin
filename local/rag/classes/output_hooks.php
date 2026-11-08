<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();
final class output_hooks {
    public static function head(\core\hook\output\before_standard_head_html_generation $hook) {
        global $CFG;
        require_once($CFG->dirroot . '/local/rag/lib.php');
        $hook->add_html(local_rag_head_content());
    }
    public static function footer(\core\hook\output\before_footer_html_generation $hook) {
        global $CFG;
        require_once($CFG->dirroot . '/local/rag/lib.php');
        $hook->add_html(local_rag_footer_content());
    }
}

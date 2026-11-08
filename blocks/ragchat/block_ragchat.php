<?php
defined('MOODLE_INTERNAL') || die();
class block_ragchat extends block_base {
    public function init() {
        $this->title = get_string('pluginname', 'block_ragchat');
    }
    public function applicable_formats() {
        return ['course-view' => true, 'mod' => true];
    }
    public function get_content() {
        global $CFG;
        require_once($CFG->dirroot . '/local/rag/lib.php');
        if (empty(local_rag_get_bootstrap(null, $this->page)['enabled'])) {
            return (object)['text' => '', 'footer' => ''];
        }
        if ($this->content !== null) {
            return $this->content;
        }
        $this->content = (object)['text' => local_rag_render_chat($this->page), 'footer' => ''];
        return $this->content;
    }
    public function hide_header() {
        return true;
    }
}

<?php
require_once(__DIR__ . '/../../config.php');
require_once(__DIR__ . '/lib.php');
\local_rag\configuration::require_enabled();
$course = \local_rag\access::require_course(required_param('courseid', PARAM_INT));
$PAGE->set_url(new moodle_url('/local/rag/toggle.php', ['courseid' => $course->id]));
$PAGE->set_context(context_course::instance($course->id));
$PAGE->set_title(get_string('togglechat', 'local_rag'));
if (data_submitted() && confirm_sesskey()) {
    set_user_preference('local_rag_enabled', optional_param('enabled', 0, PARAM_BOOL));
    redirect(new moodle_url('/course/view.php', ['id' => $course->id]));
}
echo $OUTPUT->header();
echo $OUTPUT->heading(get_string('togglechat', 'local_rag'));
echo html_writer::start_tag('form', ['method' => 'post']);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'sesskey', 'value' => sesskey()]);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'courseid', 'value' => $course->id]);
echo html_writer::checkbox('enabled', 1, (bool)get_user_preferences('local_rag_enabled', 1), get_string('chatenabled', 'local_rag'));
echo html_writer::tag('button', get_string('savechanges'), ['type' => 'submit', 'class' => 'btn btn-primary']);
echo html_writer::end_tag('form');
echo $OUTPUT->footer();

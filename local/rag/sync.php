<?php
require_once(__DIR__ . '/../../config.php');
\local_rag\configuration::require_enabled();
$course = \local_rag\access::require_course(required_param('courseid', PARAM_INT));
require_capability('moodle/course:update', context_course::instance($course->id));
$url = new moodle_url('/local/rag/sync.php', ['courseid' => $course->id]);
$PAGE->set_url($url);
$PAGE->set_context(context_course::instance($course->id));
$PAGE->set_pagelayout('incourse');
$PAGE->requires->css('/local/rag/styles/sync.css');
$PAGE->set_title(get_string('synccourse', 'local_rag'));
$PAGE->set_heading(format_string($course->fullname));
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_sesskey();
    try {
        \local_rag\budget::consume('sync', (int)$course->id);
        \local_rag\course_sync::queue((int)$course->id);
    } catch (\local_rag\budget_exceeded $error) {
        http_response_code(429);
        header('Retry-After: ' . $error->retryafter);
        header('Cache-Control: no-store');
        echo $OUTPUT->header();
        echo html_writer::start_tag('div', ['class' => 'local-rag-sync', 'data-rag-sync' => '']);
        echo $OUTPUT->notification(get_string('ratelimited', 'local_rag', $error->retryafter), 'warning');
        echo html_writer::end_tag('div');
        echo $OUTPUT->footer();
        exit;
    }
    redirect($url, get_string('syncqueued', 'local_rag'), null, 'info');
}
$status = \local_rag\course_sync::status((int)$course->id);
echo $OUTPUT->header();
echo html_writer::start_tag('div', ['class' => 'local-rag-sync', 'data-rag-sync' => '']);
echo $OUTPUT->heading(get_string('synccourse', 'local_rag'));
echo html_writer::tag('p', get_string('syncexplanation', 'local_rag'));
echo html_writer::start_tag('div', ['role' => 'status', 'aria-live' => 'polite']);
echo html_writer::tag('p', get_string($status['queued'] ? 'syncwaiting' : 'syncnotqueued', 'local_rag'));
$table = new html_table();
$table->head = [get_string('status'), get_string('syncdocuments', 'local_rag')];
foreach ($status['counts'] as $state => $count) {
    $table->data[] = [get_string('syncstate' . $state, 'local_rag'), $count];
}
echo html_writer::table($table);
echo html_writer::tag('p', get_string('synclastchange', 'local_rag',
    $status['last'] ? userdate($status['last']) : get_string('syncnever', 'local_rag')));
echo html_writer::end_tag('div');
echo $OUTPUT->single_button($url, get_string('syncsubmit', 'local_rag'), 'post');
echo html_writer::tag('p', html_writer::link($url, get_string('syncrefresh', 'local_rag')));
echo html_writer::end_tag('div');
echo $OUTPUT->footer();

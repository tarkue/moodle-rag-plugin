<?php
require_once(__DIR__ . '/../../config.php');
require_once($CFG->libdir . '/adminlib.php');
\local_rag\configuration::require_enabled();
require_login();
require_capability('local/rag:manage', context_system::instance());
admin_externalpage_setup('local_rag_library');
$client = new \local_rag\service_client();
$form = new \local_rag\form\model_settings();
$notice = '';
try {
    if ($submitted = $form->get_data()) {
        require_sesskey();
        $updates = [];
        foreach (\local_rag\form\model_settings::FIELDS as $name) {
            $updates[$name] = $submitted->$name;
        }
        if (!empty($submitted->OPENROUTER_API_KEY)) {
            $updates['OPENROUTER_API_KEY'] = $submitted->OPENROUTER_API_KEY;
        }
        $result = $client->request('PATCH', '/config', $updates, true);
        $notice = get_string(!empty($result['reindex_required']) ? 'savedreindex' : 'saved', 'local_rag');
    }
    if (optional_param('reindex', 0, PARAM_BOOL) && data_submitted()) {
        require_sesskey();
        // Re-upload Moodle File API bytes; private URLs cannot be fetched by the backend.
        $DB->set_field('local_rag_documents', 'status', 'pending');
        $DB->set_field('local_rag_documents', 'nextattempt', 0);
        $notice = get_string('reindexqueued', 'local_rag');
    }
    $config = $client->request('GET', '/config', null, true);
    $form->set_data((object)($config['config'] ?? $config));
} catch (Throwable $error) {
    $notice = get_string('adminunavailable', 'local_rag');
}
echo $OUTPUT->header();
echo $OUTPUT->heading(get_string('library', 'local_rag'));
if ($notice !== '') {
    echo $OUTPUT->notification($notice, 'info');
}
$form->display();
echo html_writer::start_tag('form', ['method' => 'post']);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'sesskey', 'value' => sesskey()]);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'reindex', 'value' => 1]);
echo html_writer::tag('button', get_string('reindex', 'local_rag'), ['type' => 'submit', 'class' => 'btn btn-secondary']);
echo html_writer::end_tag('form');
$table = new html_table();
$table->head = [get_string('course'), get_string('name'), get_string('status'), get_string('attempts', 'local_rag')];
foreach ($DB->get_records('local_rag_documents', null, 'courseid, title', '*', 0, 500) as $record) {
    $table->data[] = [(int)$record->courseid, s($record->title), s($record->status), (int)$record->attempts];
}
echo html_writer::table($table);
echo $OUTPUT->footer();

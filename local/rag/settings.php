<?php
defined('MOODLE_INTERNAL') || die();
if ($hassiteconfig) {
    $settings = new admin_settingpage('local_rag', get_string('pluginname', 'local_rag'));
    $settings->add(new admin_setting_heading('local_rag/connection', get_string('connection', 'local_rag'),
        get_string('connection_help', 'local_rag')));
    $settings->add(new admin_setting_configtext('local_rag/serviceurl', get_string('serviceurl', 'local_rag'), '', '', PARAM_URL));
    $ADMIN->add('localplugins', $settings);
}
if (\local_rag\configuration::enabled()) {
    $ADMIN->add($hassiteconfig ? 'localplugins' : 'root', new admin_externalpage('local_rag_library', get_string('library', 'local_rag'),
        new moodle_url('/local/rag/admin.php'), 'local/rag:manage'));
}

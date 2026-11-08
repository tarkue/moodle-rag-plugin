<?php
defined('MOODLE_INTERNAL') || die();
$observers = [
    ['eventname' => '\\mod_book\\event\\chapter_created', 'callback' => '\\local_rag\\observer::entry_changed'],
    ['eventname' => '\\mod_book\\event\\chapter_updated', 'callback' => '\\local_rag\\observer::entry_changed'],
    ['eventname' => '\\mod_book\\event\\chapter_deleted', 'callback' => '\\local_rag\\observer::entry_changed'],
    ['eventname' => '\\core\\event\\course_section_created', 'callback' => '\\local_rag\\observer::course_content_changed'],
    ['eventname' => '\\core\\event\\course_section_updated', 'callback' => '\\local_rag\\observer::course_content_changed'],
    ['eventname' => '\\core\\event\\course_section_deleted', 'callback' => '\\local_rag\\observer::course_content_changed'],
    ['eventname' => '\mod_data\event\record_created', 'callback' => '\local_rag\observer::entry_changed'],
    ['eventname' => '\mod_data\event\record_updated', 'callback' => '\local_rag\observer::entry_changed'],
    ['eventname' => '\mod_data\event\record_deleted', 'callback' => '\local_rag\observer::entry_changed'],
    ['eventname' => '\core\event\course_module_created', 'callback' => '\local_rag\observer::resource_changed'],
    ['eventname' => '\core\event\course_module_updated', 'callback' => '\local_rag\observer::resource_changed'],
    ['eventname' => '\core\event\course_module_deleted', 'callback' => '\local_rag\observer::resource_changed'],
    ['eventname' => '\core\event\course_deleted', 'callback' => '\local_rag\observer::course_deleted'],
];

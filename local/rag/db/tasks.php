<?php
defined('MOODLE_INTERNAL') || die();
$tasks = [
    ['classname' => '\local_rag\task\retry_documents', 'blocking' => 0,
        'minute' => '*', 'hour' => '*', 'day' => '*', 'month' => '*', 'dayofweek' => '*'],
    ['classname' => '\local_rag\task\reconcile_documents', 'blocking' => 0,
        'minute' => '*/15', 'hour' => '*', 'day' => '*', 'month' => '*', 'dayofweek' => '*'],
];

<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();

/** A bounded, public retry interval; never includes request or service details. */
final class budget_exceeded extends \moodle_exception {
    public $retryafter;
    public function __construct($retryafter = 60) {
        $this->retryafter = max(1, min(210, (int)$retryafter));
        parent::__construct('requestfailed', 'local_rag');
    }
}

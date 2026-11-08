<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();
final class document_identity {
    public static function make(int $courseid, int $cmid, string $filepath, string $filename): string {
        return 'moodle-c' . $courseid . '-m' . $cmid . '-f' . substr(hash('sha256', $filepath . $filename), 0, 20);
    }
}

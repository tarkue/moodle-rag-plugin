<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();

/** Exception-based JSON handling on PHP 7.0 as well as modern PHP. */
final class json_codec {
    public static function encode($value, int $options = 0): string {
        $encoded = json_encode($value, $options);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \UnexpectedValueException('Invalid JSON value');
        }
        return $encoded;
    }

    public static function decode(string $value, bool $associative = true) {
        $decoded = json_decode($value, $associative);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \UnexpectedValueException('Invalid JSON input');
        }
        return $decoded;
    }
}

<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();

final class configuration {
    public static function value(string $environment, string $setting): string {
        $value = getenv($environment);
        return trim($value !== false ? $value : (string)get_config('local_rag', $setting));
    }
    public static function token(): string {
        return self::value('RAG_SERVICE_TOKEN', 'servicetoken');
    }
    public static function enabled(): bool {
        return self::token() !== '' && self::url() !== '';
    }
    public static function url(): string {
        $url = rtrim(self::value('RAG_SERVICE_URL', 'serviceurl'), '/');
        $parts = parse_url($url);
        if (!$parts || empty($parts['host']) || !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true) ||
                isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment']) ||
                preg_match('/\s/', $url)) {
            return '';
        }
        return $url;
    }
    public static function require_enabled() {
        if (!self::enabled()) {
            throw new \moodle_exception('unavailable', 'local_rag');
        }
    }
    public static function admin_token(): string {
        self::require_enabled();
        $token = self::value('RAG_ADMIN_TOKEN', 'admintoken');
        if ($token === '') {
            throw new \moodle_exception('adminunavailable', 'local_rag');
        }
        return $token;
    }
}

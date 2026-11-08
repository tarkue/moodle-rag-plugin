<?php
// CLI validation only: credentials and the existing theme are never written here.
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit;
}
define('CLI_SCRIPT', true);
if ($argc !== 2 || !is_file($argv[1] . '/config.php')) {
    fwrite(STDERR, "Usage: php configure.php /path/to/moodle\n");
    exit(2);
}
require($argv[1] . '/config.php');
echo "Preserved the existing Moodle theme.\n";

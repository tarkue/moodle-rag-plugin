<?php
// CLI-only Moodle configuration API; never writes credentials into Moodle config.
define('CLI_SCRIPT', true);
if ($argc !== 2 || !is_file($argv[1] . '/config.php')) {
    fwrite(STDERR, "Usage: php configure.php /path/to/moodle\n");
    exit(2);
}
require($argv[1] . '/config.php');
set_config('theme', 'inzhe');
// Keep service/admin tokens exclusively in the PHP process environment.
echo "Selected theme_inzhe using Moodle config API.\n";

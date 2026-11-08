#!/bin/sh
# Run as the Moodle filesystem owner, with the same environment as PHP workers.
set -eu
if [ "$#" -ne 1 ]; then
    echo 'Usage: sh scripts/install.sh /path/to/moodle' >&2
    echo 'Only the search plugin is installed; the existing Moodle theme is always preserved.' >&2
    exit 2
fi
command -v php >/dev/null 2>&1 || { echo 'PHP CLI is required' >&2; exit 1; }
php -r 'if (PHP_VERSION_ID < 70000) { fwrite(STDERR, "Для этой версии плагина требуется PHP 7.0 или новее.\n"); exit(1); }'
MOODLE_ROOT=$(cd "$1" && pwd)
PACKAGE_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
test -f "$MOODLE_ROOT/config.php" || { echo 'Install Moodle first using its standard installer' >&2; exit 1; }
# Validate both components before any copy. Themes are never inspected or changed.
for component in local/rag blocks/ragchat; do
    if [ -e "$MOODLE_ROOT/$component" ]; then
        diff -qr "$PACKAGE_ROOT/$component" "$MOODLE_ROOT/$component" >/dev/null || {
            echo "Different existing code: $component; review/update it explicitly" >&2
            exit 1
        }
    fi
done
for component in local/rag blocks/ragchat; do
    if [ ! -e "$MOODLE_ROOT/$component" ]; then
        cp -R "$PACKAGE_ROOT/$component" "$MOODLE_ROOT/$component"
    fi
done
php "$MOODLE_ROOT/admin/cli/upgrade.php" --non-interactive
php "$PACKAGE_ROOT/scripts/configure.php" "$MOODLE_ROOT"
php "$MOODLE_ROOT/admin/cli/purge_caches.php"
echo 'Installed; configure web/cron environment, then run Moodle cron.'

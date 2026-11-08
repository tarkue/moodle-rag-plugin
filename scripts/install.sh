#!/bin/sh
# Run as the Moodle filesystem owner, with the same environment as PHP workers.
set -eu
if [ "$#" -ne 1 ]; then echo "Usage: sh scripts/install.sh /path/to/moodle" >&2; exit 2; fi
MOODLE_ROOT=$(cd "$1" && pwd)
PACKAGE_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
test -f "$MOODLE_ROOT/config.php" || { echo 'Install Moodle first using admin/cli/install.php' >&2; exit 1; }
# Repeat identical installs; refuse silent replacement of different existing code.
for component in local/rag blocks/ragchat theme/inzhe; do
    if [ -e "$MOODLE_ROOT/$component" ]; then
        diff -qr "$PACKAGE_ROOT/$component" "$MOODLE_ROOT/$component" >/dev/null || {
            echo "Different existing code: $component; review/update it explicitly" >&2; exit 1;
        }
    fi
done
for component in local/rag blocks/ragchat theme/inzhe; do
    if [ ! -e "$MOODLE_ROOT/$component" ]; then
        cp -R "$PACKAGE_ROOT/$component" "$MOODLE_ROOT/$component"
    fi
done
php "$MOODLE_ROOT/admin/cli/upgrade.php" --non-interactive
php "$PACKAGE_ROOT/scripts/configure.php" "$MOODLE_ROOT"
php "$MOODLE_ROOT/admin/cli/purge_caches.php"
echo 'Installed; configure web/cron environment, then run Moodle cron.'

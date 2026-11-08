<?php
namespace local_rag\privacy;
defined('MOODLE_INTERNAL') || die();
final class provider implements \core_privacy\local\metadata\provider, \core_privacy\local\request\user_preference_provider {
    public static function get_metadata(\core_privacy\local\metadata\collection $collection): \core_privacy\local\metadata\collection {
        $collection->add_user_preference('local_rag_enabled', 'privacy:preference');
        $collection->add_external_location_link('rag_service', ['query' => 'privacy:query', 'user_id' => 'privacy:userid'], 'privacy:external');
        return $collection;
    }
    public static function export_user_preferences(int $userid): void {
        $value = get_user_preferences('local_rag_enabled', null, $userid);
        if ($value !== null) {
            \core_privacy\local\request\writer::export_user_preference('local_rag', 'local_rag_enabled', $value, get_string('privacy:preference', 'local_rag'));
        }
    }
}

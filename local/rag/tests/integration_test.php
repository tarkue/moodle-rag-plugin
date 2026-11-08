<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();

final class integration_test extends \advanced_testcase {
    private array $originalenvironment = [];

    protected function setUp(): void {
        parent::setUp();
        foreach (['RAG_SERVICE_TOKEN', 'RAG_SERVICE_URL', 'RAG_ADMIN_TOKEN'] as $name) {
            $this->originalenvironment[$name] = getenv($name);
        }
    }

    protected function tearDown(): void {
        foreach ($this->originalenvironment as $name => $value) {
            putenv($value === false ? $name : $name . '=' . $value);
        }
        parent::tearDown();
    }

    public function test_missing_service_key_disables_every_operation(): void {
        $this->resetAfterTest();
        putenv('RAG_SERVICE_TOKEN');
        set_config('servicetoken', '', 'local_rag');
        $this->assertFalse(configuration::enabled());
        $this->expectException(\moodle_exception::class);
        configuration::require_enabled();
    }

    public function test_environment_token_is_never_in_bootstrap(): void {
        global $CFG;
        $this->resetAfterTest();
        $this->setAdminUser();
        putenv('RAG_SERVICE_TOKEN=unit-test-server-secret');
        putenv('RAG_SERVICE_URL=http://127.0.0.1:9');
        require_once($CFG->dirroot . '/local/rag/lib.php');
        $course = $this->getDataGenerator()->create_course();
        $bootstrap = local_rag_get_bootstrap($course);
        $this->assertStringNotContainsString('unit-test-server-secret', json_encode($bootstrap));
        putenv('RAG_SERVICE_TOKEN');
        putenv('RAG_SERVICE_URL');
    }

    public function test_unenrolled_student_cannot_access_course(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $this->setUser($this->getDataGenerator()->create_user());
        $this->expectException(\moodle_exception::class);
        access::require_course($course->id);
    }

    public function test_hidden_resource_is_excluded_from_allowed_documents(): void {
        $this->resetAfterTest();
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $resource = $this->getDataGenerator()->create_module('resource', ['course' => $course->id, 'visible' => 0]);
        $student = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($student->id, $course->id);
        $this->setUser($student);
        $this->assertFalse(access::can_read_module($course->id, $resource->cmid));
    }

    public function test_document_identity_survives_replacement_but_changes_for_other_course(): void {
        $first = document_identity::make(2, 7, '/', 'lecture.pdf');
        $this->assertSame($first, document_identity::make(2, 7, '/', 'lecture.pdf'));
        $this->assertNotSame($first, document_identity::make(3, 7, '/', 'lecture.pdf'));
        $this->assertNotSame($first, document_identity::make(2, 8, '/', 'lecture.pdf'));
    }
    private function catalogue_document(array $settings = []): array {
        global $DB;
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $data = $this->getDataGenerator()->create_module('data', array_merge(
            ['course' => $course->id, 'approval' => 1], $settings));
        $student = $this->getDataGenerator()->create_user();
        $owner = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($owner->id, $course->id, 'editingteacher');
        $this->getDataGenerator()->enrol_user($student->id, $course->id);
        $generator = $this->getDataGenerator()->get_plugin_generator('mod_data');
        $field = $generator->create_field((object)['type' => 'file', 'name' => 'Document'], $data);
        $entryid = $DB->insert_record('data_records', (object)['dataid' => $data->id, 'userid' => $owner->id,
            'groupid' => 0, 'approved' => 1, 'timecreated' => time(), 'timemodified' => time()]);
        $contentid = $DB->insert_record('data_content', (object)['fieldid' => $field->field->id,
            'recordid' => $entryid, 'content' => 'lecture.pdf']);
        $file = get_file_storage()->create_file_from_string((object)[
            'contextid' => \context_module::instance($data->cmid)->id, 'component' => 'mod_data',
            'filearea' => 'content', 'itemid' => $contentid, 'filepath' => '/', 'filename' => 'lecture.pdf'], '%PDF-test');
        $document = (object)['courseid' => $course->id, 'cmid' => $data->cmid, 'fileid' => $file->get_id()];
        $this->setUser($student);
        return [$document, $entryid, $data, $student];
    }

    public function test_approved_catalogue_file_is_accessible_but_unapproved_is_not(): void {
        global $DB;
        $this->resetAfterTest();
        [$document, $entryid] = $this->catalogue_document();
        $this->assertTrue(access::can_read_document($document));
        $DB->set_field('data_records', 'approved', 0, ['id' => $entryid]);
        $this->assertFalse(access::can_read_document($document));
        $this->assertSame('', access::source_url($document));
    }

    public function test_other_owner_catalogue_file_outside_view_window_is_not_accessible(): void {
        $this->resetAfterTest();
        [$document] = $this->catalogue_document(['timeviewfrom' => time() + 3600]);
        $this->assertFalse(access::can_read_document($document));
    }

    public function test_catalogue_file_in_another_separate_group_is_not_accessible(): void {
        global $DB;
        $this->resetAfterTest();
        [$document, $entryid] = $this->catalogue_document(['groupmode' => SEPARATEGROUPS]);
        $group = $this->getDataGenerator()->create_group(['courseid' => $document->courseid]);
        $DB->set_field('data_records', 'groupid', $group->id, ['id' => $entryid]);
        $this->assertFalse(access::can_read_document($document));
    }

    public function test_catalogue_minimum_entries_requirement_is_enforced(): void {
        $this->resetAfterTest();
        [$document] = $this->catalogue_document(['requiredentriestoview' => 2]);
        $this->assertFalse(access::can_read_document($document));
    }
    public function test_resource_event_does_not_queue_ingestion_without_key(): void {
        global $DB;
        $this->resetAfterTest();
        $this->setAdminUser();
        putenv('RAG_SERVICE_TOKEN=');
        $course = $this->getDataGenerator()->create_course();
        $resource = $this->getDataGenerator()->create_module('resource', ['course' => $course->id]);
        $event = \core\event\course_module_updated::create(['objectid' => $resource->cmid,
            'context' => \context_module::instance($resource->cmid), 'courseid' => $course->id,
            'other' => ['modulename' => 'resource', 'name' => $resource->name, 'instanceid' => $resource->id]]);
        observer::resource_changed($event);
        $queued = array_filter($DB->get_records('task_adhoc'), static function($task) {
            return strpos($task->classname, 'local_rag') !== false;
        });
        $this->assertCount(0, $queued);
    }

    public function test_duplicate_resource_events_queue_one_asynchronous_task(): void {
        global $DB;
        $this->resetAfterTest();
        $this->setAdminUser();
        putenv('RAG_SERVICE_TOKEN=test-service-key');
        putenv('RAG_SERVICE_URL=http://127.0.0.1:9');
        $course = $this->getDataGenerator()->create_course();
        $resource = $this->getDataGenerator()->create_module('resource', ['course' => $course->id]);
        $event = \core\event\course_module_updated::create(['objectid' => $resource->cmid,
            'context' => \context_module::instance($resource->cmid), 'courseid' => $course->id,
            'other' => ['modulename' => 'resource', 'name' => $resource->name, 'instanceid' => $resource->id]]);
        observer::resource_changed($event);
        observer::resource_changed($event);
        $queued = array_filter($DB->get_records('task_adhoc'), static function($task) {
            // Course creation may independently queue a course-content task.
            return $task->classname === '\\local_rag\\task\\sync_resource';
        });
        $this->assertCount(1, $queued);
        $task = reset($queued);
        $this->assertSame((int)$resource->cmid, (int)json_decode($task->customdata)->cmid);
    }
    public function test_authenticated_frontpage_reader_does_not_need_course_enrolment(): void {
        $this->resetAfterTest();
        $this->setUser($this->getDataGenerator()->create_user());
        $this->assertTrue(access::can_use_course(SITEID));
        $this->assertSame((int)SITEID, (int)access::require_course(SITEID)->id);
    }

    public function test_guest_cannot_use_frontpage_search(): void {
        $this->resetAfterTest();
        $this->setGuestUser();
        $this->assertFalse(access::can_use_course(SITEID));
    }
    public function test_catalogue_metadata_maps_russian_labels_and_native_multimenu_values(): void {
        global $DB;
        $this->resetAfterTest();
        [$document, $entryid, $data] = $this->catalogue_document();
        $generator = $this->getDataGenerator()->get_plugin_generator('mod_data');
        foreach ([['Автор', 'text', 'НОЦ ИНЖЭК'], ['Год', 'text', '2026'],
                ['Теги', 'multimenu', 'project##learning']] as [$name, $type, $value]) {
            $field = $generator->create_field((object)['type' => $type, 'name' => $name, 'param1' => "project\nlearning"], $data);
            $DB->insert_record('data_content', (object)['fieldid' => $field->field->id,
                'recordid' => $entryid, 'content' => $value]);
        }
        $cm = get_coursemodule_from_id('data', $document->cmid);
        $metadata = document_metadata::for_file($cm, get_file_storage()->get_file_by_id($document->fileid));
        $this->assertSame('НОЦ ИНЖЭК', $metadata['author']);
        $this->assertSame('2026-01-01', $metadata['publish_date']);
        $this->assertSame(['project', 'learning'], $metadata['keywords']);
    }
    public function test_native_file_context_is_accepted_and_unchanged_file_preserves_retry_delay(): void {
        global $DB;
        $this->resetAfterTest();
        [$document] = $this->catalogue_document();
        $this->assertInstanceOf(\stored_file::class, access::file($document));
        putenv('RAG_SERVICE_TOKEN=test-isolated-key');
        putenv('RAG_SERVICE_URL=http://127.0.0.1:9');
        synchronizer::resource($document->cmid);
        $record = $DB->get_record('local_rag_documents', ['cmid' => $document->cmid], '*', MUST_EXIST);
        $this->assertSame('error', $record->status);
        $record->attempts = 3;
        $record->nextattempt = time() + 5000;
        $DB->update_record('local_rag_documents', $record);
        synchronizer::resource($document->cmid);
        $unchanged = $DB->get_record('local_rag_documents', ['id' => $record->id], '*', MUST_EXIST);
        $this->assertSame(3, (int)$unchanged->attempts);
        $this->assertSame((int)$record->nextattempt, (int)$unchanged->nextattempt);
        $this->assertSame('error', $unchanged->status);
    }
    public function test_upload_url_uses_raw_http_separator_under_moodle_html_configuration(): void {
        $separator = ini_get('arg_separator.output');
        try {
            ini_set('arg_separator.output', '&amp;');
            $path = service_client::upload_path((object)['docid' => 'moodle-c2-m7-fexample',
                'courseid' => 2, 'title' => 'Название & вопрос', 'metadata' => json_encode([
                    'author' => 'НОЦ ИНЖЭК', 'keywords' => ['проект', 'обучение']])]);
            $query = parse_url($path, PHP_URL_QUERY);
            parse_str($query, $parameters);
            $this->assertStringNotContainsString('&amp;', $path);
            $this->assertSame('2', $parameters['course_id']);
            $this->assertSame('Название & вопрос', $parameters['title']);
            $this->assertSame('НОЦ ИНЖЭК', $parameters['author']);
            $this->assertSame(2, substr_count($query, '&keywords='));
        } finally {
            ini_set('arg_separator.output', $separator);
        }
    }
    public function test_explicit_rag_manager_can_access_library_without_full_site_configuration(): void {
        global $CFG, $DB;
        $this->resetAfterTest();
        require_once($CFG->libdir . '/adminlib.php');
        $context = \context_system::instance();
        $role = $DB->get_record('role', ['shortname' => 'manager'], '*', MUST_EXIST);
        $user = $this->getDataGenerator()->create_user();
        role_assign($role->id, $user->id, $context->id);
        assign_capability('moodle/site:config', CAP_PREVENT, $role->id, $context->id);
        $this->setUser($user);
        putenv('RAG_SERVICE_TOKEN=test-isolated-key');
        putenv('RAG_SERVICE_URL=http://127.0.0.1:9');
        $this->assertTrue(has_capability('local/rag:manage', $context));
        $this->assertFalse(has_capability('moodle/site:config', $context));
        $page = admin_get_root(true, true)->locate('local_rag_library');
        $this->assertInstanceOf(\admin_externalpage::class, $page);
        $this->assertTrue($page->check_access());
    }
}

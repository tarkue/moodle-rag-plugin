<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();

final class course_sync_test extends \advanced_testcase {
    private $originaltoken;
    private $originalurl;

    protected function setUp(): void {
        parent::setUp();
        $this->originaltoken = getenv('RAG_SERVICE_TOKEN');
        $this->originalurl = getenv('RAG_SERVICE_URL');
        putenv('RAG_SERVICE_TOKEN=isolated-course-sync-test');
        putenv('RAG_SERVICE_URL=http://127.0.0.1:9');
    }

    protected function tearDown(): void {
        putenv($this->originaltoken === false ? 'RAG_SERVICE_TOKEN' : 'RAG_SERVICE_TOKEN=' . $this->originaltoken);
        putenv($this->originalurl === false ? 'RAG_SERVICE_URL' : 'RAG_SERVICE_URL=' . $this->originalurl);
        parent::tearDown();
    }

    public function test_editing_teacher_can_queue_but_enrolled_student_cannot(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $teacher = $this->getDataGenerator()->create_user();
        $student = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($teacher->id, $course->id, 'editingteacher');
        $this->getDataGenerator()->enrol_user($student->id, $course->id, 'student');
        $this->setUser($teacher);
        $this->assertTrue(course_sync::can_queue($course->id));
        $this->setUser($student);
        $this->assertFalse(course_sync::can_queue($course->id));
        $this->expectException(\required_capability_exception::class);
        course_sync::queue($course->id);
    }

    public function test_repeat_request_queues_one_full_course_task_without_discovery(): void {
        global $DB;
        $this->resetAfterTest();
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $this->getDataGenerator()->create_module('page', ['course' => $course->id, 'content' => '<p>Existing text</p>']);
        course_sync::queue($course->id);
        course_sync::queue($course->id);
        $this->assertCount(1, $DB->get_records_select('task_adhoc',
            'classname = :classname AND ' . $DB->sql_compare_text('customdata') . ' = :customdata',
            ['classname' => '\\local_rag\\task\\sync_full_course', 'customdata' => json_encode(['courseid' => (int)$course->id])]));
        $this->assertTrue(course_sync::status($course->id)['queued']);
        $this->assertFalse($DB->record_exists('local_rag_documents', ['courseid' => $course->id]));
    }

    public function test_missing_key_disables_queue_and_leaves_existing_task_for_retry(): void {
        $this->resetAfterTest();
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        course_sync::queue($course->id);
        putenv('RAG_SERVICE_TOKEN=');
        $this->assertFalse(course_sync::can_queue($course->id));
        $this->assertTrue(course_sync::status($course->id)['queued']);
        $this->expectException(\moodle_exception::class);
        course_sync::execute($course->id);
    }
}

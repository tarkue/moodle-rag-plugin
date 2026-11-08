<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();

final class native_content_test extends \advanced_testcase {
    public function test_inert_text_omits_scripts_styles_and_image_alt_text(): void {
        $this->assertSame("Alpha\nBeta & Gamma", native_document::text(
            '<script>secret()</script><style>.hidden{}</style><p>Alpha</p><p>Beta &amp; Gamma</p>'));
        $this->assertSame('', native_document::text('<img src="image.png" alt="not OCR"><p>&nbsp;</p>'));
    }

    public function test_temporary_docx_contains_only_escaped_text_and_no_external_relationships(): void {
        $this->resetAfterTest();
        $path = native_document::temporary_docx("A & B\n<script>literal text</script>");
        try {
            $zip = new \ZipArchive();
            $this->assertTrue($zip->open($path));
            $xml = $zip->getFromName('word/document.xml');
            $this->assertStringContainsString('A &amp; B', $xml);
            $this->assertStringContainsString('&lt;script&gt;', $xml);
            $this->assertStringNotContainsString('TargetMode="External"', $zip->getFromName('_rels/.rels'));
            $zip->close();
        } finally {
            unlink($path);
        }
    }

    public function test_native_page_identity_survives_edit_and_deleted_page_fails_closed(): void {
        global $DB;
        $this->resetAfterTest();
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $page = $this->getDataGenerator()->create_module('page', ['course' => $course->id, 'content' => '<p>First edition</p>']);
        $first = array_values(content_catalog::scope($page->cmid))[0];
        $DB->set_field('page', 'content', '<p>Second edition</p>', ['id' => $page->id]);
        $second = array_values(content_catalog::scope($page->cmid))[0];
        $this->assertSame($first->docid, $second->docid);
        $this->assertNotSame($first->contenthash, $second->contenthash);
        $this->assertFalse(access::can_read_document($first));
        $DB->delete_records('page', ['id' => $page->id]);
        $DB->delete_records('course_modules', ['id' => $page->cmid]);
        $this->assertFalse(content_catalog::current($second));
    }
}

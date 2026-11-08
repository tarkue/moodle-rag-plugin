<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();

final class document_metadata {
    public static function for_file(\stdClass $cm, \stored_file $file): array {
        global $DB;
        $metadata = ['title' => $cm->name . ' — ' . $file->get_filename(), 'author' => '', 'keywords' => []];
        if ($cm->modname !== 'data') {
            return $metadata;
        }
        $content = $DB->get_record('data_content', ['id' => $file->get_itemid()]);
        if (!$content) {
            return $metadata;
        }
        $fields = $DB->get_records_sql('SELECT c.id, c.content, f.name, f.type FROM {data_content} c
            JOIN {data_fields} f ON f.id = c.fieldid WHERE c.recordid = :record AND f.dataid = :dataid',
            ['record' => $content->recordid, 'dataid' => $cm->instance]);
        foreach ($fields as $field) {
            if (!in_array($field->type, ['text', 'textarea', 'menu', 'multimenu', 'checkbox', 'number', 'date'], true)) {
                continue;
            }
            $name = \core_text::strtolower(trim($field->name));
            $value = trim(strip_tags((string)$field->content));
            if (in_array($name, ['title', 'name', 'название', 'наименование'], true) && $value !== '') {
                $metadata['title'] = $value;
            }
            if (in_array($name, ['author', 'authors', 'автор', 'авторы'], true)) {
                $metadata['author'] = \core_text::substr($value, 0, 500);
            }
            if (in_array($name, ['keywords', 'tags', 'ключевые слова', 'теги'], true)) {
                $metadata['keywords'] = array_slice(array_values(array_filter(array_map(static function($keyword) {
                    return \core_text::substr(trim($keyword), 0, 100);
                }, preg_split('/(?:[,;\n]|##)+/u', $value)))), 0, 50);
            }
            if (in_array($name, ['publish_date', 'publication date', 'дата публикации', 'дата издания'], true)) {
                $date = $field->type === 'date' && ctype_digit($value) ? gmdate('Y-m-d', (int)$value) : $value;
                if (preg_match('/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/', $date, $parts) &&
                        checkdate((int)$parts[2], (int)$parts[3], (int)$parts[1])) {
                    $metadata['publish_date'] = $date;
                }
            }
            if (in_array($name, ['year', 'год', 'год издания'], true) && preg_match('/^[12][0-9]{3}$/', $value)) {
                $metadata['publish_date'] = $value . '-01-01';
            }
        }
        return $metadata;
    }
}

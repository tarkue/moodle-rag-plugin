<?php
namespace local_rag;
defined('MOODLE_INTERNAL') || die();

/** Converts authored HTML to inert text and a temporary, self-contained DOCX. */
final class native_document {
    public static function text(string $html): string {
        $document = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);
        try {
            $document->loadHTML('<?xml encoding="UTF-8"><html><body>' . $html . '</body></html>', LIBXML_NONET);
            $xpath = new \DOMXPath($document);
            foreach ($xpath->query('//script|//style|//noscript|//template|//iframe|//object|//svg|//head') as $node) {
                $node->parentNode->removeChild($node);
            }
            foreach ($xpath->query('//p|//div|//br|//li|//h1|//h2|//h3|//h4|//tr|//section|//article') as $node) {
                $node->parentNode->insertBefore($document->createTextNode("\n"), $node);
                $node->appendChild($document->createTextNode("\n"));
            }
            $text = str_replace("\xc2\xa0", ' ', $document->textContent);
            $lines = array_map(static fn($line) => trim(preg_replace('/[\t\r ]+/u', ' ', $line)), explode("\n", $text));
            return implode("\n", array_values(array_filter($lines, static fn($line) => $line !== '')));
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }

    public static function temporary_docx(string $text): string {
        $path = tempnam(make_temp_directory('local_rag'), 'native-');
        $zip = new \ZipArchive();
        if ($zip->open($path, \ZipArchive::OVERWRITE) !== true) {
            throw new \runtime_exception('Cannot create native document');
        }
        try {
            $zip->addFromString('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
            $zip->addFromString('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
            $paragraphs = '';
            foreach (explode("\n", $text) as $line) {
                $paragraphs .= '<w:p><w:r><w:t xml:space="preserve">' . htmlspecialchars($line, ENT_XML1 | ENT_QUOTES, 'UTF-8') . '</w:t></w:r></w:p>';
            }
            $zip->addFromString('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' . $paragraphs . '</w:body></w:document>');
        } finally {
            $zip->close();
        }
        return $path;
    }
}

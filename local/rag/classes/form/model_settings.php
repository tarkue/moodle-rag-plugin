<?php
namespace local_rag\form;
defined('MOODLE_INTERNAL') || die();
global $CFG;
require_once($CFG->libdir . '/formslib.php');
final class model_settings extends \moodleform {
    const FIELDS = ['LLM_PROVIDER', 'OLLAMA_BASE_URL', 'OLLAMA_MODEL', 'OPENROUTER_MODEL',
        'TOP_K', 'SEARCH_MODE', 'CHUNK_STRATEGY', 'PDF_PARSER', 'CHUNK_SIZE', 'CHUNK_OVERLAP', 'RAG_PROMPT'];
    public function definition() {
        $form = $this->_form;
        foreach (self::FIELDS as $name) {
            $form->addElement($name === 'RAG_PROMPT' ? 'textarea' : 'text', $name, get_string(strtolower($name), 'local_rag'));
            $form->setType($name, in_array($name, ['TOP_K', 'CHUNK_SIZE', 'CHUNK_OVERLAP']) ? PARAM_INT : PARAM_RAW_TRIMMED);
        }
        $form->addElement('passwordunmask', 'OPENROUTER_API_KEY', get_string('providerkey', 'local_rag'));
        $form->setType('OPENROUTER_API_KEY', PARAM_RAW_TRIMMED);
        $this->add_action_buttons(false);
    }
}

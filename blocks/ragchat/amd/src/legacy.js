/** Moodle 3.0–3.2 has navigation callbacks and AMD templates, but no output callbacks. */
define(['core/templates', 'block_ragchat/chat'], function(Templates, Chat) {
    'use strict';
    let pending = false;
    return {init: function(config) {
        if (pending || document.getElementById('rag-chat') || !config.enabled) { return; }
        pending = true;
        // Core 3.0 resolves a jQuery Deferred with separate HTML and template-JS arguments.
        Templates.render('block_ragchat/chat', config).done(function(html, javascript) {
            if (!document.getElementById('rag-chat')) {
                const container = document.createElement('div');
                container.innerHTML = html;
                while (container.firstChild) { document.body.appendChild(container.firstChild); }
                Templates.runTemplateJS(javascript);
                Chat.init(config);
            }
        }).fail(function() { pending = false; });
    }};
});

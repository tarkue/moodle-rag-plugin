const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let chat;
let history;
vm.runInNewContext(fs.readFileSync(__dirname + '/../amd/src/history.js', 'utf8'), {
    define: (_, factory) => { history = factory(); }, URL,
});
vm.runInNewContext(fs.readFileSync(__dirname + '/../amd/src/chat.js', 'utf8'), {
    define: (dependencies, factory) => { chat = factory(); }, URL,
});
test('rejects empty and overlength queries while counting Unicode characters', () => {
    assert.equal(chat.queryError('   ', 4), 'empty');
    assert.equal(chat.queryError('учеба', 4), 'overlength');
    assert.equal(chat.queryError('😀😀a', 3), '');
    assert.equal(chat.queryError('да', 4000), 'short');
});
test('source links accept HTTP documents and reject executable URLs', () => {
    assert.equal(chat.safeSourceUrl('javascript:alert(1)', 'https://moodle.test'), null);
    assert.equal(chat.safeSourceUrl('data:text/html,test', 'https://moodle.test'), null);
    assert.equal(chat.safeSourceUrl('/pluginfile.php/42/book.pdf', 'https://moodle.test'),
        'https://moodle.test/pluginfile.php/42/book.pdf');
});
test('chat bootstrap fails closed without a key-enabled server shell', () => {
    assert.equal(chat.init({enabled: false}), undefined);
});
test('proxy configuration accepts only a valid same-origin Moodle endpoint', () => {
    assert.equal(chat.proxyUrl('https://other.test/ask', 'https://moodle.test/course/'), null);
    assert.equal(chat.proxyUrl('http://[invalid', 'https://moodle.test'), null);
    assert.equal(chat.proxyUrl('', 'https://moodle.test'), null);
    assert.equal(chat.proxyUrl('/local/rag/ask.php', 'https://moodle.test/course/'),
        'https://moodle.test/local/rag/ask.php');
});

test('normal geometry starts at 420px and remains wholly inside a small viewport', () => {
    const desktop = chat.defaultGeometry({width: 1440, height: 900});
    assert.equal(desktop.width, 420);
    assert.equal(desktop.x + desktop.width <= 1440, true);
    const mobile = chat.clampGeometry(desktop, {width: 280, height: 320});
    assert.equal(mobile.width <= 280, true);
    assert.equal(mobile.height <= 320, true);
    assert.equal(mobile.x >= 0 && mobile.y >= 0, true);
    assert.equal(mobile.x + mobile.width <= 280, true);
    assert.equal(mobile.y + mobile.height <= 320, true);
});
test('moving and resizing every edge keeps geometry bounded without moving the opposite edge', () => {
    const viewport = {width: 1200, height: 900};
    const start = {x: 400, y: 200, width: 420, height: 500};
    for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
        const next = chat.resizeGeometry(start, edge, 10000, -10000, viewport);
        assert.ok(next.width >= 320 && next.width <= 760);
        assert.ok(next.height >= 360 && next.height <= 900);
        assert.ok(next.x >= 0 && next.y >= 0);
        assert.ok(next.x + next.width <= viewport.width);
        assert.ok(next.y + next.height <= viewport.height);
        if (edge.includes('w')) { assert.equal(next.x + next.width, start.x + start.width); }
        if (edge.includes('n')) { assert.equal(next.y + next.height, start.y + start.height); }
    }
    const moved = chat.clampGeometry({...start, x: -500, y: 9999}, viewport);
    assert.equal(moved.x, 0);
    assert.equal(moved.y, 400);
});
test('fullscreen exits to dock while preserving its previous width without a collapsed state', () => {
    const viewport = {width: 1200, height: 900};
    const state = chat.createWindowState(viewport);
    state.geometry = {x: 123, y: 45, width: 460, height: 610};
    state.dockWidth = 460;
    chat.setFullscreen(state, true, viewport);
    assert.equal(state.fullscreen, true);
    chat.setFullscreen(state, false, viewport);
    assert.equal(state.fullscreen, false);
    assert.equal(state.docked, true);
    assert.equal(chat.dockGeometry(state, viewport).width, 460);
    assert.equal(JSON.stringify(state.geometry), JSON.stringify({x: 123, y: 45, width: 460, height: 610}));
    chat.setFullscreen(state, true, viewport);
    chat.setFullscreen(state, false, {width: 300, height: 350});
    assert.ok(state.geometry.width <= 300 && state.geometry.height <= 350);
});
test('validation is silent before submit, visible after invalid submit, and resets for next question', () => {
    assert.equal(chat.validationState('a', 4000, false).visible, false);
    assert.equal(chat.validationState('a', 4000, true).visible, true);
    assert.equal(chat.validationState(' ', 4000, true).reason, 'empty');
    assert.equal(chat.validationState('😀'.repeat(4000), 4000, true).visible, false);
    assert.equal(chat.validationState('😀'.repeat(4001), 4000, true).excess, 1);
    assert.equal(chat.validationState('', 4000, false).visible, false);
});

// Minimal DOM adapter: exercises event/state behavior without starting a browser or touching live courses.
const harness = (responses = [], withVisualViewport = false) => {
    let document;
    class Node {
        constructor(tag = 'div') {
            Object.assign(this, {tagName: tag, children: [], dataset: {}, attributes: {}, events: {}, style: {},
                hidden: false, disabled: false, value: '', scrollTop: 0, scrollHeight: 1000, clientHeight: 300,
                isConnected: true, className: ''});
            Object.defineProperty(this.style, 'setProperty', {value(name, value) { this[name] = value; }});
            this.classList = {
                contains: name => this.className.split(' ').includes(name),
                add: name => { if (!this.classList.contains(name)) { this.className += ' ' + name; } },
                remove: name => { this.className = this.className.split(' ').filter(item => item !== name).join(' '); },
                toggle: (name, enabled) => { this.classList[enabled ? 'add' : 'remove'](name); }
            };
        }
        get textContent() { return (this.ownText || '') + this.children.map(child => child.textContent).join(''); }
        set textContent(text) { this.ownText = String(text); this.children = []; }
        append(...nodes) { nodes.forEach(node => {
            if (node.tagName === 'fragment') { this.append(...node.children); return; }
            node.parent = this; this.children.push(node);
        }); }
        replaceChildren(...nodes) { this.ownText = ''; this.children = []; this.append(...nodes); }
        cloneNode(deep = false) {
            const clone = new Node(this.tagName); clone.className = this.className;
            clone.dataset = {...this.dataset}; clone.attributes = {...this.attributes}; clone.ownText = this.ownText;
            if (deep) { clone.append(...this.children.map(child => child.cloneNode(true))); }
            return clone;
        }
        after(node) { node.parent = this.parent; this.parent.children.splice(this.parent.children.indexOf(this) + 1, 0, node); }
        setAttribute(name, value) { this.attributes[name] = value; }
        removeAttribute(name) { delete this.attributes[name]; }
        addEventListener(type, listener) { (this.events[type] ||= []).push(listener); }
        dispatch(type, event = {}) {
            const emitted = {target: this, preventDefault() {}, ...event};
            (this.events[type] || []).forEach(listener => listener(emitted));
        }
        focus() { document.activeElement = this; }
        getBoundingClientRect() { return {top: this.parent && this.parent.dataset.role === 'source-content' ?
            this.parent.children.indexOf(this) * 200 + 12 : 0}; }
        getClientRects() { return this.hidden ? [] : [{}]; }
        setPointerCapture(id) { this.captured = id; }
        matches(selector) {
            if (selector.startsWith('.')) { return this.classList.contains(selector.slice(1)); }
            const attr = selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
            if (!attr) { return this.tagName === selector; }
            const value = attr[1].startsWith('data-') ? this.dataset[attr[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] :
                (this.attributes[attr[1]] || this[attr[1]]);
            return attr[2] === undefined ? value !== undefined : value === attr[2];
        }
        closest(selector) {
            if (selector.split(',').some(item => this.matches(item.trim()))) { return this; }
            return this.parent ? this.parent.closest(selector) : null;
        }
        querySelectorAll(selector) {
            const prototypeIcon = selector.match(/^\[data-icon=([^\]]+)\] \.(icon|smallicon)$/);
            if (prototypeIcon) { return this.querySelectorAll('[data-icon=' + prototypeIcon[1] + ']')
                .flatMap(holder => holder.querySelectorAll('.' + prototypeIcon[2])); }
            return this.children.flatMap(child => [
                ...(selector.split(',').some(item => child.matches(item.trim())) ? [child] : []),
                ...child.querySelectorAll(selector)
            ]);
        }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    }
    const root = new Node();
    const add = (parent, tag, className = '', dataset = {}) => {
        const node = new Node(tag); node.className = className; node.dataset = dataset; parent.append(node); return node;
    };
    const panel = add(root, 'aside', 'rag-chat__panel');
    const launcher = add(root, 'button', 'rag-chat__launcher', {action: 'toggle'});
    const header = add(panel, 'header', 'rag-chat__header', {dragHeader: ''});
    const actions = {};
    for (const action of ['close', 'fullscreen', 'minimize']) { actions[action] = add(header, 'button', '', {action}); }
    const conversation = add(panel, 'div', '', {role: 'conversation'});
    const messages = add(conversation, 'div'); messages.attributes.role = 'log';
    add(messages, 'p', '', {role: 'date'});
    add(conversation, 'p', '', {role: 'status'});
    const latest = add(conversation, 'button', '', {action: 'latest'}); latest.hidden = true;
    const form = add(conversation, 'form');
    const input = add(form, 'textarea');
    const submit = add(form, 'button'); submit.type = 'submit';
    actions.stop = add(form, 'button', '', {action: 'stop'});
    const error = add(form, 'p', 'rag-chat__error');
    const count = add(form, 'p', '', {role: 'count'});
    const sources = add(panel, 'section', '', {role: 'sources'}); sources.hidden = true;
    actions.back = add(sources, 'button', '', {action: 'back'});
    const sourceContent = add(sources, 'div', '', {role: 'source-content'});
    const edge = add(panel, 'span', '', {resize: 'se'});
    document = {documentElement: {clientWidth: 1200, style: {setProperty(name, value) { this[name] = value; }}}, activeElement: launcher, addEventListener() {},
        createElement: tag => new Node(tag), createDocumentFragment: () => new Node('fragment'), createTextNode: text => Object.assign(new Node('text'), {textContent: text}),
        querySelector: selector => selector === '[data-rag-chat]' ? root : null};
    const copied = [];
    const window = {navigator: {clipboard: {writeText: async text => { copied.push(text); }}}, getComputedStyle: () => ({lineHeight: '22px', paddingTop: '8px', paddingBottom: '8px'}), location: {href: 'https://moodle.test/course/view.php?id=2'}, innerHeight: 900, events: {},
        addEventListener(type, listener) { this.events[type] = listener; }};
    if (withVisualViewport) {
        window.visualViewport = {width: 1200, height: 900, offsetLeft: 0, offsetTop: 0, events: {},
            addEventListener(type, listener) { this.events[type] = listener; }};
    }
    const requests = [];
    let markdown;
    vm.runInNewContext(fs.readFileSync(__dirname + '/../amd/src/markdown.js', 'utf8'), {
        define: (_, factory) => { markdown = factory(); }, URL, document
    });
    let module;
    vm.runInNewContext(fs.readFileSync(__dirname + '/../amd/src/chat.js', 'utf8'), {
        define: (_, factory) => { module = factory(markdown, history); }, URL, document, window, AbortController, DOMException,
        fetch: async (url, options) => {
            requests.push(JSON.parse(options.body));
            const response = responses.shift();
            if (response instanceof Error) { throw response; }
            return response;
        }
    });
    module.init({enabled: true, enabledpreference: true, endpoint: '/local/rag/ask.php', sesskey: 'test-only', courseid: 2});
    return {root, panel, launcher, header, conversation, latest, copied, input, form, submit, error, count, messages, actions,
        sources, sourceContent, window, document, requests, edge,
        click: node => { node.dispatch('click'); root.dispatch('click', {target: node}); },
        settle: () => new Promise(resolve => setImmediate(resolve))};
};

test('submit reaches invalid-length errors, then successful send resets validation for the next draft', async () => {
    const h = harness([{ok: true, json: async () => ({answer: 'Ответ'})}]);
    h.input.value = '😀'.repeat(4001);
    h.input.dispatch('input');
    assert.equal(h.error.hidden, true);
    assert.equal(h.submit.disabled, false);
    h.form.dispatch('submit');
    assert.equal(h.error.hidden, false);
    assert.equal(h.count.hidden, false);
    assert.equal(h.requests.length, 0);
    h.input.value = '😀😀😀';
    h.form.dispatch('submit');
    await h.settle();
    assert.equal(h.requests.length, 1);
    assert.equal(h.error.hidden, true);
    h.input.value = 'a'; h.input.dispatch('input');
    assert.equal(h.count.hidden, true);
    assert.equal(h.error.hidden, true);
});

test('sources are above the answer and return preserves input, history and scroll through close/reopen', async () => {
    const h = harness([{ok: true, json: async () => ({answer: 'Ответ', sources: [
        {doc: '<Учебник>', page: 4, fragment: '<script>plain text</script>', url: '/pluginfile.php/2/book.pdf'},
        {doc: 'Bad link', fragment: 'Текст', url: 'javascript:alert(1)'}
    ]})}]);
    h.input.value = 'Вопрос'; h.form.dispatch('submit'); await h.settle();
    const answer = h.messages.children.at(-1);
    const sourceButton = answer.children[0];
    assert.equal(sourceButton.className, 'rag-chat__sources');
    assert.equal(answer.children[1].textContent, 'Ответ');
    assert.equal(answer.querySelectorAll('[data-action=regenerate]').length, 0);
    // Model native focus scrolling the source button back into view unless preventScroll is requested.
    sourceButton.focus = options => {
        h.document.activeElement = sourceButton;
        if (!options || !options.preventScroll) { h.messages.scrollTop = 999; }
    };
    h.input.value = 'Черновик'; h.messages.scrollTop = 123;
    h.click(sourceButton);
    assert.equal(h.conversation.hidden, true);
    assert.equal(h.header.hidden, true);
    assert.equal(h.sources.hidden, false);
    assert.equal(h.sourceContent.children[0].children[0].textContent, 'S1 · <Учебник>, с. 4');
    assert.equal(h.sourceContent.children[0].children[1].textContent, '<script>plain text</script>');
    assert.equal(h.sourceContent.querySelectorAll('a').length, 1);
    assert.equal(h.sourceContent.querySelector('a').rel, 'noopener noreferrer');
    h.window.events['ragchat:toggle']();
    assert.equal(h.panel.hidden, true);
    assert.equal(h.document.documentElement.style['--rag-chat-dock-width'], '0px');
    h.click(h.launcher);
    assert.equal(h.panel.hidden, false);
    assert.equal(h.sources.hidden, false);
    h.click(h.actions.back);
    assert.equal(h.input.value, 'Черновик');
    assert.equal(h.messages.scrollTop, 123);
    assert.equal(h.messages.children.at(-1), answer);
    assert.equal(h.document.activeElement, sourceButton);
});

test('retry replaces only its failed response in place and preserves a newer turn and draft', async () => {
    const h = harness([
        {ok: false, status: 503},
        {ok: true, json: async () => ({answer: 'Второй ответ'})},
        {ok: true, json: async () => ({answer: 'Первый ответ восстановлен'})}
    ]);
    h.input.value = 'Первый вопрос'; h.form.dispatch('submit'); await h.settle();
    const firstAnswer = h.messages.children.at(-1);
    const retry = firstAnswer.querySelector('[data-action=regenerate]');
    assert.ok(retry);
    h.input.value = 'Второй вопрос'; h.form.dispatch('submit'); await h.settle();
    const secondAnswer = h.messages.children.at(-1);
    const historyLength = h.messages.children.length;
    h.input.value = 'Черновик'; h.click(retry); await h.settle();
    assert.equal(h.requests[2].query, 'Первый вопрос');
    assert.equal(h.messages.children.length, historyLength);
    assert.equal(h.messages.children.at(-1), secondAnswer);
    assert.equal(firstAnswer.children[0].textContent, 'Первый ответ восстановлен');
    assert.equal(firstAnswer.querySelector('[data-action=regenerate]'), null);
    assert.equal(h.input.value, 'Черновик');
});

test('header buttons never drag, fullscreen restores geometry, and viewport shrink keeps messages visible', () => {
    const h = harness();
    const start = {...h.panel.style};
    h.panel.dispatch('pointerdown', {target: h.actions.close, button: 0, pointerId: 1, clientX: 900, clientY: 100});
    h.panel.dispatch('pointermove', {pointerId: 1, clientX: 100, clientY: 500});
    assert.deepEqual(h.panel.style, start);
    h.panel.dispatch('pointerdown', {target: h.header, button: 0, pointerId: 2, clientX: 900, clientY: 100});
    h.panel.dispatch('pointermove', {pointerId: 2, clientX: 700, clientY: 150});
    h.panel.dispatch('pointerup');
    const moved = {...h.panel.style};
    assert.notEqual(moved.left, start.left);
    h.click(h.actions.fullscreen);
    assert.equal(h.actions.minimize.hidden, false);
    h.click(h.actions.minimize);
    assert.equal(h.root.classList.contains('rag-chat--docked'), true);
    assert.equal(h.panel.style.width, moved.width);
    assert.equal(h.root.classList.contains('rag-chat--fullscreen'), false);
    h.document.documentElement.clientWidth = 280; h.window.innerHeight = 320;
    h.window.events.resize();
    assert.equal(h.panel.style.width, '280px');
    assert.equal(h.panel.style.height, '320px');
    assert.equal(h.conversation.hidden, false);
    assert.equal(h.messages.hidden, false);
});

test('source count follows Russian singular, paucal and plural forms including teens', () => {
    for (const [count, expected] of [[1, '1 источник'], [2, '2 источника'], [5, '5 источников'],
        [11, '11 источников'], [21, '21 источник'], [22, '22 источника'], [112, '112 источников']]) {
        assert.equal(chat.sourceCountLabel(count), expected);
    }
});
test('real timestamps survive source navigation and retry preserves question time with separate answer time', async () => {
    const h = harness([{ok: false, status: 503}, {ok: true, json: async () => ({answer: 'Восстановлен'})}]);
    h.input.value = 'Вопрос'; h.form.dispatch('submit'); await h.settle();
    const question = h.messages.children.at(-2);
    const answer = h.messages.children.at(-1);
    const questionTime = question.querySelector('time');
    const errorTime = answer.querySelector('time');
    assert.ok(Number.isFinite(Date.parse(questionTime.dateTime)));
    assert.match(questionTime.textContent, /^\d{2}:\d{2}$/);
    const created = answer.dataset.createdAt;
    const retry = answer.querySelector('[data-action=regenerate]');
    h.click(retry); await h.settle();
    assert.equal(question.querySelector('time'), questionTime);
    assert.equal(answer.dataset.createdAt, created);
    assert.equal(answer.querySelector('time').dateTime, answer.dataset.answeredAt);
    assert.ok(Number.isFinite(Date.parse(answer.dataset.answeredAt)));
    assert.notEqual(answer.querySelector('time'), errorTime);
});

test('initial mode is docked at the right edge and reserves its actual width', () => {
    const state = chat.createWindowState({width: 1440, height: 700});
    assert.equal(state.docked, true);
    const geometry = chat.dockGeometry(state, {width: 1440, height: 700});
    assert.equal(geometry.x + geometry.width, 1440);
    assert.equal(geometry.y, 0);
    assert.equal(geometry.height, 700);
    assert.equal(geometry.width, 420);
    const h = harness();
    assert.equal(h.root.classList.contains('rag-chat--docked'), true);
    assert.equal(h.panel.style.left, '780px');
    assert.equal(h.panel.style.height, '900px');
    assert.equal(h.document.documentElement.style['--rag-chat-dock-width'], '420px');
});
test('visual viewport offsets bound drag geometry and recover after the keyboard closes', () => {
    const visible = {x: 30, y: 210, width: 375, height: 300};
    const geometry = chat.clampGeometry({x: -10, y: -10, width: 420, height: 720}, visible);
    assert.ok(geometry.x >= 30 && geometry.y >= 210);
    assert.ok(geometry.x + geometry.width <= 405);
    assert.ok(geometry.y + geometry.height <= 510);
    const h = harness();
    h.window.visualViewport = {offsetLeft: 30, offsetTop: 210, width: 375, height: 300};
    h.window.events.resize();
    assert.equal(h.panel.style.left, '30px');
    assert.equal(h.panel.style.top, '210px');
});

test('drag detaches, right-edge release redocks, viewport resize resets dock and fullscreen survives resize', () => {
    const h = harness();
    const drag = (id, startX, endX) => {
        h.panel.dispatch('pointerdown', {target: h.header, button: 0, pointerId: id, clientX: startX, clientY: 100});
        h.panel.dispatch('pointermove', {pointerId: id, clientX: endX, clientY: 150});
    };
    drag(1, 900, 600); h.panel.dispatch('pointerup');
    assert.equal(h.root.classList.contains('rag-chat--docked'), false);
    assert.equal(h.panel.style.height, '720px');
    drag(2, 600, 1100); h.panel.dispatch('pointerup');
    assert.equal(h.root.classList.contains('rag-chat--docked'), true);
    drag(3, 900, 600); h.panel.dispatch('pointerup');
    h.window.events.resize();
    assert.equal(h.root.classList.contains('rag-chat--docked'), true);
    h.click(h.actions.fullscreen); h.window.events.resize();
    assert.equal(h.root.classList.contains('rag-chat--fullscreen'), true);
    h.click(h.actions.minimize);
    assert.equal(h.root.classList.contains('rag-chat--docked'), true);
});
test('docked west resize changes reserved width and close/fullscreen/detach release page space', () => {
    const h = harness();
    const west = h.edge; west.dataset.resize = 'w';
    h.panel.dispatch('pointerdown', {target: west, button: 0, pointerId: 1, clientX: 780, clientY: 300});
    h.panel.dispatch('pointermove', {pointerId: 1, clientX: 680, clientY: 300});
    h.panel.dispatch('pointerup');
    assert.equal(h.root.classList.contains('rag-chat--docked'), true);
    assert.equal(h.panel.style.width, '520px');
    assert.equal(h.panel.style.left, '680px');
    assert.equal(h.document.documentElement.style['--rag-chat-dock-width'], '520px');
    h.click(h.actions.close);
    assert.equal(h.panel.hidden, true);
    assert.equal(h.document.documentElement.style['--rag-chat-dock-width'], '0px');
    h.click(h.launcher);
    assert.equal(h.panel.style.width, '520px');
    assert.equal(h.document.documentElement.style['--rag-chat-dock-width'], '520px');
    h.click(h.actions.fullscreen);
    assert.equal(h.root.classList.contains('rag-chat--docked'), false);
    assert.equal(h.document.documentElement.style['--rag-chat-dock-width'], '0px');
});

test('right-edge snap uses clamped panel bounds even when capture is lost before pointerup outside the viewport', () => {
    for (const finish of ['lostpointercapture', 'pointercancel', 'window-pointerup', 'blur']) {
        const h = harness();
        h.panel.dispatch('pointerdown', {target: h.header, button: 0, pointerId: 1, clientX: 900, clientY: 100});
        h.panel.dispatch('pointermove', {pointerId: 1, clientX: 500, clientY: 124});
        h.panel.dispatch('pointerup');
        h.panel.dispatch('pointerdown', {target: h.header, button: 0, pointerId: 2, clientX: 500, clientY: 124});
        h.panel.dispatch('pointermove', {pointerId: 2, clientX: 5000, clientY: 124});
        assert.equal(Number.parseFloat(h.panel.style.left) + Number.parseFloat(h.panel.style.width), 1200);
        // The visual hint is deliberately absent: it must never be the source of truth for docking.
        h.root.classList.remove('rag-chat--snap-ready');
        if (finish === 'window-pointerup') { h.window.events.pointerup(); }
        else if (finish === 'blur') { h.window.events.blur(); }
        else { h.panel.dispatch(finish); }
        h.panel.dispatch('pointerup');
        assert.equal(h.root.classList.contains('rag-chat--docked'), true, finish);
        assert.equal(h.panel.style.height, '900px', finish);
        assert.equal(h.document.documentElement.style['--rag-chat-dock-width'], '420px', finish);
    }
});

test('resizing a detached panel to the right boundary also redocks and reserves page space', () => {
    const h = harness();
    h.panel.dispatch('pointerdown', {target: h.header, button: 0, pointerId: 1, clientX: 900, clientY: 100});
    h.panel.dispatch('pointermove', {pointerId: 1, clientX: 700, clientY: 130});
    h.panel.dispatch('pointerup');
    const east = h.edge; east.dataset.resize = 'e';
    h.panel.dispatch('pointerdown', {target: east, button: 0, pointerId: 2, clientX: 1000, clientY: 300});
    h.panel.dispatch('pointermove', {pointerId: 2, clientX: 5000, clientY: 300});
    h.panel.dispatch('pointerup');
    assert.equal(h.root.classList.contains('rag-chat--docked'), true);
    assert.equal(h.document.documentElement.style['--rag-chat-dock-width'], '420px');
});

test('partial left drag continues through reflow viewport events and capture loss until the actual release', () => {
    const h = harness([], true);
    h.panel.dispatch('pointerdown', {target: h.header, button: 0, pointerId: 1, clientX: 900, clientY: 100});
    h.panel.dispatch('pointermove', {pointerId: 1, clientX: 894, clientY: 100, buttons: 1});
    assert.equal(h.root.classList.contains('rag-chat--docked'), false);
    h.window.visualViewport.events.scroll();
    h.window.visualViewport.events.resize();
    h.panel.dispatch('lostpointercapture', {pointerId: 1});
    h.window.events.pointermove({pointerId: 1, clientX: 600, clientY: 150, buttons: 1});
    assert.equal(h.panel.style.left, '480px');
    assert.equal(h.panel.style.top, '50px');
    assert.equal(h.root.classList.contains('rag-chat--dragging'), true);
    h.window.events.pointerup();
    assert.equal(h.root.classList.contains('rag-chat--docked'), false);
    assert.equal(h.panel.style.left, '480px');
    assert.equal(h.document.documentElement.style['--rag-chat-dock-width'], '0px');
    h.window.events.resize();
    assert.equal(h.root.classList.contains('rag-chat--docked'), true);
});

test('phones375 and landscape667 fill viewport, hide mode controls and reject move/resize gestures', () => {
    const h = harness();
    for (const [width, height] of [[375, 667], [667, 375]]) {
        const dock = chat.dockGeometry({dockWidth: 420}, {width, height});
        assert.equal(dock.x, 0);
        assert.equal(dock.width, width);
        h.document.documentElement.clientWidth = width; h.window.innerHeight = height; h.window.events.resize();
        assert.equal(h.actions.fullscreen.hidden, true);
        assert.equal(h.actions.minimize.hidden, true);
        assert.equal(h.panel.style.width, width + 'px');
        assert.equal(h.panel.style.height, height + 'px');
        const before = {...h.panel.style};
        for (const target of [h.header, h.edge]) {
            h.panel.dispatch('pointerdown', {target, button: 0, pointerId: 1, clientX: 100, clientY: 30});
            h.panel.dispatch('pointermove', {pointerId: 1, clientX: 20, clientY: 200, buttons: 1});
            h.panel.dispatch('pointerup');
            assert.deepEqual(h.panel.style, before);
        }
        assert.equal(h.root.classList.contains('rag-chat--docked'), true);
    }
});
test('desktop fullscreen remains internal fullscreen across phone resize with no visible phone mode controls', () => {
    const h = harness(); h.click(h.actions.fullscreen);
    h.document.documentElement.clientWidth = 667; h.window.innerHeight = 375; h.window.events.resize();
    assert.equal(h.root.classList.contains('rag-chat--fullscreen'), true);
    assert.equal(h.root.classList.contains('rag-chat--phone'), true);
    assert.equal(h.actions.fullscreen.hidden, true);
    assert.equal(h.actions.minimize.hidden, true);
    h.document.documentElement.clientWidth = 1200; h.window.innerHeight = 900; h.window.events.resize();
    assert.equal(h.root.classList.contains('rag-chat--fullscreen'), true);
    assert.equal(h.root.classList.contains('rag-chat--phone'), false);
    assert.equal(h.actions.minimize.hidden, false);
    h.click(h.actions.minimize);
    assert.equal(h.root.classList.contains('rag-chat--docked'), true);
});

test('validation only follows explicit nonempty invalid submit and every edit/reopen clears it', () => {
    const h = harness();
    h.form.dispatch('submit');
    assert.equal(h.error.hidden, true);
    assert.equal(h.count.hidden, true);
    h.input.value = 'a'; h.input.dispatch('input');
    assert.equal(h.submit.disabled, false);
    h.form.dispatch('submit'); assert.equal(h.error.hidden, false);
    h.input.value = 'ab'; h.input.dispatch('input');
    assert.equal(h.error.hidden, true);
    assert.equal(h.count.hidden, true);
    h.form.dispatch('submit'); assert.equal(h.error.hidden, false);
    h.click(h.actions.close); h.click(h.launcher);
    assert.equal(h.error.hidden, true);
    h.input.value = ''; h.input.dispatch('input'); h.form.dispatch('submit');
    assert.equal(h.error.hidden, true);
    assert.equal(h.requests.length, 0);
});

test('composer grows through3/4 text lines, caps5 lines with internal scrolling and resets after clear', () => {
    for (const [lines, height, scroll] of [[3, 82, false], [4, 104, false], [5, 104, true]]) {
        const result = chat.composerSize(lines * 22 + 16, 22, 16);
        assert.equal(result.height, height);
        assert.equal(result.scroll, scroll);
    }
    assert.equal(chat.composerSize(0, 22, 16).height, 56);
    const h = harness();
    h.input.value = '😀\n😀\n😀'; h.input.scrollHeight = 82; h.input.dispatch('input');
    assert.equal(h.input.style.height, '82px');
    h.input.value += '\n😀\n😀'; h.input.scrollHeight = 126; h.input.dispatch('input');
    assert.equal(h.input.style.height, '104px');
    assert.equal(h.input.style.overflowY, 'auto');
    h.input.value = ''; h.input.dispatch('input');
    assert.equal(h.input.style.height, '56px');
});

test('copy answer writes only on click and exposes accessible feedback', async () => {
    const h = harness([{ok: true, json: async () => ({answer: 'Ответ для копирования'})}]);
    h.input.value = 'Вопрос'; h.form.dispatch('submit'); await h.settle();
    assert.equal(h.copied.length, 0);
    const copy = h.messages.children.at(-1).querySelector('[data-action=copy-answer]');
    assert.ok(copy);
    h.click(copy); await h.settle();
    assert.equal(h.copied[0], 'Ответ для копирования');
    assert.equal(copy.textContent, 'Скопировано');
});
test('a response while reading older messages offers jump-to-latest without stealing scroll or draft', async () => {
    let finish;
    const response = new Promise(resolve => { finish = resolve; });
    const h = harness([response]);
    h.input.value = 'Вопрос'; h.form.dispatch('submit');
    h.messages.scrollTop = 123;
    h.input.value = 'Черновик';
    finish({ok: true, json: async () => ({answer: 'Новый ответ'})}); await h.settle();
    assert.equal(h.messages.scrollTop, 123);
    assert.equal(h.latest.hidden, false);
    h.click(h.latest);
    assert.equal(h.latest.hidden, true);
    assert.equal(h.messages.scrollTop, h.messages.scrollHeight);
    assert.equal(h.input.value, 'Черновик');
});

test('Markdown integration copies rendered answer text and exact code without copying control labels', async () => {
    const h = harness([{ok: true, json: async () => ({answer: '# Заголовок\n\n**Текст**\n\n```js\none\n  two\n```'})}]);
    h.input.value = 'Вопрос'; h.form.dispatch('submit'); await h.settle();
    const answer = h.messages.children.at(-1);
    h.click(answer.querySelector('[data-action=copy-answer]')); await h.settle();
    assert.equal(h.copied[0].startsWith('Заголовок'), true);
    assert.equal(h.copied[0].includes('**'), false);
    assert.equal(h.copied[0].includes('Скопировать код'), false);
    h.click(answer.querySelector('[data-action=copy-code]')); await h.settle();
    assert.equal(h.copied[1], 'one\n  two\n');
});

test('source back remeasures3/4-line draft after hidden viewport layout without collapsing it', async () => {
    for (const lines of [3, 4]) {
        for (const resize of [false, true]) {
            const h = harness([{ok: true, json: async () => ({answer: 'Ответ', sources: [{doc: 'Источник', fragment: 'Текст'}]})}]);
            h.input.value = 'Вопрос'; h.form.dispatch('submit'); await h.settle();
            const source = h.messages.children.at(-1).querySelector('.rag-chat__sources');
            const contentHeight = lines * 22 + 16;
            Object.defineProperty(h.input, 'scrollHeight', {get: () => h.conversation.hidden ? 0 : contentHeight});
            h.input.value = Array(lines).fill('Черновик').join('\n'); h.input.dispatch('input');
            assert.equal(h.input.style.height, contentHeight + 'px');
            h.click(source);
            h.window.events.pointerup();
            if (resize) { h.window.events.resize(); }
            h.click(h.actions.back);
            assert.equal(h.input.style.height, contentHeight + 'px', lines + ' lines; resize=' + resize);
            assert.equal(h.input.style.overflowY, 'hidden');
        }
    }
});

test('composer template places both send states in their own control row after the textarea', () => {
    const template = fs.readFileSync(__dirname + '/../templates/chat.mustache', 'utf8');
    assert.match(template, /<\/textarea>\s*<div class="rag-chat__controls">\s*<button type="submit"[\s\S]*?data-action="stop"[\s\S]*?<\/div>/);
});
test('citation opens exact same-document fragment from its own answer and restores scroll focus and draft', async () => {
    const h = harness([
        {ok: true, json: async () => ({answer: 'Проект[S1] и (S2).', sources: [{doc: 'Книга', fragment: 'Первый'}, {doc: 'Книга', fragment: 'Второй'}]})},
        {ok: true, json: async () => ({answer: 'Другой[S1]', sources: [{doc: 'Другая', fragment: 'Третий'}]})}
    ]);
    h.input.value = 'Вопрос'; h.form.dispatch('submit'); await h.settle();
    const answer = h.messages.children.at(-1);
    h.input.value = 'Следующий'; h.form.dispatch('submit'); await h.settle();
    const citation = answer.querySelectorAll('.rag-chat__citation')[1];
    assert.ok(citation);
    h.messages.scrollTop = 265;
    h.input.value = 'Раз\nДва\nТри\nЧетыре'; h.input.scrollHeight = 104; h.input.dispatch('input');
    h.click(citation);
    assert.equal(h.sourceContent.children.length, 2);
    const selected = h.sourceContent.children[1];
    assert.equal(selected.children[1].textContent, 'Второй');
    assert.equal(selected.classList.contains('rag-chat__source--selected'), true);
    assert.equal(h.document.activeElement, selected);
    assert.equal(h.sourceContent.scrollTop, 200);
    h.window.events.resize(); h.click(h.actions.back);
    assert.equal(h.messages.scrollTop, 265);
    assert.equal(h.document.activeElement, citation);
    assert.equal(h.input.value, 'Раз\nДва\nТри\nЧетыре');
    assert.equal(h.input.style.height, '104px');
    h.click(answer.querySelector('.rag-chat__sources'));
    assert.equal(h.sourceContent.scrollTop, 0);
    assert.equal(h.sourceContent.querySelector('.rag-chat__source--selected'), null);
    h.click(h.actions.back);
    h.click(answer.querySelector('[data-action=copy-answer]')); await h.settle();
    assert.equal(h.copied[0], 'Проект[S1] и (S2).');
});
test('copy answer retains decorative icon and label through success and failure', async () => {
    const h = harness([{ok: true, json: async () => ({answer: 'Ответ'})}]);
    h.input.value = 'Вопрос'; h.form.dispatch('submit'); await h.settle();
    const button = h.messages.children.at(-1).querySelector('[data-action=copy-answer]');
    const icon = button.children[0];
    assert.equal(icon.attributes['aria-hidden'], 'true');
    assert.equal(button.querySelector('[data-role=copy-label]').textContent, 'Скопировать ответ');
    h.click(button); await h.settle();
    assert.equal(button.children[0], icon);
    assert.equal(button.querySelector('[data-role=copy-label]').textContent, 'Скопировано');
    h.window.navigator.clipboard.writeText = async () => { throw new Error('denied'); };
    h.click(button); await h.settle();
    assert.equal(button.children[0], icon);
    assert.equal(button.querySelector('[data-role=copy-label]').textContent, 'Не удалось скопировать');
});
test('chat icons keep a useful glyph area and decorative copy template without changing text size', () => {
    for (const name of ['cross', 'arrow-up', 'book', 'ai']) {
        const svg = fs.readFileSync(__dirname + '/../pix/' + name + '.svg', 'utf8');
        const box = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
        // These supplied paths occupy about 12 units: oversized 30-unit canvases made them tiny.
        assert.ok(box[2] <= 20 && box[3] <= 20, name + ' must not retain excessive canvas gutters');
    }
    const template = fs.readFileSync(__dirname + '/../templates/chat.mustache', 'utf8');
    assert.match(template, /data-icon="copy" hidden aria-hidden="true"/);
});

test('explicit valid send scrolls the message log smoothly while invalid submit does not move it', () => {
    const h = harness([{ok: true, json: async () => ({answer: 'Ответ'})}]);
    const calls=[];
    h.window.matchMedia=()=>({matches:false});
    h.messages.scrollTo=options=>{calls.push(options);h.messages.scrollTop=options.top;};
    h.messages.scrollTop=123;h.input.value='x';h.form.dispatch('submit');
    assert.equal(calls.length,0);assert.equal(h.messages.scrollTop,123);
    h.input.value='Valid user question';h.form.dispatch('submit');
    assert.equal(calls.length,1);assert.equal(calls[0].behavior,'smooth');assert.equal(calls[0].top,h.messages.scrollHeight);
});

test('explicit send respects reduced motion and only scrolls the inner message log', () => {
    const h = harness([{ok: true, json: async () => ({answer: 'Ответ'})}]);
    const calls=[];h.window.matchMedia=()=>({matches:true});
    h.messages.scrollTo=options=>{calls.push(options);h.messages.scrollTop=options.top;};
    h.input.value='Reduced motion question';h.form.dispatch('submit');
    assert.equal(calls[0].behavior,'auto');
});

test('429 shows a bounded Moodle rate-limit message as plain text without an automatic retry', async () => {
    const message='Слишком много запросов. Повторите через 27 секунд. <img src=x onerror=bad>';
    const h=harness([{ok:false,status:429,json:async()=>({error:'ratelimited',message})}]);
    h.input.value='Rate limited user question';h.form.dispatch('submit');await h.settle();
    const error=h.messages.querySelector('.rag-chat__message--error');
    assert.ok(error.textContent.includes(message));assert.equal(error.querySelector('img'),null);
    await h.settle();assert.equal(h.requests.length,1);
});

test('429 ignores oversized or unrelated upstream message payloads', async () => {
    for(const payload of [{error:'ratelimited',message:'x'.repeat(301)},{error:'serviceerror',message:'Untrusted upstream details'}]){
        const h=harness([{ok:false,status:429,json:async()=>payload}]);h.input.value='Rate fallback question';h.form.dispatch('submit');await h.settle();
        const error=h.messages.querySelector('.rag-chat__message--error');assert.ok(error.textContent.includes('Слишком много запросов.'));assert.ok(!error.textContent.includes(payload.message));
    }
});

for(const iconClass of ['icon','smallicon'])test('generated copy source and retry clone '+iconClass+' image prototypes',async()=>{
 const h=harness([{ok:true,json:async()=>({answer:'Answer [S1]',sources:[{doc:'Source',fragment:'Excerpt'}]})},{ok:false,status:503}]);
 for(const name of ['copy','book','repeat']){const holder=h.document.createElement('span');holder.dataset.icon=name;const img=h.document.createElement('img');img.className=iconClass;img.setAttribute('src',name+'.svg');holder.append(img);h.root.append(holder);}
 h.input.value='First source question';h.form.dispatch('submit');await h.settle();const answer=h.messages.children.at(-1);
 for(const [selector,expected]of [['.rag-chat__sources','book.svg'],['[data-action=copy-answer]','copy.svg']]){const image=answer.querySelector(selector).children[0];assert.equal(image.tagName,'img');assert.equal(image.attributes.src,expected);assert.equal(image.attributes['aria-hidden'],'true');}
 h.input.value='Second error question';h.form.dispatch('submit');await h.settle();const retry=h.messages.children.at(-1).querySelector('[data-action=regenerate]').children[0];assert.equal(retry.tagName,'img');assert.equal(retry.attributes.src,'repeat.svg');
});

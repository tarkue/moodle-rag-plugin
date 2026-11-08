/**
 * Accessible Moodle-session chat. Service credentials never enter this module.
 * @module block_ragchat/chat
 */
define(['block_ragchat/markdown'], function(Markdown) {
    'use strict';

    const queryError = (query, limit) => {
        if (!query.trim()) { return 'empty'; }
        const length = Array.from(query.trim()).length;
        if (length < 3) { return 'short'; }
        return length > limit ? 'overlength' : '';
    };
    const sourceCountLabel = count => {
        const form = new Intl.PluralRules('ru').select(count);
        const endings = {one: 'источник', few: 'источника', many: 'источников', other: 'источника'};
        return count + ' ' + endings[form];
    };
    const messageTime = instant => {
        const time = element('time', 'rag-chat__time', new Intl.DateTimeFormat('ru', {
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).format(new Date(instant)));
        time.dateTime = instant;
        return time;
    };
    const composerSize = (contentHeight, lineHeight, padding, availableHeight = Infinity) => {
        const maxHeight = Math.max(56, Math.min(lineHeight * 4 + padding, availableHeight));
        return {height: Math.max(56, Math.min(contentHeight, maxHeight)), scroll: contentHeight > maxHeight};
    };
    const validationState = (query, limit, attempted) => ({
        reason: queryError(query, limit),
        visible: attempted && Boolean(queryError(query, limit)) && queryError(query, limit) !== 'empty',
        length: Array.from(query.trim()).length,
        excess: Math.max(0, Array.from(query.trim()).length - limit)
    });
    const bound = (value, min, max) => Math.max(min, Math.min(value, max));
    const viewportMargin = viewport => Math.min(viewport.width <= 600 ? 16 : 24, viewport.width / 4, viewport.height / 4);
    const geometryLimits = viewport => ({
        minWidth: Math.min(320, viewport.width - 2 * viewportMargin(viewport)), maxWidth: Math.min(760, viewport.width),
        minHeight: Math.min(360, viewport.height - 2 * viewportMargin(viewport)), maxHeight: Math.min(900, viewport.height)
    });
    const clampGeometry = (geometry, viewport) => {
        const limits = geometryLimits(viewport);
        const width = bound(geometry.width, limits.minWidth, limits.maxWidth);
        const height = bound(geometry.height, limits.minHeight, limits.maxHeight);
        const x = viewport.x || 0;
        const y = viewport.y || 0;
        return {x: bound(geometry.x, x, x + viewport.width - width),
            y: bound(geometry.y, y, y + viewport.height - height), width, height};
    };
    const dockWidthLimit = viewport => Math.min(760, viewport.width >= 768 ? Math.max(320, viewport.width - 320) : viewport.width);
    const dockGeometry = (state, viewport) => {
        const width = viewport.width <= 767 ? viewport.width :
            bound(state.dockWidth, Math.min(320, viewport.width), dockWidthLimit(viewport));
        return {x: (viewport.x || 0) + viewport.width - width, y: viewport.y || 0, width, height: viewport.height};
    };
    const defaultGeometry = viewport => dockGeometry({dockWidth: 420}, viewport);
    const resizeGeometry = (start, edge, dx, dy, viewport) => {
        const limits = geometryLimits(viewport);
        let {x, y, width, height} = start;
        if (edge.includes('e')) { width = bound(width + dx, limits.minWidth, Math.min(limits.maxWidth, (viewport.x || 0) + viewport.width - x)); }
        if (edge.includes('s')) { height = bound(height + dy, limits.minHeight, Math.min(limits.maxHeight, (viewport.y || 0) + viewport.height - y)); }
        if (edge.includes('w')) {
            width = bound(width - dx, limits.minWidth, Math.min(limits.maxWidth, start.x + start.width - (viewport.x || 0)));
            x = start.x + start.width - width;
        }
        if (edge.includes('n')) {
            height = bound(height - dy, limits.minHeight, Math.min(limits.maxHeight, start.y + start.height - (viewport.y || 0)));
            y = start.y + start.height - height;
        }
        return {x, y, width, height};
    };
    const createWindowState = viewport => ({fullscreen: false, docked: true, dockWidth: 420, geometry: defaultGeometry(viewport)});
    const setFullscreen = (state, fullscreen, viewport) => {
        state.fullscreen = fullscreen;
        if (!fullscreen) { state.docked = true; }
        state.geometry = clampGeometry(state.geometry, viewport);
    };
    const safeSourceUrl = (url, base) => {
        if (!url || typeof url !== 'string') { return null; }
        try {
            const parsed = new URL(url, base);
            return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
        } catch (e) { return null; }
    };
    const proxyUrl = (url, base) => {
        const safeUrl = safeSourceUrl(url, base);
        if (!safeUrl) { return null; }
        return new URL(safeUrl).origin === new URL(base).origin ? safeUrl : null;
    };
    const element = (tag, className, text) => {
        const node = document.createElement(tag);
        node.className = className;
        if (text !== undefined) { node.textContent = text; }
        return node;
    };

    const init = config => {
        if (!config || !config.enabled) { return; }
        const root = document.querySelector('[data-rag-chat]');
        if (!root || root.dataset.initialized) { return; }
        const endpoint = proxyUrl(config.endpoint, window.location.href);
        if (!endpoint || !config.sesskey) { root.remove(); return; }
        root.dataset.initialized = 'true';
        const panel = root.querySelector('.rag-chat__panel');
        const launcher = root.querySelector('.rag-chat__launcher');
        const form = root.querySelector('form');
        const input = root.querySelector('textarea');
        const messages = root.querySelector('[role=log]');
        const status = root.querySelector('[data-role=status]');
        const error = root.querySelector('.rag-chat__error');
        const submit = root.querySelector('[type=submit]');
        const stop = root.querySelector('[data-action=stop]');
        const latest = root.querySelector('[data-action=latest]');
        let unread = false;
        const count = root.querySelector('[data-role=count]');
        const conversation = root.querySelector('[data-role=conversation]');
        const sourceScreen = root.querySelector('[data-role=sources]');
        const sourceContent = root.querySelector('[data-role=source-content]');
        const header = root.querySelector('.rag-chat__header');
        const viewport = () => {
            const visible = window.visualViewport;
            return visible ? {x: visible.offsetLeft, y: visible.offsetTop, width: Math.floor(visible.width), height: Math.floor(visible.height)} :
                {x: 0, y: 0, width: document.documentElement.clientWidth, height: window.innerHeight};
        };
        const windowState = createWindowState(viewport());
        let attempted = false;
        let sourceReturnFocus = null;
        let savedScroll = 0;
        let gesture = null;
        const maxLength = Number(config.maxLength) || 4000;
        let controller = null;
        let restoreFocus = null;
        const userMenu = document.querySelector('#carousel-item-main');
        const menuToggle = element('button', 'dropdown-item', 'Виртуальный ассистент');
        menuToggle.type = 'button';
        menuToggle.dataset.action = 'ragchat-toggle';
        menuToggle.setAttribute('role', 'menuitemcheckbox');
        menuToggle.setAttribute('tabindex', '-1');
        menuToggle.setAttribute('aria-controls', 'rag-chat-panel');
        if (userMenu) { userMenu.append(menuToggle); }
        root.querySelector('[data-role=date]').textContent = new Intl.DateTimeFormat('ru', {
            day: 'numeric', month: 'long'
        }).format(new Date());
        const greetingTime = root.querySelector('[data-role=greeting-time]');
        if (greetingTime) { greetingTime.append(messageTime(new Date().toISOString())); }

        const validate = () => {
            const validation = validationState(input.value, maxLength, attempted);
            error.hidden = !validation.visible;
            count.hidden = !validation.visible;
            const errors = {empty: 'Введите вопрос от 3 до ' + maxLength + ' символов.',
                short: 'Вопрос должен содержать не менее 3 символов.',
                overlength: 'Превышение максимального количества символов на ' + validation.excess};
            error.textContent = validation.visible ? errors[validation.reason] : '';
            input.setAttribute('aria-invalid', String(validation.visible));
            count.textContent = validation.length + ' / ' + maxLength;
            submit.disabled = Boolean(controller) || !input.value.trim();
        };
        const growInput = () => {
            if (panel.hidden || conversation.hidden) { return; }
            const style = window.getComputedStyle(input);
            const lineHeight = Number.parseFloat(style.lineHeight) || 22;
            const padding = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
            input.style.height = '0px';
            const size = composerSize(input.value ? input.scrollHeight : 0, lineHeight, padding, viewport().height * .35);
            input.style.height = size.height + 'px';
            input.style.overflowY = size.scroll ? 'auto' : 'hidden';
        };
        const applyGeometry = () => {
            const visible = viewport();
            windowState.geometry = clampGeometry(windowState.geometry, visible);
            panel.style.setProperty('--rag-view-left', (visible.x || 0) + 'px');
            panel.style.setProperty('--rag-view-top', (visible.y || 0) + 'px');
            panel.style.setProperty('--rag-view-width', visible.width + 'px');
            panel.style.setProperty('--rag-view-height', visible.height + 'px');
            const geometry = windowState.docked ? dockGeometry(windowState, visible) : windowState.geometry;
            const docked = windowState.docked && !windowState.fullscreen;
            const phone = visible.width <= 767;
            root.classList.toggle('rag-chat--phone', phone);
            root.querySelector('[data-action=minimize]').hidden = phone || !windowState.fullscreen;
            root.querySelector('[data-action=fullscreen]').hidden = phone || windowState.fullscreen;
            root.classList.toggle('rag-chat--fullscreen', windowState.fullscreen);
            root.classList.toggle('rag-chat--docked', docked);
            document.documentElement.style.setProperty('--rag-chat-dock-width', !panel.hidden && docked ? geometry.width + 'px' : '0px');
            panel.style.left = geometry.x + 'px';
            panel.style.top = geometry.y + 'px';
            panel.style.width = geometry.width + 'px';
            panel.style.height = geometry.height + 'px';
            if (!panel.hidden) { growInput(); }
        };
        const fullscreen = full => {
            setFullscreen(windowState, full, viewport());
            panel.setAttribute('role', full ? 'dialog' : 'complementary');
            if (full) { panel.setAttribute('aria-modal', 'true'); }
            if (!full) { panel.removeAttribute('aria-modal'); }
            root.querySelector('[data-action=fullscreen]').setAttribute('aria-pressed', String(full));
            applyGeometry();
        };
        const closeSources = (focus = true) => {
            sourceScreen.hidden = true;
            panel.setAttribute('aria-labelledby', 'rag-chat-title');
            header.hidden = false;
            conversation.hidden = false;
            growInput();
            if (focus && sourceReturnFocus && sourceReturnFocus.isConnected) {
                sourceReturnFocus.focus({preventScroll: true});
            }
            messages.scrollTop = savedScroll;
            updateLatest();
        };
        const openSources = (sources, button) => {
            savedScroll = messages.scrollTop;
            sourceReturnFocus = button;
            sourceContent.replaceChildren();
            sources.forEach(source => {
                const section = element('section', 'rag-chat__source');
                const label = source.doc || source.title || 'Учебный материал';
                const page = Number(source.page) > 0 ? ', с. ' + source.page : '';
                section.append(element('p', 'rag-chat__source-meta', label + page));
                section.append(element('p', 'rag-chat__excerpt', source.fragment || 'Текстовая выдержка недоступна.'));
                const url = safeSourceUrl(source.url, window.location.href);
                if (url) {
                    const link = element('a', '', 'Открыть оригинал ↗');
                    link.href = url;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.setAttribute('aria-label', 'Открыть оригинал: ' + label + ' (новая вкладка)');
                    section.append(link);
                }
                sourceContent.append(section);
            });
            header.hidden = true;
            conversation.hidden = true;
            sourceScreen.hidden = false;
            panel.setAttribute('aria-labelledby', 'rag-chat-sources-title');
            sourceContent.scrollTop = 0;
            root.querySelector('[data-action=back]').focus();
        };
        const nearLatest = () => messages.scrollHeight - messages.clientHeight - messages.scrollTop <= 64;
        const updateLatest = () => {
            if (!sourceScreen.hidden) { latest.hidden = true; return; }
            if (nearLatest()) { unread = false; }
            latest.hidden = !unread || nearLatest();
        };
        const scrollToLatest = () => { messages.scrollTop = messages.scrollHeight; unread = false; updateLatest(); };
        messages.addEventListener('scroll', updateLatest);
        const setBusy = busy => {
            submit.hidden = busy;
            stop.hidden = !busy;
            root.querySelectorAll('[data-action=regenerate]').forEach(button => { button.disabled = busy; });
            input.readOnly = busy;
            messages.setAttribute('aria-busy', String(busy));
            validate();
            growInput();
        };
        const preference = async enabled => {
            if (!config.preferenceendpoint) { return; }
            const url = proxyUrl(config.preferenceendpoint, window.location.href);
            if (!url) { return; }
            try {
                const response = await fetch(url, {
                    method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({enabled: enabled, sesskey: config.sesskey})
                });
                if (!response.ok) { throw new Error('preference'); }
            } catch (e) { status.textContent = 'Не удалось сохранить настройку видимости. Попробуйте снова.'; }
        };
        const show = (visible, persist = true, moveFocus = true) => {
            attempted = false;
            validate();
            panel.hidden = !visible;
            applyGeometry();
            launcher.hidden = visible;
            launcher.setAttribute('aria-expanded', String(visible));
            menuToggle.setAttribute('aria-checked', String(visible));
            if (visible && moveFocus) {
                restoreFocus = document.activeElement;
                if (sourceScreen.hidden) { input.focus(); }
                if (!sourceScreen.hidden) { root.querySelector('[data-action=back]').focus(); }
            }
            if (!visible && moveFocus) {
                const target = restoreFocus && restoreFocus.isConnected && restoreFocus.getClientRects().length ?
                    restoreFocus : launcher;
                target.focus();
            }
            if (persist) { preference(visible); }
        };
        const appendMessage = (text, kind) => {
            const article = element('article', 'rag-chat__message rag-chat__message--' + kind);
            article.append(element('span', 'sr-only', kind === 'user' ? 'Вы: ' : 'Ассистент: '));
            article.append(element('p', 'rag-chat__text', text));
            article.dataset.createdAt = new Date().toISOString();
            if (text) { article.append(messageTime(article.dataset.createdAt)); }
            messages.append(article);
            scrollToLatest();
            return article;
        };
        const icon = name => {
            const original = root.querySelector('[data-icon=' + name + '] .icon');
            return original ? original.cloneNode(true) : element('span', '', name === 'book' ? '▤' : '↻');
        };
        const renderedText = node => {
            const tag = String(node.tagName || '').toLowerCase();
            if (tag === 'button') { return ''; }
            if (tag === 'br') { return '\n'; }
            const children = Array.from(node.childNodes || node.children || []);
            const text = children.length ? children.map(renderedText).join('') : (node.textContent || '');
            if (['td', 'th'].includes(tag)) { return text + '\t'; }
            return /^(p|div|h[1-6]|li|pre|blockquote|tr|ul|ol|table)$/.test(tag) ? text + '\n' : text;
        };
        const copyText = async (text, button) => {
            try {
                if (!window.navigator.clipboard || !window.navigator.clipboard.writeText) { throw new Error('clipboard'); }
                await window.navigator.clipboard.writeText(text);
                button.textContent = 'Скопировано';
                status.textContent = 'Текст скопирован.';
            } catch (failure) {
                button.textContent = 'Не удалось скопировать';
                status.textContent = 'Не удалось скопировать. Выделите текст вручную.';
            }
        };
        const copyButton = (text, label, action) => {
            const button = element('button', 'rag-chat__copy', label);
            button.type = 'button';
            button.dataset.action = action;
            button.addEventListener('click', () => copyText(text, button));
            return button;
        };
        const renderAnswer = (article, text, kind, sources, query) => {
            article.className = 'rag-chat__message rag-chat__message--' + kind;
            article.replaceChildren();
            if (Array.isArray(sources) && sources.length) {
                const sourceButton = element('button', 'rag-chat__sources');
                sourceButton.type = 'button';
                sourceButton.append(icon('book'), document.createTextNode(sourceCountLabel(sources.length)));
                sourceButton.addEventListener('click', () => openSources(sources, sourceButton));
                article.append(sourceButton);
            }
            const content = element('div', 'rag-chat__text');
            if (kind === 'assistant') {
                const rendered = Markdown.render(text, {document, baseUrl: window.location.href, copyLabel: 'Скопировать код'});
                content.append(rendered.fragment);
                rendered.codeBlocks.forEach(block => {
                    block.button.addEventListener('click', () => copyText(block.text, block.button));
                });
            }
            if (kind !== 'assistant') { content.textContent = text; }
            article.append(content);
            if (kind === 'assistant') { article.dataset.answeredAt = new Date().toISOString(); }
            article.append(messageTime(article.dataset.answeredAt || article.dataset.createdAt));
            if (kind !== 'error') {
                article.append(copyButton(renderedText(content).replace(/\n{3,}/g, '\n\n').trim(), 'Скопировать ответ', 'copy-answer'));
                return;
            }
            const retryButton = element('button', 'rag-chat__regenerate');
            retryButton.type = 'button';
            retryButton.dataset.action = 'regenerate';
            retryButton.append(icon('repeat'), document.createTextNode('Повторить ответ'));
            retryButton.addEventListener('click', () => ask(query, article));
            article.append(retryButton);
        };
        const ask = async (query, retryArticle = null) => {
            if (controller) { return; }
            if (!query.trim()) { attempted = false; validate(); return; }
            if (queryError(query, maxLength)) { attempted = true; validate(); return; }
            const question = query.trim();
            let followResponse = true;
            if (!retryArticle) { appendMessage(question, 'user'); }
            const answer = retryArticle || appendMessage('', 'assistant');
            answer.className = 'rag-chat__message rag-chat__message--assistant rag-chat__message--pending';
            const pending = element('p', 'rag-chat__text', 'Генерирую ответ');
            const dots = element('span', 'rag-chat__loading-dots', '…');
            dots.setAttribute('aria-hidden', 'true');
            pending.append(dots);
            answer.replaceChildren(pending);
            if (!retryArticle) { input.value = ''; }
            attempted = false;
            const request = new AbortController();
            controller = request;
            status.textContent = 'Генерирую ответ…';
            setBusy(true);
            try {
                const response = await fetch(endpoint, {
                    method: 'POST', credentials: 'same-origin', signal: request.signal,
                    headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
                    body: JSON.stringify({query: question, courseid: config.courseid, sesskey: config.sesskey})
                });
                if (!response.ok) {
                    const failures = {401: 'Сессия истекла. Войдите в Moodle снова.',
                        403: 'Нет доступа к ассистенту или материалам этого курса.',
                        413: 'Вопрос слишком длинный. Сократите его и повторите.',
                        429: 'Слишком много запросов. Подождите немного и повторите.',
                        503: 'Ассистент временно недоступен. Обратитесь к администратору.'};
                    throw new Error(failures[response.status] || 'Во время генерации произошла ошибка. Повторите запрос.');
                }
                const result = await response.json();
                if (typeof result.answer !== 'string' || !result.answer.trim()) {
                    throw new Error('Сервис не вернул ответ. Попробуйте повторить запрос.');
                }
                if (request.signal.aborted) { throw new DOMException('Stopped', 'AbortError'); }
                followResponse = sourceScreen.hidden && nearLatest();
                renderAnswer(answer, result.answer, 'assistant', result.sources, question);
            } catch (failure) {
                const text = failure.name === 'AbortError' ? 'Получение ответа остановлено.' :
                    (failure instanceof TypeError ? 'Нет связи с сервисом. Проверьте подключение и повторите запрос.' : failure.message);
                followResponse = sourceScreen.hidden && nearLatest();
                renderAnswer(answer, text, 'error', [], question);
            } finally {
                if (controller === request) {
                    controller = null;
                    status.textContent = '';
                    setBusy(false);
                    if (followResponse) { scrollToLatest(); }
                    if (!followResponse) { unread = true; updateLatest(); }
                    if (!panel.hidden && sourceScreen.hidden && followResponse) { input.focus({preventScroll: true}); }
                }
            }
        };
        form.addEventListener('submit', event => { event.preventDefault(); ask(input.value); });
        input.addEventListener('input', () => { attempted = false; validate(); growInput(); });
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                ask(input.value);
            }
        });
        root.addEventListener('click', event => {
            const button = event.target.closest('[data-action]');
            if (!button) { return; }
            const action = button.dataset.action;
            if (action === 'toggle') { show(panel.hidden); }
            if (action === 'close') { show(false); }
            if (action === 'stop' && controller) { controller.abort(); }
            if (action === 'latest') { scrollToLatest(); messages.focus({preventScroll: true}); }
            if (action === 'back') { closeSources(); }
            if (action === 'minimize' && viewport().width > 767) { fullscreen(false); }
            if (action === 'fullscreen' && viewport().width > 767) { fullscreen(true); }
        });
        document.addEventListener('click', event => {
            if (event.target.closest('[data-action="ragchat-toggle"], [data-rag-toggle]')) {
                event.preventDefault(); show(panel.hidden);
            }
        });
        window.addEventListener('ragchat:toggle', () => show(panel.hidden));
        panel.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                if (!sourceScreen.hidden) { closeSources(); return; }
                if (windowState.fullscreen) { fullscreen(false); return; }
                show(false);
            }
            if (event.key !== 'Tab' || !root.classList.contains('rag-chat--fullscreen')) { return; }
            const controls = Array.from(panel.querySelectorAll('button, textarea, a, summary, [tabindex="0"]'))
                .filter(node => !node.hidden && !node.disabled && node.getClientRects().length);
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        });
        // Dock dragging detaches only after deliberate movement; controls never initiate gestures.
        panel.addEventListener('pointerdown', event => {
            if (windowState.fullscreen || viewport().width <= 767 || event.button !== 0) { return; }
            const handle = event.target.closest('[data-resize]');
            const dragHeader = event.target.closest('[data-drag-header]');
            if (!handle && (!dragHeader || event.target.closest('button, a, input, textarea, select'))) { return; }
            if (windowState.docked && handle && handle.dataset.resize !== 'w') { return; }
            event.preventDefault();
            gesture = {pointer: event.pointerId, x: event.clientX, y: event.clientY,
                geometry: windowState.docked ? dockGeometry(windowState, viewport()) : {...windowState.geometry},
                docked: windowState.docked, edge: handle ? handle.dataset.resize : '', moved: false};
            panel.setPointerCapture(event.pointerId);
        });
        const movePointer = event => {
            if (!gesture || gesture.pointer !== event.pointerId) { return; }
            if (viewport().width <= 767) { windowState.docked = true; endGesture(); return; }
            if (event.buttons === 0) { endGesture(true); return; }
            const dx = event.clientX - gesture.x;
            const dy = event.clientY - gesture.y;
            if (!gesture.moved && Math.hypot(dx, dy) < 5) { return; }
            gesture.moved = true;
            root.classList.add('rag-chat--dragging');
            if (gesture.docked && gesture.edge) {
                windowState.dockWidth = bound(gesture.geometry.width - dx, Math.min(320, viewport().width), dockWidthLimit(viewport()));
                applyGeometry();
                return;
            }
            windowState.docked = false;
            const start = gesture.docked ? {...gesture.geometry, height: Math.min(720, gesture.geometry.height)} : gesture.geometry;
            windowState.geometry = gesture.edge ? resizeGeometry(start, gesture.edge, dx, dy, viewport()) :
                clampGeometry({...start, x: start.x + dx, y: start.y + dy}, viewport());
            const right = (viewport().x || 0) + viewport().width;
            root.classList.toggle('rag-chat--snap-ready', right - windowState.geometry.x - windowState.geometry.width <= 32);
            applyGeometry();
        };
        panel.addEventListener('pointermove', movePointer);
        // Continue after capture loss; a viewport/layout change must not turn an active drag into text selection.
        window.addEventListener('pointermove', movePointer);
        const endGesture = (snap = false) => {
            const visible = viewport();
            const rightGap = (visible.x || 0) + visible.width - windowState.geometry.x - windowState.geometry.width;
            if (snap && gesture && gesture.moved && !windowState.fullscreen && rightGap <= 32) {
                windowState.docked = true;
            }
            gesture = null;
            root.classList.remove('rag-chat--dragging');
            root.classList.remove('rag-chat--snap-ready');
            applyGeometry();
        };
        panel.addEventListener('pointerup', () => endGesture(true));
        panel.addEventListener('pointercancel', () => endGesture(true));
        window.addEventListener('pointerup', () => endGesture(true));
        window.addEventListener('blur', () => endGesture(true));
        const viewportChanged = (resetDock = true) => {
            // Removing the dock reserve can itself emit visualViewport resize/scroll during the gesture.
            if (gesture && viewport().width > 767) { applyGeometry(); return; }
            if (resetDock && !windowState.fullscreen) { windowState.docked = true; }
            endGesture();
        };
        window.addEventListener('resize', () => viewportChanged());
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => viewportChanged());
            window.visualViewport.addEventListener('scroll', () => viewportChanged(false));
        }
        fullscreen(false);
        validate();
        show(Boolean(config.enabledpreference), false, false);
    };
    return {init, queryError, validationState, sourceCountLabel, composerSize, safeSourceUrl, proxyUrl,
        clampGeometry, defaultGeometry, dockGeometry, resizeGeometry, createWindowState, setFullscreen};
});

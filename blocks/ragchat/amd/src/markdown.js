/**
 * A deliberately bounded Markdown subset for untrusted chat answers.
 * No HTML parsing, resource loading, event binding or clipboard access.
 *
 * @module block_ragchat/markdown
 * @copyright 2026
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define([], function() {
    'use strict';

    const MAX_INPUT = 200000;
    const MAX_DEPTH = 12;
    const MAX_NODES = 12000;
    const LOOKAHEAD = 4096;

    /** Only browser-normalized HTTP(S) URLs, with relative references confined to the base origin. */
    const safeUrl = (value, baseUrl) => {
        if (!value || /[\s\u0000-\u001f\u007f<>"'`\\]/.test(value) || value.startsWith('//') ||
                /&(?:#|[a-z]+;)/i.test(value)) {
            return null;
        }
        const absolute = /^https?:\/\//i.test(value);
        if (!absolute && value.includes(':')) { return null; }
        try {
            const base = new URL(baseUrl);
            const url = new URL(value, base);
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
                    (!absolute && url.origin !== base.origin)) {
                return null;
            }
            return {href: url.href, external: url.origin !== base.origin};
        } catch (error) {
            return null;
        }
    };

    const listMarker = line => /^( {0,12})([-+*]|\d{1,9}[.)]) +(.+)$/.exec(line);
    const fenceMarker = line => /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    const rule = line => /^ {0,3}(?:\* *\* *\*[ *]*|- *- *-[ -]*|_ *_ *_[ _]*)$/.test(line);
    const heading = line => /^ {0,3}(#{1,6}) +(.+)$/.exec(line);
    const quote = line => /^ {0,3}> ?/.test(line);
    const blockStart = line => !line.trim() || fenceMarker(line) || heading(line) || rule(line) ||
        quote(line) || listMarker(line);

    /** Split table cells while keeping escaped and code-span pipes within a cell. */
    const cells = line => {
        const result = [];
        let value = '';
        let code = false;
        const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
        for (let index = 0; index < trimmed.length; index++) {
            const char = trimmed[index];
            if (char === '\\' && trimmed[index + 1] === '|') { value += '\\|'; index++; continue; }
            if (char === '`') { code = !code; }
            if (char === '|' && !code) { result.push(value.trim()); value = ''; continue; }
            value += char;
        }
        result.push(value.trim());
        return result;
    };
    const tableAlignment = line => {
        if (!line || !line.includes('|')) { return null; }
        const columns = cells(line);
        if (!columns.every(cell => /^:?-{3,}:?$/.test(cell))) { return null; }
        return columns.map(cell => cell.startsWith(':') ? (cell.endsWith(':') ? 'center' : 'left') :
            (cell.endsWith(':') ? 'right' : ''));
    };

    /**
     * Render without attaching to the document. Oversized/over-budget content becomes plain text.
     * @param {String} text Markdown source (citations such as (S1) stay ordinary text).
     * @param {Object} options document, baseUrl, copyLabel (all optional in a browser).
     * @returns {Object} {fragment, codeBlocks: [{button, code, text}], limited}
     */
    const render = (text, options = {}) => {
        const doc = options.document || document;
        const source = typeof text === 'string' ? text : '';
        const baseUrl = options.baseUrl || doc.baseURI;
        const fragment = doc.createDocumentFragment();
        const codeBlocks = [];
        let limited = false;
        let nodeCount = 0;
        let work = MAX_INPUT * 20;
        const node = (tag, content) => {
            nodeCount++;
            const element = doc.createElement(tag);
            if (content !== undefined) { element.textContent = content; }
            return element;
        };
        const plain = (parent, content) => { parent.append(doc.createTextNode(content)); };
        const exhausted = depth => {
            if (depth < MAX_DEPTH && nodeCount < MAX_NODES && work > 0) { return false; }
            limited = true;
            return true;
        };
        // Each lookahead charges its full window, even when no closing delimiter exists.
        const find = (value, delimiter, start) => {
            const end = Math.min(value.length, start + LOOKAHEAD);
            work -= end - start;
            const found = value.slice(start, end).indexOf(delimiter);
            return found >= 0 ? start + found : -1;
        };
        const inline = (parent, value, depth = 0) => {
            let index = 0;
            let pending = '';
            const flush = () => { if (pending) { plain(parent, pending); pending = ''; } };
            while (index < value.length) {
                if (exhausted(depth)) { pending += value.slice(index); break; }
                const char = value[index];
                if (char === '\\' && /[\\`*_[\]{}()#+.!|>~-]/.test(value[index + 1] || '')) {
                    pending += value[index + 1]; index += 2; continue;
                }
                const image = char === '!' && value[index + 1] === '[';
                if (char === '[' || image) {
                    const start = index + (image ? 2 : 1);
                    const labelEnd = find(value, '](', start);
                    const urlEnd = labelEnd >= 0 ? find(value, ')', labelEnd + 2) : -1;
                    if (urlEnd >= 0) {
                        const label = value.slice(start, labelEnd);
                        const destination = value.slice(labelEnd + 2, urlEnd);
                        const target = safeUrl(destination, baseUrl);
                        flush();
                        if (image || !target) { plain(parent, label); }
                        if (!image && target) {
                            const link = node('a');
                            link.setAttribute('href', target.href);
                            if (target.external) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
                            inline(link, label, depth + 1);
                            parent.append(link);
                        }
                        index = urlEnd + 1; continue;
                    }
                }
                const delimiter = value.startsWith('**', index) ? '**' :
                    (value.startsWith('__', index) ? '__' : (value.startsWith('~~', index) ? '~~' : char));
                if (['**', '__', '~~', '*', '_', '`'].includes(delimiter)) {
                    let end = find(value, delimiter, index + delimiter.length);
                    // In **bold *italic*** the last two stars close the outer strong element.
                    if ((delimiter === '**' || delimiter === '__') && end >= 0 &&
                            value[end + 2] === delimiter[0] && value[end + 3] !== delimiter[0]) { end++; }
                    if (end > index + delimiter.length) {
                        flush();
                        const tag = delimiter === '`' ? 'code' :
                            (delimiter === '~~' ? 'del' : (delimiter.length === 2 ? 'strong' : 'em'));
                        const child = node(tag);
                        const content = value.slice(index + delimiter.length, end);
                        if (tag === 'code') { child.textContent = content; }
                        if (tag !== 'code') { inline(child, content, depth + 1); }
                        parent.append(child);
                        index = end + delimiter.length; continue;
                    }
                }
                pending += char; index++;
            }
            flush();
        };
        const codeBlock = (parent, content, info) => {
            const wrapper = node('div');
            wrapper.className = 'rag-chat__code-block';
            const button = node('button', options.copyLabel || 'Копировать код');
            button.type = 'button';
            button.dataset.action = 'copy-code';
            button.dataset.codeIndex = String(codeBlocks.length);
            const pre = node('pre');
            const code = node('code', content);
            const language = info.trim();
            if (/^[a-zA-Z0-9][a-zA-Z0-9_+-]{0,31}$/.test(language)) {
                code.className = 'language-' + language.toLowerCase();
            }
            pre.append(code);
            wrapper.append(button, pre);
            parent.append(wrapper);
            codeBlocks.push({button, code, text: content});
        };
        const blocks = (parent, lines, depth = 0) => {
            let index = 0;
            while (index < lines.length) {
                if (exhausted(depth)) { plain(parent, lines.slice(index).join('\n')); return; }
                const line = lines[index];
                if (!line.trim()) { index++; continue; }
                const fence = fenceMarker(line);
                if (fence) {
                    const content = [];
                    index++;
                    while (index < lines.length) {
                        const close = fenceMarker(lines[index]);
                        if (close && close[1][0] === fence[1][0] && close[1].length >= fence[1].length &&
                                !close[2].trim()) { break; }
                        content.push(lines[index++]);
                    }
                    // split() retains the last empty line: do not append an extra newline at EOF.
                    const closed = index < lines.length;
                    codeBlock(parent, content.join('\n') + (closed && content.length ? '\n' : ''), fence[2]);
                    if (closed) { index++; }
                    continue;
                }
                const title = heading(line);
                if (title) {
                    const element = node('h' + title[1].length);
                    inline(element, title[2].replace(/ +#+ *$/, ''));
                    parent.append(element); index++; continue;
                }
                if (rule(line)) { parent.append(node('hr')); index++; continue; }
                if (quote(line)) {
                    const quoted = [];
                    while (index < lines.length && quote(lines[index])) {
                        quoted.push(lines[index++].replace(/^ {0,3}> ?/, ''));
                    }
                    const element = node('blockquote');
                    blocks(element, quoted, depth + 1); parent.append(element); continue;
                }
                const marker = listMarker(line);
                if (marker) {
                    const ordered = /^\d/.test(marker[2]);
                    const list = node(ordered ? 'ol' : 'ul');
                    if (ordered && parseInt(marker[2], 10) !== 1) { list.setAttribute('start', String(parseInt(marker[2], 10))); }
                    while (index < lines.length) {
                        const itemMarker = listMarker(lines[index]);
                        if (!itemMarker || itemMarker[1].length !== marker[1].length ||
                                /^\d/.test(itemMarker[2]) !== ordered) { break; }
                        const item = node('li');
                        let content = itemMarker[3];
                        const task = /^\[([ xX])\] +/.exec(content);
                        if (task) {
                            const checkbox = node('input');
                            checkbox.type = 'checkbox'; checkbox.disabled = true;
                            checkbox.setAttribute('aria-label', task[1] === ' ' ? 'Не выполнено' : 'Выполнено');
                            if (task[1] !== ' ') { checkbox.setAttribute('checked', ''); }
                            item.append(checkbox); plain(item, ' ');
                            content = content.slice(task[0].length);
                        }
                        inline(item, content); index++;
                        const continuation = [];
                        const indent = itemMarker[0].length - itemMarker[3].length;
                        while (index < lines.length && lines[index].startsWith(' '.repeat(indent))) {
                            continuation.push(lines[index++].slice(indent));
                        }
                        if (continuation.length) { blocks(item, continuation, depth + 1); }
                        list.append(item);
                        if (exhausted(depth)) { break; }
                    }
                    parent.append(list); continue;
                }
                const alignment = index + 1 < lines.length && line.includes('|') ? tableAlignment(lines[index + 1]) : null;
                if (alignment && alignment.length > 64) {
                    limited = true; plain(parent, lines.slice(index).join('\n')); return;
                }
                if (alignment && cells(line).length === alignment.length) {
                    const table = node('table');
                    const head = node('thead');
                    const body = node('tbody');
                    const row = (container, values, tag) => {
                        const tr = node('tr');
                        alignment.forEach((align, column) => {
                            const cell = node(tag);
                            if (align) { cell.dataset.align = align; cell.style.textAlign = align; }
                            inline(cell, values[column] || ''); tr.append(cell);
                        });
                        container.append(tr);
                    };
                    row(head, cells(line), 'th'); index += 2;
                    while (index < lines.length && lines[index].trim() && lines[index].includes('|') && !exhausted(depth)) {
                        row(body, cells(lines[index++]), 'td');
                    }
                    table.append(head, body); parent.append(table); continue;
                }
                const paragraph = [line]; index++;
                while (index < lines.length && !blockStart(lines[index]) &&
                        !(lines[index].includes('|') && tableAlignment(lines[index + 1]))) {
                    paragraph.push(lines[index++]);
                }
                const element = node('p'); inline(element, paragraph.join('\n')); parent.append(element);
            }
        };
        if (source.length > MAX_INPUT) {
            limited = true;
            plain(fragment, source);
        } else {
            blocks(fragment, source.replace(/\r\n?/g, '\n').split('\n'));
        }
        return {fragment, codeBlocks, limited};
    };
    return {render};
});

// Run: NODE_PATH=/private/tmp/rag-markdown-dom/node_modules node --test tests/markdown_test.cjs
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {parseHTML} = require('linkedom');
const {document} = parseHTML('<html><body></body></html>');
let markdown;
vm.runInNewContext(fs.readFileSync(__dirname + '/../amd/src/markdown.js', 'utf8'), {
    define: (dependencies, factory) => { markdown = factory(); }, document, URL
});
function render(source, options = {}) {
    const result = markdown.render(source, {document, baseUrl: 'https://moodle.test/course/view.php?id=1', ...options});
    const root = document.createElement('div');
    assert.equal(result.fragment.nodeType, 11);
    root.append(result.fragment);
    return {root, ...result};
}
test('renders paragraphs, headings, nested emphasis, strike, rules and source citations', () => {
    const {root} = render('# Heading\n\nA **bold and *italic*** with ~~strike~~ (S1).\nnext line\n\n---\n\nLast');
    assert.equal(root.querySelector('h1').textContent, 'Heading');
    assert.equal(root.querySelector('strong em').textContent, 'italic');
    assert.equal(root.querySelector('del').textContent, 'strike');
    assert.equal(root.querySelectorAll('p').length, 2);
    assert.match(root.textContent, /\(S1\)\.\nnext line/);
    assert.equal(root.querySelectorAll('hr').length, 1);
});
test('renders ordered, nested unordered and read-only task lists and blockquotes', () => {
    const {root} = render('3. three\n4. four\n   - nested\n   - [x] done\n   - [ ] todo\n\n> quoted **bold**\n>\n> - item');
    assert.equal(root.querySelector('ol').getAttribute('start'), '3');
    assert.equal(root.querySelectorAll('ol > li').length, 2);
    assert.equal(root.querySelectorAll('ol ul > li').length, 3);
    const boxes = root.querySelectorAll('input');
    assert.equal(boxes.length, 2);
    assert.equal(boxes[0].hasAttribute('checked'), true);
    assert.equal(boxes[1].hasAttribute('checked'), false);
    boxes.forEach(box => { assert.equal(box.type, 'checkbox'); assert.ok(box.disabled); });
    assert.equal(root.querySelector('blockquote strong').textContent, 'bold');
    assert.equal(root.querySelector('blockquote li').textContent, 'item');
});
test('renders tables with alignment, escaped pipes and inline code pipes', () => {
    const {root} = render('| Left | Right |\n| :--- | ---: |\n| **yes** | `a|b` |\n| a\\|b | next |');
    assert.equal(root.querySelectorAll('th').length, 2);
    assert.equal(root.querySelectorAll('tbody tr').length, 2);
    assert.equal(root.querySelector('td code').textContent, 'a|b');
    assert.equal(root.querySelectorAll('td')[2].textContent, 'a|b');
    assert.equal(root.querySelectorAll('th')[1].getAttribute('data-align'), 'right');
});
test('preserves raw code whitespace and returns explicit copy action metadata', () => {
    const source = 'Use `a < b`\n\n```js\n  <script>x()</script>\n\n  a  b\n```';
    const {root, codeBlocks} = render(source, {copyLabel: 'Copy code'});
    assert.equal(root.querySelector('p code').textContent, 'a < b');
    const code = root.querySelector('pre code');
    assert.equal(code.className, 'language-js');
    assert.equal(code.textContent, '  <script>x()</script>\n\n  a  b\n');
    const button = root.querySelector('button');
    assert.equal(button.type, 'button');
    assert.equal(button.textContent, 'Copy code');
    assert.equal(button.dataset.action, 'copy-code');
    assert.equal(button.dataset.codeIndex, '0');
    assert.equal(codeBlocks[0].button, button);
    assert.equal(codeBlocks[0].code, code);
    assert.equal(codeBlocks[0].text, code.textContent);
    assert.equal(root.querySelectorAll('script').length, 0);
});
test('allows HTTP links and useful relative links without automatic resource fetching', () => {
    const {root} = render('[external](https://docs.test/a) [local](/mod/book/view.php?id=4) [anchor](#part) ![diagram](https://tracker.test/pixel)');
    const links = root.querySelectorAll('a');
    assert.equal(links.length, 3);
    assert.equal(links[0].target, '_blank');
    assert.equal(links[0].rel, 'noopener noreferrer');
    assert.equal(links[1].getAttribute('target'), null);
    assert.equal(links[2].getAttribute('href'), 'https://moodle.test/course/view.php?id=1#part');
    assert.match(root.textContent, /diagram/);
    assert.equal(root.querySelectorAll('img,iframe,object,embed,link,style,script').length, 0);
});
test('rejects active URLs including encoded, control-character and protocol-relative payloads', () => {
    for (const url of ['javascript:alert', 'JaVaScRiPt:alert', 'data:text/html,x', 'blob:https://evil/x',
        'javascript&#58;alert', 'jav&#x61;script:alert', '%6aavascript:alert', '//evil.test/x',
        'java\tscript:alert', 'java\u0000script:alert', '\\\\evil.test/x']) {
        const {root} = render('[click](' + url + ')');
        assert.equal(root.querySelectorAll('a').length, 0, url);
    }
});
test('raw HTML, image events, attributes and code info strings remain inert', () => {
    const {root} = render('<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n<a href="javascript:x" onclick="x">link</a>\n\n```js" onmouseover="x\n<img src=x>\n```\n\n[x](https://safe.test/ "onclick=x")');
    assert.equal(root.querySelectorAll('script,img,[onclick],[onerror],[onmouseover]').length, 0);
    assert.match(root.textContent, /<script>/);
    assert.equal(root.querySelector('pre code').className, '');
    for (const node of root.querySelectorAll('*')) {
        for (const attr of node.attributes) { assert.ok(!/^on/i.test(attr.name)); }
    }
});
test('handles unclosed fences, escapes, unclosed markup and long input without content loss', () => {
    assert.equal(render('```text\n a\n\n').root.querySelector('pre code').textContent, ' a\n\n');
    assert.equal(render('\\*literal\\* **unclosed').root.textContent, '*literal* **unclosed');
    const source = '['.repeat(50000) + '*'.repeat(50000) + '> '.repeat(10000);
    const start = performance.now();
    const result = render(source);
    assert.ok(performance.now() - start < 3000);
    assert.ok(result.root.textContent.length > 0);
    const huge = 'x'.repeat(300000);
    const fallback = render(huge);
    assert.equal(fallback.root.textContent, huge);
    assert.equal(fallback.limited, true);
    assert.ok(fallback.root.childNodes.length <= 2);
});
test('bounds deeply nested quotes and wide tables rather than creating unlimited DOM', () => {
    const quoted = render('> '.repeat(3000) + 'deep');
    assert.equal(quoted.limited, true);
    assert.ok(quoted.root.querySelectorAll('blockquote').length <= 12);
    assert.match(quoted.root.textContent, /deep/);
    const source = '|x'.repeat(20000) + '|\n' + '|---'.repeat(20000) + '|';
    const wide = render(source);
    assert.ok(wide.root.querySelectorAll('*').length < 12010);
    assert.equal(wide.limited, true);
    assert.ok(wide.root.textContent.includes('x'));
});
test('renders all six heading levels, tilde fences, underscore emphasis and Unicode text', () => {
    const {root} = render('## Два\n### Три\n#### Четыре\n##### Пять\n###### Шесть\n\n__Жирный__ _курсив_\n\n~~~c++\nα < β\n~~~');
    for (let level = 2; level <= 6; level++) { assert.ok(root.querySelector('h' + level)); }
    assert.equal(root.querySelector('strong').textContent, 'Жирный');
    assert.equal(root.querySelector('em').textContent, 'курсив');
    assert.equal(root.querySelector('pre code').className, 'language-c++');
    assert.equal(root.querySelector('pre code').textContent, 'α < β\n');
});
test('caps many elements and unmatched delimiters, preserving the trailing answer', () => {
    const sources = [
        '# h\n'.repeat(20000) + 'TAIL',
        '[unclosed '.repeat(15000) + 'TAIL',
        '**x** '.repeat(20000) + 'TAIL',
        ('|a|b|\n').repeat(20000) + 'TAIL',
        '- x\n'.repeat(20000) + 'TAIL'
    ];
    for (const source of sources) {
        const started = performance.now();
        const {root} = render(source);
        assert.ok(performance.now() - started < 3000);
        assert.ok(root.querySelectorAll('*').length < 12100);
        assert.match(root.textContent, /TAIL$/);
    }
});
test('valid citations map to exact source indices while code, links and unknown labels stay literal', () => {
    const {root, citations} = render('Проект[S1] **(S2)** [S1] [S0] [S3] [S01] (Sx) [[S1]] (S1]\n\n`[S1] (S2)`\n\n```\n[S1]\n```\n\n[(S1)](https://docs.test) [S1](https://docs.test) https://docs.test/(S1)', {sourceCount: 2});
    assert.deepEqual(Array.from(citations, citation => citation.index), [0, 1, 0]);
    assert.deepEqual(Array.from(citations, citation => citation.button.textContent), ['[S1]', '(S2)', '[S1]']);
    assert.equal(root.querySelectorAll('a button, code button, pre button').length, 0);
    assert.equal(citations[1].button.type, 'button');
    assert.match(citations[1].button.getAttribute('aria-label'), /S2/);
    assert.equal(render('[S1]').root.querySelectorAll('.rag-chat__citation').length, 0);
});

test('adjacent citations remain individually clickable without changing their visible labels', () => {
    const result = render('[S1][S2] (S1)(S2)', {sourceCount: 2});
    assert.deepEqual(Array.from(result.citations, citation => citation.index), [0, 1, 0, 1]);
    assert.equal(result.root.textContent, '[S1][S2] (S1)(S2)');
});

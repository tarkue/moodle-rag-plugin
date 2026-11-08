/** Produce the named modules consumed by Moodle's RequireJS loader. */
const fs = require('node:fs');
const path = require('node:path');
for (const name of ['chat', 'markdown']) {
    const source = fs.readFileSync(path.join(__dirname, 'amd/src', name + '.js'), 'utf8');
    fs.writeFileSync(path.join(__dirname, 'amd/build', name + '.min.js'),
        source.replace(/^define\(/m, 'define("block_ragchat/' + name + '", '));
}

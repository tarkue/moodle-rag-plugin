/** Keep anonymous AMD modules; each installed Moodle transport owns module naming. */
const fs = require('node:fs');
const path = require('node:path');
for (const name of ['chat', 'markdown', 'history', 'legacy']) {
    if (!fs.existsSync(path.join(__dirname, 'amd/src', name + '.js'))) { continue; }
    const source = fs.readFileSync(path.join(__dirname, 'amd/src', name + '.js'), 'utf8');
    fs.writeFileSync(path.join(__dirname, 'amd/build', name + '.min.js'), source);
}

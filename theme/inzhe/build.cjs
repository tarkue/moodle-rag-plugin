/** Produce the named module consumed by Moodle's RequireJS loader. */
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'amd/src/catalogue.js'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'amd/build/catalogue.min.js'),
    source.replace('define([', 'define("theme_inzhe/catalogue", ['));

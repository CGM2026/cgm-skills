const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../assets/working-page/work/build_print_study.js'), 'utf8');
const start = source.indexOf('function shortPlace(name){');
const end = source.indexOf('\nconst place=shortPlace', start);
assert.ok(start >= 0 && end > start);
const shortPlace = new Function(`${source.slice(start, end)}; return shortPlace;`)();

assert.equal(shortPlace('福建省宁德市柘荣县（县城定位）'), '福建·柘荣');
assert.equal(shortPlace('北京市朝阳区'), '北京·朝阳');
assert.equal(shortPlace('广西壮族自治区桂林市阳朔县'), '广西·阳朔');
assert.equal(shortPlace('北京'), '北京');
assert.equal(shortPlace('Greenwich'), 'Greenwich');
console.log('Location label cases passed.');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const site = path.join(__dirname, '../cloudflare-links');
const code = fs.readFileSync(path.join(site, 'redirect.js'), 'utf8');
const apple = 'https://apps.apple.com/app/id6809481571';
const google = 'https://play.google.com/store/apps/details?id=com.laserox.quest';
const cases = [
  ['Android challenge', '/c/Challenge-01', 'Mozilla/5.0 (Linux; Android 16; Pixel 9)', 5, google],
  ['iPhone challenge', '/c/Challenge-01', 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)', 5, apple],
  ['iPad challenge', '/c/Challenge-01', 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X)', 5, apple],
  ['iPad desktop UA', '/c/Challenge-01', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 5, apple],
  ['Mac desktop', '/c/Challenge-01', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 0, null],
  ['Windows desktop', '/c/Challenge-01', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0, null],
  ['Android homepage', '/', 'Android', 5, null],
  ['iPhone homepage', '/', 'iPhone', 5, null],
  ['Empty challenge', '/c/', 'Android', 5, null],
  ['Invalid token', '/c/https://evil.example', 'iPhone', 5, null],
  ['Encoded token', '/c/%2F', 'Android', 5, null],
  ['Oversized token', '/c/' + 'a'.repeat(201), 'Android', 5, null],
  ['Privacy untouched', '/privacy', 'iPhone', 5, null],
  ['Support untouched', '/support', 'Android', 5, null],
];
for (const [name, pathname, userAgent, maxTouchPoints, expected] of cases) {
  let destination = null;
  const message = { textContent: '' };
  vm.runInNewContext(code, { location: { pathname, replace: value => { destination = value; } }, navigator: { userAgent, maxTouchPoints }, document: { getElementById: () => message } });
  assert.equal(destination, expected, name);
  console.log('PASS', name);
}
const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
assert(html.includes(`href="${apple}"`) && html.includes(`href="${google}"`));
for (const [, asset] of html.matchAll(/(?:src|href)="\/([^"#]*)"/g)) {
  assert(fs.existsSync(path.join(site, asset)) || fs.existsSync(path.join(site, asset + '.html')), `Missing asset ${asset}`);
}
console.log('PASS store buttons and all local assets/links');

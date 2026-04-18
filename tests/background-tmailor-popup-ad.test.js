const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('background handles the tmailor popup-ad cleanup request by closing opener tabs', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

  assert.match(source, /case 'TMAILOR_CLOSE_POPUP_AD_TAB': \{/);
  assert.match(source, /sender\.tab\?\.id/);
  assert.match(source, /chrome\.tabs\.query\(\{\s*windowId\s*\}\)/);
  assert.match(source, /tab\.openerTabId/);
  assert.match(source, /senderTabId/);
  assert.match(source, /chrome\.tabs\.remove\(/);
});

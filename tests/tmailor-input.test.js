const test = require('node:test');
const assert = require('node:assert/strict');

const { extractEmailCandidate, pickTmailorCandidate } = require('../shared/tmailor-input.js');

test('extractEmailCandidate returns the first email-looking token when extra text is present', () => {
  assert.equal(extractEmailCandidate('mailbox: User@Test.com copied'), 'User@Test.com');
});

test('pickTmailorCandidate prefers the current input value over clipboard contents', () => {
  assert.deepEqual(
    pickTmailorCandidate('typed@example.com', 'clipboard@example.com'),
    { candidate: 'typed@example.com', source: 'input' }
  );
});

test('pickTmailorCandidate falls back to clipboard contents when the input is empty', () => {
  assert.deepEqual(
    pickTmailorCandidate('', 'clipboard@example.com'),
    { candidate: 'clipboard@example.com', source: 'clipboard' }
  );
});

test('pickTmailorCandidate can prefer clipboard contents over stale input during paste validation', () => {
  assert.deepEqual(
    pickTmailorCandidate('stale@example.com', 'clipboard@example.com', { preferClipboard: true }),
    { candidate: 'clipboard@example.com', source: 'clipboard' }
  );
});

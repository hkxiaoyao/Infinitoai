(function(root, factory) {
  const exports = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.TmailorInput = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function() {
  function extractEmailCandidate(rawText) {
    const text = String(rawText || '').trim();
    const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    return (match?.[0] || text).trim();
  }

  function pickTmailorCandidate(inputValue, clipboardText, options = {}) {
    const preferClipboard = Boolean(options?.preferClipboard);
    if (preferClipboard) {
      const clipboardCandidate = extractEmailCandidate(clipboardText);
      if (clipboardCandidate) {
        return { candidate: clipboardCandidate, source: 'clipboard' };
      }
    }

    const inputCandidate = extractEmailCandidate(inputValue);
    if (inputCandidate) {
      return { candidate: inputCandidate, source: 'input' };
    }

    const clipboardCandidate = extractEmailCandidate(clipboardText);
    return {
      candidate: clipboardCandidate,
      source: clipboardCandidate ? 'clipboard' : '',
    };
  }

  return {
    extractEmailCandidate,
    pickTmailorCandidate,
  };
});

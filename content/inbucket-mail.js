// content/inbucket-mail.js — Content script for Inbucket polling (steps 4, 7)
// Injected dynamically on the configured Inbucket host
//
// Supported page:
// - /m/<mailbox>/

(function() {
if (window.__MULTIPAGE_INBUCKET_MAIL_LOADED) {
  console.log('[Infinitoai:inbucket-mail] Content script already loaded on', location.href);
  return;
}
window.__MULTIPAGE_INBUCKET_MAIL_LOADED = true;

const INBUCKET_PREFIX = '[Infinitoai:inbucket-mail]';
const isTopFrame = window === window.top;
const SEEN_MAIL_IDS_KEY = 'seenInbucketMailIds';
const { getStepMailMatchProfile, matchesSubjectPatterns } = MailMatching;
const { isMailFresh, parseMailTimestampCandidates } = MailFreshness;
const { findLatestMatchingItem } = LatestMail;

console.log(INBUCKET_PREFIX, 'Content script loaded on', location.href, 'frame:', isTopFrame ? 'top' : 'child');

if (!isTopFrame) {
  console.log(INBUCKET_PREFIX, 'Skipping child frame');
} else {

let seenMailIds = new Set();

async function loadSeenMailIds() {
  try {
    const data = await chrome.storage.session.get(SEEN_MAIL_IDS_KEY);
    if (Array.isArray(data[SEEN_MAIL_IDS_KEY])) {
      seenMailIds = new Set(data[SEEN_MAIL_IDS_KEY]);
      console.log(INBUCKET_PREFIX, `Loaded ${seenMailIds.size} previously seen mail ids`);
    }
  } catch (err) {
    console.warn(INBUCKET_PREFIX, 'Session storage unavailable, using in-memory seen mail ids:', err?.message || err);
  }
}

async function persistSeenMailIds() {
  try {
    await chrome.storage.session.set({ [SEEN_MAIL_IDS_KEY]: [...seenMailIds] });
  } catch (err) {
    console.warn(INBUCKET_PREFIX, 'Could not persist seen mail ids, continuing in-memory only:', err?.message || err);
  }
}

loadSeenMailIds();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'POLL_EMAIL') {
    resetStopState(message.controlSequence);
    handlePollEmail(message.step, message.payload).then(result => {
      sendResponse(result);
    }).catch(err => {
      if (isStopError(err)) {
        log(`Step ${message.step}: Stopped by user.`, 'warn');
        sendResponse({ stopped: true, error: err.message });
        return;
      }
      reportError(message.step, err.message);
      sendResponse({ error: err.message });
    });
    return true;
  }
});

function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function extractVerificationCode(text) {
  const matchCn = text.match(/(?:代码为|验证码[^0-9]*?)[\s：:]*(\d{6})/);
  if (matchCn) return matchCn[1];

  const matchJa = text.match(/(?:(?:認証|確認)?コード)\s*(?:は|[:：])?\s*(\d{6})/i);
  if (matchJa) return matchJa[1];

  const matchEn = text.match(/code[:\s]+is[:\s]+(\d{6})|code[:\s]+(\d{6})/i);
  if (matchEn) return matchEn[1] || matchEn[2];

  const match6 = text.match(/\b(\d{6})\b/);
  if (match6) return match6[1];

  return null;
}

function rowMatchesFilters(step, mail, senderFilters, subjectFilters, targetEmail) {
  const sender = normalizeText(mail.sender);
  const subject = normalizeText(mail.subject);
  const mailbox = normalizeText(mail.mailbox);
  const combined = normalizeText(mail.combinedText);
  const targetLocal = normalizeText((targetEmail || '').split('@')[0]);
  const subjectProfile = getStepMailMatchProfile(step);

  const senderMatch = senderFilters.some(f => sender.includes(f.toLowerCase()) || combined.includes(f.toLowerCase()));
  const subjectMatch = subjectFilters.some(f => subject.includes(f.toLowerCase()) || combined.includes(f.toLowerCase()));
  const stepSpecificSubjectMatch = matchesSubjectPatterns(mail.subject || mail.combinedText, subjectProfile);
  const mailboxMatch = Boolean(targetLocal) && mailbox.includes(targetLocal);
  const forwardedDuck = /duckduckgo|forward(?:ed)?\s*by/i.test(mail.combinedText);
  const code = extractVerificationCode(mail.combinedText);
  const keywordMatch = /openai|chatgpt|verify|verification|confirm|login|验证码|代码|認証|確認|コード|ログイン/.test(combined);

  if (mailboxMatch) return { matched: true, mailboxMatch, code };
  if (stepSpecificSubjectMatch) return { matched: true, mailboxMatch: false, code };
  if (!subjectProfile && (senderMatch || subjectMatch)) return { matched: true, mailboxMatch: false, code };
  if (!subjectProfile && code && (forwardedDuck || keywordMatch)) return { matched: true, mailboxMatch: false, code };

  return { matched: false, mailboxMatch: false, code };
}

function findMailboxEntries() {
  return document.querySelectorAll('.message-list-entry');
}

function getMailboxEntryId(entry, index = 0) {
  const explicitId = entry.getAttribute('data-id') || entry.dataset?.id || '';
  if (explicitId) return explicitId;

  const subject = entry.querySelector('.subject')?.textContent?.trim() || '';
  const sender = entry.querySelector('.from')?.textContent?.trim() || '';
  const dateText = entry.querySelector('.date')?.textContent?.trim() || '';

  return `mailbox:${index}:${normalizeText(subject)}|${normalizeText(sender)}|${normalizeText(dateText)}`;
}

function parseMailboxEntry(entry, index = 0) {
  const subject = entry.querySelector('.subject')?.textContent?.trim() || '';
  const sender = entry.querySelector('.from')?.textContent?.trim() || '';
  const dateText = entry.querySelector('.date')?.textContent?.trim() || '';
  const combinedText = [subject, sender, dateText].filter(Boolean).join(' ');

  return {
    entry,
    dateText,
    sender,
    mailbox: '',
    subject,
    timestamp: parseMailTimestampCandidates([dateText], { now: Date.now() }),
    unread: entry.classList.contains('unseen'),
    combinedText,
    mailId: getMailboxEntryId(entry, index),
  };
}

function getCurrentMailboxIds() {
  const ids = new Set();
  Array.from(findMailboxEntries()).forEach((entry, index) => {
    ids.add(getMailboxEntryId(entry, index));
  });
  return ids;
}

async function refreshMailbox() {
  const refreshButton = document.querySelector('button[alt="Refresh Mailbox"]');
  if (!refreshButton) return;

  simulateClick(refreshButton);
  await sleep(800);
}

async function openMailboxEntry(entry) {
  simulateClick(entry);

  for (let i = 0; i < 20; i++) {
    if (entry.classList.contains('selected') || document.querySelector('.message-header, .message-body, .button-bar')) {
      return;
    }
    await sleep(150);
  }
}

async function deleteCurrentMailboxMessage(step) {
  try {
    const deleteButton = await waitForElement('.button-bar button.danger', 5000);
    simulateClick(deleteButton);
    log(`Step ${step}: Deleted mailbox message`, 'ok');
    await sleep(1200);
  } catch (err) {
    log(`Step ${step}: Failed to delete mailbox message: ${err.message}`, 'warn');
  }
}

async function handleMailboxPollEmail(step, payload) {
  const {
    senderFilters = [],
    subjectFilters = [],
    maxAttempts = 20,
    intervalMs = 3000,
    filterAfterTimestamp = 0,
    excludeCodes = [],
  } = payload || {};
  const excludedCodeSet = new Set(excludeCodes);
  const now = Date.now();

  log(`Step ${step}: Starting email poll on Inbucket mailbox page (max ${maxAttempts} attempts)`);

  try {
    await waitForElement('.message-list, .message-list-entry', 15000);
    log(`Step ${step}: Mailbox page loaded`);
  } catch {
    throw new Error('Inbucket mailbox page did not load. Make sure /m/<mailbox>/ is open.');
  }

  const existingMailIds = getCurrentMailboxIds();
  log(`Step ${step}: Snapshotted ${existingMailIds.size} existing mailbox messages`);

  const FALLBACK_AFTER = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(`Polling Inbucket mailbox... attempt ${attempt}/${maxAttempts}`);

    if (attempt > 1) {
      await refreshMailbox();
    }

    const entries = Array.from(findMailboxEntries()).map(parseMailboxEntry);
    const useFallback = attempt > FALLBACK_AFTER;
    const latestMatch = findLatestMatchingItem(entries, (mail) => {
      if (!mail.unread) return false;
      if (seenMailIds.has(mail.mailId)) return false;
      if (!useFallback && existingMailIds.has(mail.mailId)) return false;
      if (!isMailFresh(mail.timestamp, { now, filterAfterTimestamp })) return false;

      const match = rowMatchesFilters(step, mail, senderFilters, subjectFilters, '');
      if (!match.matched) return false;

      return true;
    });

    if (latestMatch) {
      const match = rowMatchesFilters(step, latestMatch, senderFilters, subjectFilters, '');
      const code = match.code || extractVerificationCode(latestMatch.combinedText);
      if (!code) {
        log(`Step ${step}: Latest Inbucket verification email has no code yet, waiting for refresh.`, 'info');
      } else if (excludedCodeSet.has(code)) {
        log(`Step ${step}: Latest Inbucket code is excluded: ${code}`, 'info');
      } else {
        await openMailboxEntry(latestMatch.entry);
        await deleteCurrentMailboxMessage(step);

        seenMailIds.add(latestMatch.mailId);
        await persistSeenMailIds();

        const source = existingMailIds.has(latestMatch.mailId) ? 'fallback' : 'new';
        log(
          `Step ${step}: Code found: ${code} (${source}, sender: ${latestMatch.sender || 'unknown'}, subject: ${(latestMatch.subject || '').slice(0, 60)})`,
          'ok'
        );

        return {
          ok: true,
          code,
          emailTimestamp: latestMatch.timestamp,
          mailId: latestMatch.mailId,
        };
      }
    }

    if (attempt === FALLBACK_AFTER + 1) {
      log(`Step ${step}: No new mailbox messages yet, falling back to the latest matching message only`, 'warn');
    }

    if (attempt < maxAttempts) {
      await sleep(intervalMs);
    }
  }

  throw new Error(
    `No matching verification email found in Inbucket mailbox after ${(maxAttempts * intervalMs / 1000).toFixed(0)}s. ` +
    'Check the mailbox page manually.'
  );
}

async function handlePollEmail(step, payload) {
  if (!location.pathname.startsWith('/m/')) {
    throw new Error('Inbucket now only supports mailbox pages like /m/<mailbox>/.');
  }
  return handleMailboxPollEmail(step, payload);
}

} // end of isTopFrame else block
})();

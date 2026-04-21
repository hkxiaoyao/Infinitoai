(function(root, factory) {
  const exports = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.MailMatching = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function() {
  const BRAND_PATTERN = '(?:chatgpt|openai)';
  const REGISTRATION_CN_SUBJECT = new RegExp(
    `(?:你(?:的)?|您(?:的)?)?\\s*(?:临时\\s*)?${BRAND_PATTERN}\\s*(?:代码为|验证码)`,
    'i'
  );
  const VERIFICATION_EN_SUBJECT = new RegExp(
    `your\\s*(?:temporary\\s*)?${BRAND_PATTERN}\\s*(?:(?:verification|login)\\s*)?code(?:\\s*is)?`,
    'i'
  );
  const VERIFICATION_JA_SUBJECT = new RegExp(
    `${BRAND_PATTERN}\\s*(?:の\\s*)?(?:一時\\s*)?(?:認証コード|確認コード|コード)`,
    'i'
  );
  const LOGIN_INTENT_PATTERNS = [
    /\b(?:log(?:[\s-]*in)|login|sign(?:[\s-]*in)|signin)\b/i,
    /继续登录/i,
    /登入/i,
    /登录/i,
    /ログイン/i,
    /サインイン/i,
  ];
  const SIGNUP_INTENT_PATTERNS = [
    /\b(?:sign\s*up|signup|register|registration)\b/i,
    /\b(?:create|creating|complete)\s+(?:your\s+)?account\b/i,
    /\baccount\s+creation\b/i,
    /创建(?:\s*(?:chatgpt|openai))?\s*(?:帐户|账户|账号)?/i,
    /注册/i,
    /完成帐户创建/i,
    /完成账户创建/i,
    /アカウント(?:を)?(?:作成|登録)/i,
    /(?:新規)?登録(?:を)?完了/i,
  ];

  const STEP_MAIL_MATCH_PROFILES = {
    4: {
      include: [REGISTRATION_CN_SUBJECT, VERIFICATION_EN_SUBJECT, VERIFICATION_JA_SUBJECT],
      exclude: [],
    },
    7: {
      include: [REGISTRATION_CN_SUBJECT, VERIFICATION_EN_SUBJECT, VERIFICATION_JA_SUBJECT],
      exclude: [],
    },
    9: {
      include: [REGISTRATION_CN_SUBJECT, VERIFICATION_EN_SUBJECT, VERIFICATION_JA_SUBJECT],
      exclude: [],
    },
  };

  function normalizeText(value) {
    return (value || '')
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getStepMailMatchProfile(step) {
    return STEP_MAIL_MATCH_PROFILES[step] || null;
  }

  function getVerificationMailIntent(detailText) {
    const text = normalizeText(detailText);
    if (!text) {
      return 'unknown';
    }

    const hasSignupIntent = SIGNUP_INTENT_PATTERNS.some((pattern) => pattern.test(text));
    const hasLoginIntent = LOGIN_INTENT_PATTERNS.some((pattern) => pattern.test(text));

    if (hasSignupIntent && hasLoginIntent) {
      return 'mixed';
    }
    if (hasSignupIntent) {
      return 'signup';
    }
    if (hasLoginIntent) {
      return 'login';
    }
    return 'unknown';
  }

  function matchesSubjectPatterns(subject, profile) {
    if (!profile) {
      return true;
    }

    const text = normalizeText(subject);
    if (!text) {
      return false;
    }

    const includeMatched = (profile.include || []).length === 0
      || profile.include.some((pattern) => pattern.test(text));
    if (!includeMatched) {
      return false;
    }

    const excluded = (profile.exclude || []).some((pattern) => pattern.test(text));
    return !excluded;
  }

  function isExpectedVerificationMailDetail(step, detailText) {
    const numericStep = Number.parseInt(String(step ?? 0), 10) || 0;
    if (numericStep !== 7) {
      return true;
    }

    const text = normalizeText(detailText);
    if (!text) {
      return true;
    }

    return !hasSignupVerificationMailDetail(step, text);
  }

  function hasSignupVerificationMailDetail(step, detailText) {
    const numericStep = Number.parseInt(String(step ?? 0), 10) || 0;
    if (numericStep !== 7) {
      return false;
    }

    const intent = getVerificationMailIntent(detailText);
    return intent === 'signup' || intent === 'mixed';
  }

  function hasLoginVerificationMailDetail(step, detailText) {
    const numericStep = Number.parseInt(String(step ?? 0), 10) || 0;
    if (numericStep !== 7) {
      return false;
    }

    const intent = getVerificationMailIntent(detailText);
    return intent === 'login' || intent === 'mixed';
  }

  return {
    getVerificationMailIntent,
    getStepMailMatchProfile,
    hasLoginVerificationMailDetail,
    hasSignupVerificationMailDetail,
    isExpectedVerificationMailDetail,
    matchesSubjectPatterns,
    normalizeText,
  };
});

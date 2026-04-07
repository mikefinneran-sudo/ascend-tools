'use strict';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;
const COUNTRY_CODE_RE = /^[A-Z]{2}$/;
const SUMMARY_MAX_LENGTH = 200;

const SOURCE_ENDPOINTS = {
  us: 'https://cadataapi.state.gov/api/TravelAdvisories',
  canada: 'https://data.international.gc.ca/travel-voyage/index-alpha-eng.json',
  germany: 'https://www.auswaertiges-amt.de/opendata/travelwarning',
  israel: 'https://www.tlvflights.com/api/travel-warnings'
};

const SOURCE_LABELS = {
  us: {
    0: 'N/A',
    1: 'Exercise Normal Precautions',
    2: 'Exercise Increased Caution',
    3: 'Reconsider Travel',
    4: 'Do Not Travel'
  },
  canada: {
    0: 'N/A',
    1: 'Take normal security precautions',
    2: 'Exercise a high degree of caution',
    3: 'Avoid non-essential travel',
    4: 'Avoid all travel'
  },
  germany: {
    0: 'N/A',
    1: 'No warning',
    2: 'Safety notice',
    3: 'Partial travel warning',
    4: 'Travel warning'
  },
  israel: {
    0: 'N/A',
    1: 'Low threat',
    2: 'Opportunistic threat',
    3: 'Medium threat',
    4: 'High threat'
  }
};

const OVERALL_LABELS = {
  0: 'No advisory data',
  1: 'Normal precautions',
  2: 'Elevated caution',
  3: 'High caution',
  4: 'Do not travel'
};

const US_CODE_OVERRIDES = {
  CS: 'CR',
  LG: 'LV'
};

const ISO_COUNTRY_CODES = ["AF","AX","AL","DZ","AD","AO","AI","AQ","AG","AR","AM","AW","AU","AT","AZ","BS","BH","BD","BB","BY","BE","BZ","BJ","BM","BT","BO","BA","BW","BV","BR","IO","BN","BG","BF","BI","KH","CM","CA","CV","BQ","KY","CF","TD","CL","CN","CX","CC","CO","KM","CD","CG","CK","CR","CI","HR","CU","CW","CY","CZ","DK","DJ","DM","DO","EC","EG","SV","GQ","ER","EE","SZ","ET","FK","FO","FJ","FI","FR","GF","PF","TF","GA","GM","GE","DE","GH","GI","GR","GL","GD","GP","GU","GT","GG","GN","GW","GY","HT","HM","HN","HK","HU","IS","IN","ID","IR","IQ","IE","IM","IL","IT","JM","JP","JE","JO","KZ","KE","KI","KW","KG","LA","LV","LB","LS","LR","LY","LI","LT","LU","MO","MG","MW","MY","MV","ML","MT","MH","MQ","MR","MU","YT","MX","FM","MD","MC","MN","ME","MS","MA","MZ","MM","NA","NR","NP","NL","NC","NZ","NI","NE","NG","NU","NF","KP","MK","MP","NO","OM","PK","PW","PS","PA","PG","PY","PE","PH","PN","PL","PT","PR","QA","RE","RO","RU","RW","AS","WS","SM","ST","SA","SN","RS","SC","SL","SG","SX","SK","SI","SB","SO","ZA","GS","KR","SS","ES","LK","BL","SH","KN","LC","MF","PM","VC","SD","SR","SJ","SE","CH","SY","TW","TJ","TZ","TH","TL","TG","TK","TO","TT","TN","TR","TM","TC","TV","UM","UG","UA","AE","GB","US","UY","UZ","VU","VA","VE","VN","VG","VI","WF","EH","YE","ZM","ZW","XK"];

const HEBREW_COUNTRY_ALIASES = {
  "אלג'יריה": 'DZ',
  'אלג׳יריה': 'DZ',
  "צ'כיה": 'CZ',
  'צ׳כיה': 'CZ',
  'ארה"ב': 'US',
  'ארצות הברית': 'US',
  'ארצות הברית של אמריקה': 'US',
  'איחוד האמירויות': 'AE',
  'איחוד האמירויות הערביות': 'AE',
  'איחוד האמירויות (UAE)': 'AE',
  'איחוד האמירויות הערביות (UAE)': 'AE',
  'הולנד': 'NL',
  'הרפובליקה הדומיניקנית': 'DO',
  'חוף השנהב': 'CI',
  'קייפ ורדה': 'CV',
  'מקדוניה הצפונית': 'MK',
  'מיאנמר': 'MM',
  'מיאנמר (בורמה)': 'MM',
  'קוריאה הדרומית': 'KR',
  'קוריאה הצפונית': 'KP',
  'קונגו': 'CG',
  'קונגו בראזוויל': 'CG',
  'קונגו ברזאויל': 'CG',
  'הרפובליקה הדמוקרטית של קונגו': 'CD',
  'קונגו הדמוקרטית': 'CD',
  'קונגו קינשאסה': 'CD',
  'לאוס': 'LA',
  'מולדובה': 'MD',
  'קירגיזסטן': 'KG',
  'קוסובו': 'XK'
};

const ENGLISH_COUNTRY_ALIASES = {
  'bahamas': 'BS',
  'the bahamas': 'BS',
  'bolivia': 'BO',
  'bolivia plurinational state of': 'BO',
  'britain': 'GB',
  'brunei': 'BN',
  'brunei darussalam': 'BN',
  'burma': 'MM',
  'cabo verde': 'CV',
  'cape verde': 'CV',
  'congo brazzaville': 'CG',
  'congo kinshasa': 'CD',
  'cote divoire': 'CI',
  'cote d ivoire': 'CI',
  'czech republic': 'CZ',
  'democratic peoples republic of korea': 'KP',
  'democratic republic of the congo': 'CD',
  'dr congo': 'CD',
  'drc': 'CD',
  'east timor': 'TL',
  'eswatini': 'SZ',
  'federated states of micronesia': 'FM',
  'gambia': 'GM',
  'the gambia': 'GM',
  'great britain': 'GB',
  'holy see': 'VA',
  'iran': 'IR',
  'iran islamic republic of': 'IR',
  'ivory coast': 'CI',
  'kosovo': 'XK',
  'lao peoples democratic republic': 'LA',
  'lao pdr': 'LA',
  'laos': 'LA',
  'macedonia': 'MK',
  'myanmar': 'MM',
  'north korea': 'KP',
  'north macedonia': 'MK',
  'occupied palestinian territory': 'PS',
  'palestine': 'PS',
  'palestinian territories': 'PS',
  'republic of korea': 'KR',
  'republic of moldova': 'MD',
  'republic of the congo': 'CG',
  'russia': 'RU',
  'russian federation': 'RU',
  'south korea': 'KR',
  'state of palestine': 'PS',
  'swaziland': 'SZ',
  'syrian arab republic': 'SY',
  'tanzania': 'TZ',
  'timor leste': 'TL',
  'turkiye': 'TR',
  'turkey': 'TR',
  'uk': 'GB',
  'united kingdom': 'GB',
  'united republic of tanzania': 'TZ',
  'united states': 'US',
  'united states of america': 'US',
  'venezuela': 'VE',
  'venezuela bolivarian republic of': 'VE',
  'vatican city': 'VA'
};

const ISO_COUNTRY_CODE_SET = new Set(ISO_COUNTRY_CODES);

let cachedPayload = null;
let cachedAt = 0;
let pendingPayload = null;

const displayNamesEn = new Intl.DisplayNames(['en'], { type: 'region' });
const displayNamesHe = new Intl.DisplayNames(['he'], { type: 'region' });

const HEBREW_COUNTRY_TO_ISO = buildHebrewCountryMap();
const ENGLISH_COUNTRY_TO_ISO = buildEnglishCountryMap();

function buildHebrewCountryMap() {
  const map = {};

  for (const code of ISO_COUNTRY_CODES) {
    const hebrewName = safeDisplayName(displayNamesHe, code);
    if (!hebrewName) {
      continue;
    }

    map[normalizeLookupKey(hebrewName)] = code;
  }

  Object.keys(HEBREW_COUNTRY_ALIASES).forEach((name) => {
    map[normalizeLookupKey(name)] = HEBREW_COUNTRY_ALIASES[name];
  });

  return map;
}

function buildEnglishCountryMap() {
  const map = {};

  for (const code of ISO_COUNTRY_CODES) {
    const englishName = safeDisplayName(displayNamesEn, code);
    if (!englishName) {
      continue;
    }

    map[normalizeLookupKey(englishName)] = code;
  }

  Object.keys(ENGLISH_COUNTRY_ALIASES).forEach((name) => {
    map[normalizeLookupKey(name)] = ENGLISH_COUNTRY_ALIASES[name];
  });

  return map;
}

function safeDisplayName(displayNames, code) {
  try {
    return displayNames.of(code) || '';
  } catch (error) {
    return '';
  }
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function normalizeCountryCode(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toUpperCase();
}

function normalizeLookupKey(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[׳'`´]/g, '')
    .replace(/[״"]/g, '')
    .replace(/[()]/g, ' ')
    .replace(/[.,/\\-]/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtml(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return decodeHtmlEntities(
    value
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(value, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';

  if (!text || text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength).replace(/\s+\S*$/, '').trim() + '...';
}

function parseDateToIso(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString();
}

function parseUnixSecondsToIso(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '';
  }

  return new Date(seconds * 1000).toISOString();
}

function formatDateDisplay(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return isoString;
  }
}

function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch (error) {
    return '';
  }
}

function getCountryName(code, fallbackName) {
  const normalizedCode = normalizeCountryCode(code);
  const fallback = typeof fallbackName === 'string' ? fallbackName.trim() : '';

  if (!COUNTRY_CODE_RE.test(normalizedCode)) {
    return fallback;
  }

  const displayName = safeDisplayName(displayNamesEn, normalizedCode);
  return displayName || fallback || normalizedCode;
}

function getCountryCodeFromEnglishName(name) {
  return ENGLISH_COUNTRY_TO_ISO[normalizeLookupKey(name)] || '';
}

function getCountryCodeFromHebrewName(name) {
  return HEBREW_COUNTRY_TO_ISO[normalizeLookupKey(name)] || '';
}

function getUsLevel(title) {
  if (typeof title !== 'string') {
    return 0;
  }

  const match = title.match(/\bLevel\s*([1-4])\b/i);
  return match ? Number(match[1]) : 0;
}

function getUsCountryNameFromTitle(title) {
  if (typeof title !== 'string') {
    return '';
  }

  const match = title.match(/^(.*?)\s*-\s*Level\s*[1-4]\b/i);
  return match ? match[1].trim() : '';
}

// Placeholder for sources where the feed is UP but no entry exists for this country
function createPlaceholderSource(sourceKey) {
  return {
    level: 0,
    label: SOURCE_LABELS[sourceKey][0],
    summary: '',
    url: '',
    updated: '',
    updated_display: '',
    partial: false
  };
}

function createCountryRecord(code, sourceAvailability, fallbackName) {
  const advisories = {};

  Object.keys(SOURCE_ENDPOINTS).forEach((sourceKey) => {
    advisories[sourceKey] = sourceAvailability[sourceKey].available ? createPlaceholderSource(sourceKey) : null;
  });

  return {
    country_code: code,
    country_name: getCountryName(code, fallbackName),
    advisories,
    max_level: 0,
    overall_label: OVERALL_LABELS[0],
    updated_at: ''
  };
}

function ensureCountryRecord(countries, code, sourceAvailability, fallbackName) {
  const normalizedCode = normalizeCountryCode(code);

  if (!COUNTRY_CODE_RE.test(normalizedCode)) {
    return null;
  }

  if (!countries[normalizedCode]) {
    countries[normalizedCode] = createCountryRecord(normalizedCode, sourceAvailability, fallbackName);
  } else if (!countries[normalizedCode].country_name && fallbackName) {
    countries[normalizedCode].country_name = getCountryName(normalizedCode, fallbackName);
  }

  return countries[normalizedCode];
}

function computeCountryMeta(country) {
  let maxLevel = 0;
  let latestUpdated = 0;

  Object.values(country.advisories).forEach((advisory) => {
    if (!advisory || typeof advisory.level !== 'number') {
      return;
    }

    if (advisory.level > maxLevel) {
      maxLevel = advisory.level;
    }

    if (advisory.updated) {
      const timestamp = Date.parse(advisory.updated);
      if (Number.isFinite(timestamp) && timestamp > latestUpdated) {
        latestUpdated = timestamp;
      }
    }
  });

  country.max_level = maxLevel;
  country.overall_label = OVERALL_LABELS[maxLevel] || OVERALL_LABELS[0];
  country.updated_at = latestUpdated ? new Date(latestUpdated).toISOString() : '';
}

function parseSourceError(result) {
  if (result.status === 'fulfilled') {
    return null;
  }

  const message = result.reason && result.reason.message ? result.reason.message : 'Unknown upstream failure';
  return truncateText(String(message), 160);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ascend-tools/1.0'
    }
  });

  if (!response.ok) {
    throw new Error('Unexpected upstream status ' + response.status);
  }

  return response.json();
}

function normalizeUsFeed(rawFeed, countries, sourceAvailability) {
  if (!Array.isArray(rawFeed)) {
    return;
  }

  rawFeed.forEach((entry) => {
    const advisoryCode = Array.isArray(entry && entry.Category) ? normalizeCountryCode(entry.Category[0]) : '';
    const titleCountryName = getUsCountryNameFromTitle(entry && entry.Title);
    const mappedCode = US_CODE_OVERRIDES[advisoryCode] || (ISO_COUNTRY_CODE_SET.has(advisoryCode) ? advisoryCode : '') || getCountryCodeFromEnglishName(titleCountryName);

    if (!COUNTRY_CODE_RE.test(mappedCode)) {
      console.warn('travel-advisory: could not map US advisory entry', {
        advisoryCode,
        title: entry && entry.Title
      });
      return;
    }

    const country = ensureCountryRecord(countries, mappedCode, sourceAvailability, titleCountryName);
    if (!country) {
      return;
    }

    const summary = truncateText(stripHtml(entry && entry.Summary), SUMMARY_MAX_LENGTH);
    const level = getUsLevel(entry && entry.Title);
    const updated = parseDateToIso((entry && entry.Updated) || (entry && entry.Published));

    country.advisories.us = {
      level,
      label: SOURCE_LABELS.us[level] || SOURCE_LABELS.us[0],
      summary,
      url: safeUrl(entry && entry.Link),
      updated,
      updated_display: updated,
      partial: false
    };
  });
}

function normalizeCanadaFeed(rawFeed, countries, sourceAvailability) {
  if (!rawFeed || typeof rawFeed !== 'object') {
    return;
  }

  Object.keys(rawFeed).forEach((code) => {
    const entry = rawFeed[code];
    const countryCode = normalizeCountryCode(entry && entry['country-iso']);

    if (!COUNTRY_CODE_RE.test(countryCode)) {
      return;
    }

    const country = ensureCountryRecord(countries, countryCode, sourceAvailability, entry && entry['country-eng']);
    if (!country) {
      return;
    }

    const level = Number(entry && entry['advisory-state']) || 0;
    const advisoryText = entry && entry.eng ? String(entry.eng['advisory-text'] || '') : '';
    const recentUpdates = entry && entry.eng ? String(entry.eng['recent-updates'] || '') : '';
    const updated = parseDateToIso(entry && entry.eng ? entry.eng['friendly-date'] : '');

    country.advisories.canada = {
      level,
      label: advisoryText || SOURCE_LABELS.canada[level] || SOURCE_LABELS.canada[0],
      summary: truncateText(advisoryText, SUMMARY_MAX_LENGTH),
      recent_updates: truncateText(recentUpdates, SUMMARY_MAX_LENGTH),
      url: '',
      updated,
      updated_display: entry && entry.eng ? String(entry.eng['friendly-date'] || '') : '',
      partial: Boolean(Number(entry && entry['has-regional-advisory'])),
      has_warning: Boolean(Number(entry && entry['has-advisory-warning']))
    };
  });
}

function getGermanyStatus(entry) {
  if (entry && entry.warning) {
    return {
      level: 4,
      label: SOURCE_LABELS.germany[4],
      partial: false,
      summary: 'Travel warning in effect for the entire country.',
      warning_type: 'warning'
    };
  }

  if (entry && entry.partialWarning) {
    return {
      level: 3,
      label: SOURCE_LABELS.germany[3],
      partial: true,
      summary: 'Partial travel warning in effect for some regions.',
      warning_type: 'partialWarning'
    };
  }

  if (entry && entry.situationWarning) {
    return {
      level: 2,
      label: SOURCE_LABELS.germany[2],
      partial: false,
      summary: 'Safety notice in effect.',
      warning_type: 'situationWarning'
    };
  }

  if (entry && entry.situationPartWarning) {
    return {
      level: 2,
      label: 'Partial safety notice',
      partial: true,
      summary: 'Partial safety notice in effect for some regions.',
      warning_type: 'situationPartWarning'
    };
  }

  return {
    level: 1,
    label: SOURCE_LABELS.germany[1],
    partial: false,
    summary: 'No warning currently published.',
    warning_type: 'none'
  };
}

function normalizeGermanyFeed(rawFeed, countries, sourceAvailability) {
  const entries = rawFeed && rawFeed.response && typeof rawFeed.response === 'object' ? rawFeed.response : rawFeed;

  if (!entries || typeof entries !== 'object') {
    return;
  }

  Object.keys(entries).forEach((key) => {
    if (key === 'lastModified') {
      return;
    }

    const entry = entries[key];
    const countryCode = normalizeCountryCode(entry && entry.countryCode);

    if (!COUNTRY_CODE_RE.test(countryCode)) {
      return;
    }

    const country = ensureCountryRecord(countries, countryCode, sourceAvailability, '');
    if (!country) {
      return;
    }

    const status = getGermanyStatus(entry);
    const updated = parseUnixSecondsToIso(entry && entry.lastModified);

    country.advisories.germany = {
      level: status.level,
      label: status.label,
      summary: status.summary,
      url: '',
      updated,
      updated_display: formatDateDisplay(updated),
      partial: status.partial,
      warning_type: status.warning_type
    };
  });
}

function normalizeIsraelFeed(rawFeed, countries, sourceAvailability) {
  const entries = rawFeed && Array.isArray(rawFeed.data) ? rawFeed.data : [];

  entries.forEach((entry) => {
    const countryCode = getCountryCodeFromHebrewName(entry && entry.country);

    if (!COUNTRY_CODE_RE.test(countryCode)) {
      console.warn('travel-advisory: could not map Israel advisory entry', {
        country: entry && entry.country
      });
      return;
    }

    const country = ensureCountryRecord(countries, countryCode, sourceAvailability, '');
    if (!country) {
      return;
    }

    const level = Number(entry && entry.threat_level) || 0;
    const summary = truncateText(typeof entry === 'object' ? String(entry.recommendation || '') : '', SUMMARY_MAX_LENGTH);
    const nextAdvisory = {
      level,
      label: SOURCE_LABELS.israel[level] || SOURCE_LABELS.israel[0],
      summary,
      url: safeUrl(entry && entry.gov_url),
      updated: '',
      updated_display: '',
      partial: false,
      ministry: entry && entry.ministry ? String(entry.ministry) : '',
      country_hebrew: entry && entry.country ? String(entry.country) : ''
    };

    const existing = country.advisories.israel;
    if (!existing || typeof existing.level !== 'number' || nextAdvisory.level >= existing.level) {
      country.advisories.israel = nextAdvisory;
    }
  });
}

function finalizeCountries(countries) {
  const sortedCodes = Object.keys(countries).sort((leftCode, rightCode) => {
    return countries[leftCode].country_name.localeCompare(countries[rightCode].country_name);
  });
  const sortedCountries = {};

  sortedCodes.forEach((code) => {
    computeCountryMeta(countries[code]);
    sortedCountries[code] = countries[code];
  });

  return sortedCountries;
}

async function buildPayload() {
  const sourceKeys = Object.keys(SOURCE_ENDPOINTS);
  const results = await Promise.allSettled(sourceKeys.map((sourceKey) => fetchJson(SOURCE_ENDPOINTS[sourceKey])));
  const sourceAvailability = {};
  const countries = {};

  sourceKeys.forEach((sourceKey, index) => {
    const result = results[index];
    sourceAvailability[sourceKey] = {
      available: result.status === 'fulfilled',
      error: parseSourceError(result)
    };
  });

  if (!Object.values(sourceAvailability).some((source) => source.available)) {
    throw new Error('All advisory sources are unavailable');
  }

  sourceKeys.forEach((sourceKey, index) => {
    const result = results[index];
    if (result.status !== 'fulfilled') {
      console.error('travel-advisory: source fetch failed', {
        source: sourceKey,
        error: sourceAvailability[sourceKey].error
      });
      return;
    }

    if (sourceKey === 'us') {
      normalizeUsFeed(result.value, countries, sourceAvailability);
      return;
    }

    if (sourceKey === 'canada') {
      normalizeCanadaFeed(result.value, countries, sourceAvailability);
      return;
    }

    if (sourceKey === 'germany') {
      normalizeGermanyFeed(result.value, countries, sourceAvailability);
      return;
    }

    if (sourceKey === 'israel') {
      normalizeIsraelFeed(result.value, countries, sourceAvailability);
    }
  });

  const finalizedCountries = finalizeCountries(countries);

  return {
    generated_at: new Date().toISOString(),
    country_count: Object.keys(finalizedCountries).length,
    sources: sourceAvailability,
    countries: finalizedCountries
  };
}

async function getPayload() {
  const now = Date.now();

  if (cachedPayload && now - cachedAt < CACHE_TTL_MS) {
    return cachedPayload;
  }

  if (pendingPayload) {
    return pendingPayload;
  }

  pendingPayload = buildPayload()
    .then((payload) => {
      cachedPayload = payload;
      cachedAt = Date.now();
      return cachedPayload;
    })
    .catch((error) => {
      if (cachedPayload) {
        console.error('travel-advisory: refresh failed, serving stale cache', error);
        return cachedPayload;
      }

      throw error;
    })
    .finally(() => {
      pendingPayload = null;
    });

  return pendingPayload;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const proxySecret = process.env.ASCEND_PROXY_SECRET;
  if (!proxySecret) {
    console.error('travel-advisory: missing ASCEND_PROXY_SECRET');
    return sendJson(res, 500, { error: 'Server configuration incomplete' });
  }

  if (req.headers['x-ascend-key'] !== proxySecret) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }

  let payload;

  try {
    payload = await getPayload();
  } catch (error) {
    console.error('travel-advisory: failed to build payload', error);
    return sendJson(res, 502, { error: 'Travel advisory services unavailable' });
  }

  const requestedCountry = normalizeCountryCode(req.query && req.query.country);

  if (!requestedCountry) {
    return sendJson(res, 200, payload);
  }

  if (!COUNTRY_CODE_RE.test(requestedCountry)) {
    return sendJson(res, 400, { error: 'Country must be a valid ISO alpha-2 country code' });
  }

  const country = payload.countries[requestedCountry];
  if (!country) {
    return sendJson(res, 404, { error: 'Country not found' });
  }

  return sendJson(res, 200, {
    generated_at: payload.generated_at,
    sources: payload.sources,
    country
  });
};

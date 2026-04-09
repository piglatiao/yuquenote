import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { chromium } from 'playwright';

const QQ_MUSIC_ENDPOINT = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const NETEASE_MUSIC_ENDPOINT = 'https://music.163.com';
const NETEASE_WEAPI_PRESET_KEY = '0CoJUm6Qyw8W8jud';
const NETEASE_WEAPI_IV = '0102030405060708';
const NETEASE_WEAPI_PUBLIC_KEY = '010001';
const NETEASE_WEAPI_MODULUS =
  '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7' +
  'b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312' +
  'ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe' +
  '4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';
const QQ_MUSIC_DEBUG_DIR = path.join(process.cwd(), 'data', 'debug');
const QQ_MUSIC_BROWSER_EXECUTABLE_CANDIDATES = [
  process.env.QQ_MUSIC_BROWSER_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function createTimeoutSignal(timeoutMs = 12000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timeoutId);
    },
  };
}

function buildQQHeaders(cookie = '') {
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json;charset=UTF-8',
    Origin: 'https://y.qq.com',
    Referer: 'https://y.qq.com/',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  };

  if (cookie) {
    headers.Cookie = cookie;
  }

  return headers;
}

function buildNeteaseHeaders(cookie = '', extraHeaders = {}) {
  const headers = {
    Accept: 'application/json, text/plain, */*',
    Origin: NETEASE_MUSIC_ENDPOINT,
    Referer: `${NETEASE_MUSIC_ENDPOINT}/`,
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    ...extraHeaders,
  };

  if (cookie) {
    headers.Cookie = cookie;
  }

  return headers;
}

async function requestQQMusic(body, cookie = '') {
  const timeout = createTimeoutSignal();

  try {
    const response = await fetch(QQ_MUSIC_ENDPOINT, {
      method: 'POST',
      headers: buildQQHeaders(cookie),
      body: JSON.stringify(body),
      signal: timeout.signal,
    });

    if (!response.ok) {
      throw new Error(`QQ music request failed with status ${response.status}.`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('QQ music request timed out.');
    }
    throw error;
  } finally {
    timeout.clear();
  }
}

async function requestQQJson(url, cookie = '') {
  const timeout = createTimeoutSignal();

  try {
    const response = await fetch(url, {
      headers: buildQQHeaders(cookie),
      signal: timeout.signal,
    });

    if (!response.ok) {
      throw new Error(`QQ music request failed with status ${response.status}.`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('QQ music request timed out.');
    }
    throw error;
  } finally {
    timeout.clear();
  }
}

async function requestQQText(url, cookie = '') {
  const timeout = createTimeoutSignal();

  try {
    const response = await fetch(url, {
      headers: buildQQHeaders(cookie),
      signal: timeout.signal,
    });

    if (!response.ok) {
      throw new Error(`QQ music request failed with status ${response.status}.`);
    }

    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('QQ music request timed out.');
    }
    throw error;
  } finally {
    timeout.clear();
  }
}

async function requestNeteaseJson(url, options = {}) {
  const timeout = createTimeoutSignal();
  const method = options.method || 'GET';
  const cookie = options.cookie || '';
  const body = options.body ?? null;
  const headers = buildNeteaseHeaders(cookie, options.headers || {});

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: timeout.signal,
    });

    const rawText = await response.text();
    let payload = null;

    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message = payload?.msg || payload?.message || `Netease music request failed with status ${response.status}.`;
      throw new Error(message);
    }

    return {
      payload,
      setCookieHeaders: typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [],
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Netease music request timed out.');
    }
    throw error;
  } finally {
    timeout.clear();
  }
}

async function requestNeteaseWeapi(pathname, payload = {}, options = {}) {
  const cookie = options.cookie || '';
  const body = buildNeteaseWeapiBody(payload);
  return requestNeteaseJson(`${NETEASE_MUSIC_ENDPOINT}/weapi/${pathname}?csrf_token=`, {
    method: 'POST',
    cookie,
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(options.headers || {}),
    },
  });
}

function parseQQInitialDataFromHtml(html) {
  const source = String(html || '');
  const match = source.match(/window\.__INITIAL_DATA__\s*=\s*([\s\S]*?)<\/script>/i);
  if (!match?.[1]) {
    return null;
  }

  let jsonText = match[1].trim();
  jsonText = jsonText.replace(/;\s*$/, '').trim();
  if (!jsonText) {
    return null;
  }

  try {
    return JSON.parse(jsonText.replace(/\bundefined\b/g, 'null'));
  } catch {
    return null;
  }
}

async function writeQQMusicDebugSnapshot(name, payload) {
  try {
    await mkdir(QQ_MUSIC_DEBUG_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const serialized = JSON.stringify(payload, null, 2);
    await writeFile(path.join(QQ_MUSIC_DEBUG_DIR, `${name}-${timestamp}.json`), serialized, 'utf8');
    await writeFile(path.join(QQ_MUSIC_DEBUG_DIR, `${name}-latest.json`), serialized, 'utf8');
  } catch {
    // Ignore debug snapshot failures.
  }
}

function resolveQQMusicBrowserExecutablePath() {
  return QQ_MUSIC_BROWSER_EXECUTABLE_CANDIDATES[0] || undefined;
}

function normalizeString(value) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value).trim();
  }

  return '';
}

function normalizeSingerNames(value) {
  if (typeof value === 'string') {
    return normalizeString(value);
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return normalizeString(value?.name || value?.title || value?.singerName || value?.singer_name);
  }

  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((item) => normalizeString(item?.name || item?.title || item?.singerName || item?.singer_name))
    .filter(Boolean)
    .join(' / ');
}

function albumCoverFromMid(albumMid) {
  const mid = normalizeString(albumMid);
  if (!mid) {
    return null;
  }

  return `https://y.gtimg.cn/music/photo_new/T002R300x300M000${mid}.jpg`;
}

function parseCookieMap(cookie = '') {
  const result = new Map();

  for (const chunk of String(cookie || '').split(';')) {
    const [rawName, ...rawValueParts] = chunk.split('=');
    const name = normalizeString(rawName);
    if (!name) {
      continue;
    }

    result.set(name, rawValueParts.join('=').trim());
  }

  return result;
}

function mergeCookieStrings(cookie = '', incomingCookieHeaders = []) {
  const cookieMap = parseCookieMap(cookie);

  for (const header of incomingCookieHeaders) {
    const pair = String(header || '').split(';')[0] || '';
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const name = normalizeString(pair.slice(0, separatorIndex));
    const value = pair.slice(separatorIndex + 1).trim();
    if (!name) {
      continue;
    }

    cookieMap.set(name, value);
  }

  return [...cookieMap.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function hashNeteasePassword(value) {
  return createHash('md5').update(String(value || ''), 'utf8').digest('hex');
}

function createNeteaseSecretKey(length = 16) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(length);
  let result = '';

  for (let index = 0; index < length; index += 1) {
    result += alphabet[bytes[index] % alphabet.length];
  }

  return result;
}

function aesEncryptNetease(text, secretKey) {
  const cipher = createCipheriv(
    'aes-128-cbc',
    Buffer.from(String(secretKey), 'utf8'),
    Buffer.from(NETEASE_WEAPI_IV, 'utf8'),
  );
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]).toString('base64');
}

function modPowBigInt(base, exponent, modulus) {
  if (modulus === 1n) {
    return 0n;
  }

  let result = 1n;
  let currentBase = base % modulus;
  let currentExponent = exponent;

  while (currentExponent > 0n) {
    if (currentExponent % 2n === 1n) {
      result = (result * currentBase) % modulus;
    }
    currentExponent >>= 1n;
    currentBase = (currentBase * currentBase) % modulus;
  }

  return result;
}

function rsaEncryptNetease(text) {
  const reversedText = String(text).split('').reverse().join('');
  const messageHex = Buffer.from(reversedText, 'utf8').toString('hex') || '00';
  const encrypted = modPowBigInt(
    BigInt(`0x${messageHex}`),
    BigInt(`0x${NETEASE_WEAPI_PUBLIC_KEY}`),
    BigInt(`0x${NETEASE_WEAPI_MODULUS}`),
  );
  return encrypted.toString(16).padStart(256, '0');
}

function buildNeteaseWeapiBody(payload) {
  const secretKey = createNeteaseSecretKey(16);
  const text = JSON.stringify(payload ?? {});
  const params = aesEncryptNetease(aesEncryptNetease(text, NETEASE_WEAPI_PRESET_KEY), secretKey);
  const encSecKey = rsaEncryptNetease(secretKey);
  return new URLSearchParams({
    params,
    encSecKey,
  }).toString();
}

function normalizeNeteasePhoneInput(phone, countryCode = '86') {
  const normalizedPhone = normalizeString(phone).replace(/\s+/g, '');
  const normalizedCountryCode = normalizeString(countryCode) || '86';

  if (!normalizedPhone) {
    throw new Error('Phone is required.');
  }

  return {
    phone: normalizedPhone,
    countryCode: normalizedCountryCode,
  };
}

function buildPlaywrightCookiesFromCookieString(cookie = '') {
  const cookies = [];
  const domains = ['.qq.com', '.y.qq.com', 'y.qq.com'];

  for (const [name, value] of parseCookieMap(cookie)) {
    if (!name) {
      continue;
    }

    for (const domain of domains) {
      cookies.push({
        name,
        value,
        domain,
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'Lax',
      });
    }
  }

  return cookies;
}

function normalizeQQUin(value) {
  const raw = normalizeString(value);
  if (!raw) {
    return '';
  }

  const normalized = raw.startsWith('o') || raw.startsWith('O') ? raw.slice(1) : raw;
  const digits = normalized.replace(/\D/g, '');
  return digits || '';
}

function extractQQUinFromCookie(cookie = '') {
  const cookieMap = parseCookieMap(cookie);
  for (const key of ['qqmusic_uin', 'uin', 'p_uin', 'wxuin']) {
    const candidate = normalizeQQUin(cookieMap.get(key));
    if (candidate) {
      return candidate;
    }
  }

  return '';
}

function parseQQFlexiblePayload(input) {
  const text = String(input || '').trim();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    // Ignore direct JSON parse failures and try JSONP below.
  }

  const match = text.match(/^[^(]+\(([\s\S]+)\)\s*;?$/);
  if (!match?.[1]) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

async function requestQQFlexiblePayload(url, cookie = '') {
  const responseText = await requestQQText(url, cookie);
  return parseQQFlexiblePayload(responseText);
}

function walkQQPayload(node, visit, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) {
    return;
  }

  seen.add(node);
  visit(node);

  if (Array.isArray(node)) {
    for (const item of node) {
      walkQQPayload(item, visit, seen);
    }
    return;
  }

  for (const value of Object.values(node)) {
    walkQQPayload(value, visit, seen);
  }
}

function normalizePlaylistCoverUrl(value) {
  const directUrl = normalizeString(value);
  if (directUrl) {
    return directUrl.replace(/^http:\/\//i, 'https://');
  }

  return null;
}

function normalizePlaylistSummary(item, kind) {
  const isPlaylistLike = Boolean(
    item
    && typeof item === 'object'
    && (
      item?.dissid !== undefined
      || item?.dirid !== undefined
      || item?.tid !== undefined
      || item?.dissname !== undefined
      || item?.dirname !== undefined
      || item?.diss_name !== undefined
      || item?.songnum !== undefined
      || item?.song_count !== undefined
      || item?.music_num !== undefined
    ),
  );

  if (!isPlaylistLike) {
    return null;
  }

  const id = normalizeString(item?.dissid || item?.dirid || item?.tid || item?.id);
  const title =
    normalizeString(item?.dissname || item?.dirname || item?.title || item?.name || item?.diss_name) || '未命名歌单';

  if (!id || !title) {
    return null;
  }

  const songCount = Number(
    item?.song_count ??
      item?.songnum ??
      item?.songNum ??
      item?.songnum2 ??
      item?.total_song_num ??
      item?.music_num ??
      0,
  );

  return {
    id,
    title,
    cover_url: normalizePlaylistCoverUrl(
      item?.cover_url ||
        item?.cover ||
        item?.logo ||
        item?.imgurl ||
        item?.picurl ||
        item?.pic_mid ||
        item?.frontPicUrl,
    ),
    song_count: Number.isFinite(songCount) ? Math.max(0, Math.floor(songCount)) : 0,
    kind,
  };
}

function createPlaylistSummaryFromProfileItem(item, kind) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const id = normalizeString(item?.id || item?.dissid || item?.dirid);
  const title = normalizeString(item?.title || item?.name || item?.dissname || item?.dirname);
  if (!id || !title) {
    return null;
  }

  const songCount = Number(item?.num0 ?? item?.song_count ?? item?.songnum ?? 0);
  return {
    id,
    title,
    cover_url: normalizePlaylistCoverUrl(item?.picurl || item?.cover_url || item?.cover || item?.logo),
    song_count: Number.isFinite(songCount) ? Math.max(0, Math.floor(songCount)) : 0,
    kind,
  };
}

function extractLikedPlaylistFromProfilePayload(payload) {
  const items = Array.isArray(payload?.data?.mymusic) ? payload.data.mymusic : [];
  return (
    items
      .map((item) => createPlaylistSummaryFromProfileItem(item, 'liked_songs'))
      .find((item) => item && /我喜欢|喜欢/.test(item.title))
    ?? null
  );
}

function extractCreatedPlaylistsFromProfilePayload(payload) {
  const items = Array.isArray(payload?.data?.mydiss?.list) ? payload.data.mydiss.list : [];
  return items
    .map((item) => createPlaylistSummaryFromProfileItem(item, 'created'))
    .filter(Boolean);
}

function extractPlaylistSummaries(payload, kind) {
  const summaries = [];
  const seenIds = new Set();

  walkQQPayload(payload, (node) => {
    if (Array.isArray(node)) {
      return;
    }

    const summary = normalizePlaylistSummary(node, kind);
    if (!summary || seenIds.has(summary.id)) {
      return;
    }

    seenIds.add(summary.id);
    summaries.push(summary);
  });

  return summaries;
}

function extractProfileSummary(payload) {
  const profile = {
    nickname: null,
    avatar_url: null,
  };

  walkQQPayload(payload, (node) => {
    if (Array.isArray(node)) {
      return;
    }

    if (!profile.nickname) {
      const nickname = normalizeString(
        node?.nickname || node?.nick || node?.name || node?.creator?.name || node?.creator?.nick || node?.owner?.name,
      );
      if (nickname) {
        profile.nickname = nickname;
      }
    }

    if (!profile.avatar_url) {
      const avatarUrl = normalizePlaylistCoverUrl(
        node?.avatar_url || node?.headurl || node?.headpic || node?.avatar || node?.creator?.avatarUrl || node?.creator?.headpic || node?.owner?.headurl,
      );
      if (avatarUrl) {
        profile.avatar_url = avatarUrl;
      }
    }
  });

  return profile;
}

function pickLikedPlaylist(playlists) {
  const candidates = Array.isArray(playlists) ? playlists : [];
  return (
    candidates.find((item) => item.kind === 'liked_songs') ??
    candidates.find((item) => /我喜欢|喜欢的音乐|我最爱听/.test(item.title)) ??
    null
  );
}

async function requestQQPlaylistPayloadCandidates(urls, cookie = '') {
  for (const url of urls) {
    try {
      const payload = await requestQQFlexiblePayload(url, cookie);
      if (payload) {
        return payload;
      }
    } catch {
      // Continue trying the fallback endpoints.
    }
  }

  return null;
}

async function requestQQCreatedPlaylists(uin, cookie = '') {
  const encodedUin = encodeURIComponent(uin);
  const urls = [
    `https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss?format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0&hostUin=${encodedUin}&loginUin=${encodedUin}&sin=0&size=100`,
    `https://c6.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss?format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0&hostUin=${encodedUin}&loginUin=${encodedUin}&sin=0&size=100`,
    `https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss?hostuin=${encodedUin}&sin=0&size=100&r=${Math.random()}`,
  ];

  return requestQQPlaylistPayloadCandidates(urls, cookie);
}

async function requestQQCollectedPlaylists(uin, cookie = '') {
  const encodedUin = encodeURIComponent(uin);
  const urls = [
    `https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg?cid=205360956&userid=${encodedUin}&reqfrom=1&sin=0&ein=100&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`,
    `https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg?userid=${encodedUin}&reqfrom=1&sin=0&ein=100&format=json`,
  ];

  return requestQQPlaylistPayloadCandidates(urls, cookie);
}

async function requestQQProfileHomepage(uin, cookie = '') {
  const encodedUin = encodeURIComponent(uin);
  const urls = [
    `https://c6.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg?cv=4747474&ct=20&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=1&uin=${encodedUin}&cid=205360838&userid=0&reqfrom=1&reqtype=0`,
    `https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg?cv=4747474&ct=20&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=1&uin=${encodedUin}&cid=205360838&userid=0&reqfrom=1&reqtype=0`,
  ];

  return requestQQPlaylistPayloadCandidates(urls, cookie);
}

function extractTrackList(payload) {
  const tracks = [];
  const seenTrackIds = new Set();

  walkQQPayload(payload, (node) => {
    if (!Array.isArray(node)) {
      return;
    }

    for (const item of node) {
      const hasSongId = Boolean(
        item
        && typeof item === 'object'
        && (
          item.songmid
          || item.mid
          || item.song?.songmid
          || item.songInfo?.songmid
          || item.songinfo?.songmid
          || item.track_info?.mid
          || item.musicData?.songmid
          || item.music_data?.songmid
          || item.data?.songmid
        ),
      );
      const hasSongMetadata = Boolean(
        item
        && typeof item === 'object'
        && (
          item.songname
          || item.title
          || item.name
          || item.singer
          || item.singers
          || item.song?.songname
          || item.song?.title
          || item.songInfo?.title
          || item.songinfo?.title
          || item.track_info?.name
          || item.musicData?.songname
          || item.music_data?.songname
          || item.data?.songname
        ),
      );

      if (!hasSongId || !hasSongMetadata) {
        continue;
      }

      const mappedTrack = mapQQTrack(item);
      if (!mappedTrack || seenTrackIds.has(mappedTrack.provider_track_id)) {
        continue;
      }

      seenTrackIds.add(mappedTrack.provider_track_id);
      tracks.push(mappedTrack);
    }
  });

  return tracks;
}

function extractTrackListFromKnownQQPlaylistPayload(payload) {
  const candidates = [
    payload?.cdlist?.[0]?.songlist,
    payload?.cdlist?.[0]?.songList,
    payload?.cdlist?.[0]?.list,
    payload?.cdlist?.[0]?.song,
    payload?.data?.cdlist?.[0]?.songlist,
    payload?.data?.cdlist?.[0]?.songList,
    payload?.data?.cdlist?.[0]?.list,
    payload?.data?.cdlist?.[0]?.song,
    payload?.songlist,
    payload?.songList,
    payload?.data?.songlist,
    payload?.data?.songList,
    payload?.data?.list,
    payload?.list,
  ];

  const seenTrackIds = new Set();
  const tracks = [];

  for (const list of candidates) {
    if (!Array.isArray(list)) {
      continue;
    }

    for (const item of list) {
      const mappedTrack = mapQQTrack(item);
      if (!mappedTrack || !isMeaningfulQQTrack(mappedTrack) || seenTrackIds.has(mappedTrack.provider_track_id)) {
        continue;
      }

      seenTrackIds.add(mappedTrack.provider_track_id);
      tracks.push(mappedTrack);
    }

    if (tracks.length > 0) {
      return tracks;
    }
  }

  return tracks;
}

function isMeaningfulQQTrack(track) {
  if (!track) {
    return false;
  }

  return (
    (track.title && track.title !== 'Untitled')
    || (track.artist && track.artist !== 'Unknown Artist')
    || (track.album && track.album !== 'Unknown Album')
    || Number(track.duration || 0) > 0
  );
}

function filterMeaningfulQQTracks(tracks = []) {
  const seenTrackIds = new Set();
  return (Array.isArray(tracks) ? tracks : []).filter((track) => {
    if (!track?.provider_track_id || seenTrackIds.has(track.provider_track_id) || !isMeaningfulQQTrack(track)) {
      return false;
    }

    seenTrackIds.add(track.provider_track_id);
    return true;
  });
}

async function requestQQPlaylistTracks(disstid, uin, cookie = '') {
  const encodedPlaylistId = encodeURIComponent(disstid);
  const encodedUin = encodeURIComponent(uin);
  const urls = [
    `https://i.y.qq.com/qzone-music/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${encodedPlaylistId}&loginUin=${encodedUin}&hostUin=${encodedUin}&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`,
    `https://i.y.qq.com/qzone-music/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=1&disstid=${encodedPlaylistId}&loginUin=${encodedUin}&hostUin=${encodedUin}&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`,
    `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${encodedPlaylistId}&loginUin=${encodedUin}&hostUin=${encodedUin}&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`,
    `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=1&disstid=${encodedPlaylistId}&loginUin=${encodedUin}&hostUin=${encodedUin}&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`,
    `https://i.y.qq.com/qzone-music/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&dirid=${encodedPlaylistId}&loginUin=${encodedUin}&hostUin=${encodedUin}&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`,
    `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&dirid=${encodedPlaylistId}&loginUin=${encodedUin}&hostUin=${encodedUin}&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`,
  ];

  const payload = await requestQQPlaylistPayloadCandidates(urls, cookie);
  let tracks = payload ? extractTrackListFromKnownQQPlaylistPayload(payload) : [];

  if ((tracks.length === 0 || tracks.every((track) => !isMeaningfulQQTrack(track))) && normalizeString(disstid)) {
    const browserFallback = await scrapeQQPlaylistTracksWithBrowser(cookie, disstid).catch(() => null);
    if (browserFallback) {
      const fallbackTracks = [
        ...extractTrackList(browserFallback.pageState?.firstPageData),
        ...extractTrackList(browserFallback.pageState?.initialData),
        ...extractTrackList(browserFallback.pageState?.initialState),
        ...browserFallback.responsePayloads.flatMap((entry) => extractTrackList(entry.payload)),
        ...(Array.isArray(browserFallback.domTracks) ? browserFallback.domTracks : []),
      ];

      if (fallbackTracks.length > 0) {
        tracks = filterMeaningfulQQTracks(fallbackTracks);
      }
    }
  }

  return filterMeaningfulQQTracks(tracks);
}

export async function getQQMusicCollectionPlaylistTracks({
  playlistId,
  uin,
  cookie = '',
}) {
  const normalizedPlaylistId = normalizeString(playlistId);
  const normalizedUin = normalizeString(uin);
  if (!normalizedPlaylistId || !normalizedUin) {
    return [];
  }

  return requestQQPlaylistTracks(normalizedPlaylistId, normalizedUin, cookie);
}

async function requestQQLikedSongsPageData(uin, cookie = '') {
  const urls = [
    'https://y.qq.com/n/ryqq/profile/like/song',
    `https://y.qq.com/n/ryqq/profile/like/song?uin=${encodeURIComponent(uin)}`,
    'https://y.qq.com/n/ryqq/profile/like/song?tab=song',
    `https://y.qq.com/n/ryqq/profile/like/song?tab=song&uin=${encodeURIComponent(uin)}`,
  ];

  for (const url of urls) {
    try {
      const html = await requestQQText(url, cookie);
      const payload = parseQQInitialDataFromHtml(html);
      if (payload) {
        return payload;
      }
    } catch {
      // Ignore and continue with fallbacks.
    }
  }

  return null;
}

async function scrapeQQPlaylistTracksWithBrowser(cookie = '', playlistId = '') {
  const normalizedPlaylistId = normalizeString(playlistId);
  if (!normalizedPlaylistId) {
    return null;
  }

  const executablePath = resolveQQMusicBrowserExecutablePath();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      viewport: {
        width: 1440,
        height: 960,
      },
    });

    await context.addCookies(buildPlaywrightCookiesFromCookieString(cookie));
    const responsePayloads = [];
    const page = await context.newPage();

    page.on('response', async (response) => {
      try {
        const url = response.url();
        if (!/qq\.com/i.test(url) || responsePayloads.length >= 30) {
          return;
        }

        const contentType = response.headers()['content-type'] || '';
        if (!/json|javascript|text/i.test(contentType)) {
          return;
        }

        const bodyText = await response.text();
        const parsed =
          parseQQFlexiblePayload(bodyText)
          || parseQQInitialDataFromHtml(bodyText);

        if (!parsed) {
          return;
        }

        responsePayloads.push({
          url,
          payload: parsed,
        });
      } catch {
        // Ignore response parsing failures.
      }
    });

    const targetUrl = `https://i.y.qq.com/n2/m/share/details/interactive_playlist.html?ADTAG=ryqq.playlist&id=${encodeURIComponent(normalizedPlaylistId)}`;
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(5000);

    const pageState = await page.evaluate(() => {
      const safeWindow = window;
      return {
        title: document.title,
        href: window.location.href,
        firstPageData: safeWindow.firstPageData ?? null,
        initialData: safeWindow.__INITIAL_DATA__ ?? null,
        initialState: safeWindow.__INITIAL_STATE__ ?? null,
        htmlSnippet: document.documentElement.outerHTML.slice(0, 8000),
      };
    });

    const domTracks = await page.evaluate(() => {
      const parseSongmidFromHref = (href) => {
        const source = String(href || '');
        const detailMatch = source.match(/songDetail\/([A-Za-z0-9]+)/i);
        if (detailMatch?.[1]) {
          return detailMatch[1];
        }

        const queryMatch = source.match(/[?&](?:songmid|mid)=([A-Za-z0-9]+)/i);
        if (queryMatch?.[1]) {
          return queryMatch[1];
        }

        return '';
      };

      const rows = Array.from(document.querySelectorAll('li, .songlist__item, .js_song_item'));
      const tracks = [];
      const seen = new Set();

      for (const row of rows) {
        const songLink =
          row.querySelector('a[href*="songDetail"]')
          || row.querySelector('a[href*="songmid="]')
          || row.querySelector('a[href*="/song/"]');
        const songmid = parseSongmidFromHref(songLink?.getAttribute('href') || '');
        const title =
          row.querySelector('.songlist__songname_txt')
            ?.textContent
          || row.querySelector('.songname__text')
            ?.textContent
          || songLink?.textContent
          || '';

        if (!songmid || !title || seen.has(songmid)) {
          continue;
        }

        seen.add(songmid);
        const artist =
          row.querySelector('.songlist__artist')
            ?.textContent
          || row.querySelector('.singer_name')
            ?.textContent
          || '';
        const album =
          row.querySelector('.songlist__album')
            ?.textContent
          || row.querySelector('.album_name')
            ?.textContent
          || '';

        tracks.push({
          provider_track_id: songmid,
          title: String(title).trim(),
          artist: String(artist).trim(),
          album: String(album).trim(),
          duration: 0,
          cover_url: null,
        });
      }

      return tracks;
    });

    return {
      pageState,
      responsePayloads,
      domTracks,
    };
  } finally {
    await browser.close();
  }
}

async function scrapeQQLikedSongsWithBrowser(cookie = '', playlistId = '') {
  const executablePath = resolveQQMusicBrowserExecutablePath();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      viewport: {
        width: 1440,
        height: 960,
      },
    });

    const responsePayloads = [];
    const page = await context.newPage();
    await context.addCookies(buildPlaywrightCookiesFromCookieString(cookie));

    page.on('response', async (response) => {
      try {
        const url = response.url();
        if (
          !/qq\.com/i.test(url)
          || responsePayloads.length >= 30
        ) {
          return;
        }

        const contentType = response.headers()['content-type'] || '';
        if (!/json|javascript|text/i.test(contentType)) {
          return;
        }

        const bodyText = await response.text();
        const parsed =
          parseQQFlexiblePayload(bodyText)
          || parseQQInitialDataFromHtml(bodyText);

        if (!parsed) {
          return;
        }

        responsePayloads.push({
          url,
          payload: parsed,
        });
      } catch {
        // Ignore response parsing failures.
      }
    });

    const targetUrl = playlistId
      ? `https://i.y.qq.com/n2/m/share/details/interactive_playlist.html?ADTAG=ryqq.playlist&id=${encodeURIComponent(playlistId)}`
      : 'https://y.qq.com/n/ryqq/profile/like/song';
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(5000);

    const pageState = await page.evaluate(() => {
      const safeWindow = window;

      return {
        title: document.title,
        href: window.location.href,
        initialData: safeWindow.__INITIAL_DATA__ ?? null,
        initialState: safeWindow.__INITIAL_STATE__ ?? null,
        htmlSnippet: document.documentElement.outerHTML.slice(0, 5000),
      };
    });

    const domTracks = await page.evaluate(() => {
      const parseSongmidFromHref = (href) => {
        const source = String(href || '');
        const detailMatch = source.match(/songDetail\/([A-Za-z0-9]+)/i);
        if (detailMatch?.[1]) {
          return detailMatch[1];
        }

        const queryMatch = source.match(/[?&](?:songmid|mid)=([A-Za-z0-9]+)/i);
        if (queryMatch?.[1]) {
          return queryMatch[1];
        }

        return '';
      };

      const root =
        document.querySelector('.none_txt')
        || document.querySelector('.songlist')
        || document.querySelector('.mod_songlist')
        || document.querySelector('[class*="songlist"]')
        || document.body;
      const rows = Array.from(root.querySelectorAll('li, .songlist__item, .js_song_item, tr'));
      const tracks = [];
      const seen = new Set();

      for (const row of rows) {
        const songLink =
          row.querySelector('a[href*="songDetail"]')
          || row.querySelector('a[href*="songmid="]')
          || row.querySelector('a[href*="/song/"]');
        const songmid = parseSongmidFromHref(songLink?.getAttribute('href') || '');
        const title =
          row.querySelector('.songlist__songname_txt')?.textContent
          || row.querySelector('.songname__text')?.textContent
          || row.querySelector('[class*="songname"]')?.textContent
          || songLink?.textContent
          || '';

        if (!songmid || !title || seen.has(songmid)) {
          continue;
        }

        seen.add(songmid);
        const artist =
          row.querySelector('.songlist__artist')?.textContent
          || row.querySelector('.singer_name')?.textContent
          || row.querySelector('[class*="singer"]')?.textContent
          || '';
        const album =
          row.querySelector('.songlist__album')?.textContent
          || row.querySelector('.album_name')?.textContent
          || row.querySelector('[class*="album"]')?.textContent
          || '';

        tracks.push({
          provider_track_id: songmid,
          title: String(title).trim(),
          artist: String(artist).trim(),
          album: String(album).trim(),
          duration: 0,
          cover_url: null,
        });
      }

      return tracks;
    });

    return {
      pageState,
      responsePayloads,
      domTracks,
    };
  } finally {
    await browser.close();
  }
}

export function normalizeQQQuality(value) {
  if (value === 'm4a' || value === '128' || value === '320') {
    return value;
  }
  return '128';
}

function getQQFilenameInfo(songmid, quality) {
  const normalizedQuality = normalizeQQQuality(quality);
  if (normalizedQuality === 'm4a') {
    return {
      quality: normalizedQuality,
      filename: `C400${songmid}${songmid}.m4a`,
    };
  }

  if (normalizedQuality === '320') {
    return {
      quality: normalizedQuality,
      filename: `M800${songmid}${songmid}.mp3`,
    };
  }

  return {
    quality: '128',
    filename: `M500${songmid}${songmid}.mp3`,
  };
}

function unwrapQQTrackPayload(song) {
  if (!song || typeof song !== 'object') {
    return null;
  }

  const candidates = [
    song,
    song.song,
    song.songInfo,
    song.songinfo,
    song.track_info,
    song.musicData,
    song.music_data,
    song.data,
  ];

  return candidates.find((item) => item && typeof item === 'object') ?? null;
}

function mapQQTrack(song) {
  const rawSong = unwrapQQTrackPayload(song);
  const providerTrackId = normalizeString(
    rawSong?.songmid
    || rawSong?.mid
    || rawSong?.strMediaMid,
  );
  if (!providerTrackId) {
    return null;
  }

  const albumMid = normalizeString(rawSong?.album?.mid || rawSong?.albumMid || rawSong?.albummid);
  const title = normalizeString(rawSong?.title || rawSong?.name || rawSong?.songname) || 'Untitled';
  const artist = normalizeSingerNames(
    rawSong?.singer
    || rawSong?.singers
    || rawSong?.singername
    || rawSong?.singerName
    || rawSong?.artist
    || rawSong?.artists,
  ) || 'Unknown Artist';
  const album = normalizeString(
    rawSong?.album?.title || rawSong?.album?.name || rawSong?.albumName || rawSong?.albumname,
  ) || 'Unknown Album';
  const duration = Number(rawSong?.interval || rawSong?.duration || rawSong?.songtime || 0);

  return {
    provider_track_id: providerTrackId,
    title,
    artist,
    album,
    duration: Number.isFinite(duration) ? duration : 0,
    cover_url: albumCoverFromMid(albumMid),
  };
}

function mapNeteaseTrack(song) {
  const track = song && typeof song === 'object' ? song : {};
  const providerTrackId = normalizeString(track?.id);
  if (!providerTrackId) {
    return null;
  }

  const artists = Array.isArray(track?.artists)
    ? track.artists
    : Array.isArray(track?.ar)
      ? track.ar
      : Array.isArray(track?.artist)
        ? track.artist
        : [];
  const album = track?.album || track?.al || {};
  const durationMs = Number(track?.duration ?? track?.dt ?? 0);

  return {
    provider_track_id: providerTrackId,
    title: normalizeString(track?.name) || 'Untitled',
    artist: normalizeSingerNames(artists) || 'Unknown Artist',
    album: normalizeString(album?.name) || 'Unknown Album',
    duration: Number.isFinite(durationMs) ? Math.max(0, Math.floor(durationMs / 1000)) : 0,
    cover_url: normalizePlaylistCoverUrl(album?.picUrl || album?.blurPicUrl),
  };
}

function parseLyricLineKey(minutes, seconds, fraction = '') {
  return `${minutes}:${seconds}.${fraction}`;
}

function parseLyricTextBlock(text) {
  if (!text) {
    return [];
  }

  const rows = [];

  for (const rawLine of String(text).split('\n')) {
    const matches = [...rawLine.matchAll(/\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    if (matches.length === 0) {
      continue;
    }

    const content = rawLine.replace(/\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/g, '').trim();
    for (const match of matches) {
      const minutes = Number(match[1] || 0);
      const seconds = Number(match[2] || 0);
      const fraction = String(match[3] || '');
      const time = minutes * 60 + seconds + (fraction ? Number(fraction.padEnd(3, '0')) / 1000 : 0);

      rows.push({
        key: parseLyricLineKey(match[1], match[2], fraction),
        time,
        text: content,
      });
    }
  }

  return rows;
}

export async function loginNeteaseMusicByPhone({
  phone,
  password,
  countryCode = '86',
}) {
  const { phone: normalizedPhone, countryCode: normalizedCountryCode } = normalizeNeteasePhoneInput(phone, countryCode);
  const normalizedPassword = String(password || '');

  if (!normalizedPhone || !normalizedPassword) {
    throw new Error('Phone and password are required.');
  }

  const form = new URLSearchParams({
    phone: normalizedPhone,
    password: hashNeteasePassword(normalizedPassword),
    countrycode: normalizedCountryCode,
    rememberLogin: 'true',
  });

  const { payload, setCookieHeaders } = await requestNeteaseJson(`${NETEASE_MUSIC_ENDPOINT}/api/login/cellphone`, {
    method: 'POST',
    body: form.toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!payload || Number(payload.code || 0) !== 200) {
    throw new Error(payload?.msg || payload?.message || 'Netease music phone login failed.');
  }

  const cookie = mergeCookieStrings('', setCookieHeaders);
  if (!cookie) {
    throw new Error('Netease music login succeeded but no cookie was returned.');
  }

  return {
    cookie,
    phone: normalizedPhone,
    country_code: normalizedCountryCode,
    account_name: normalizeString(payload?.profile?.nickname || payload?.account?.userName) || null,
  };
}

export async function sendNeteaseMusicPhoneCaptcha({
  phone,
  countryCode = '86',
}) {
  const { phone: normalizedPhone, countryCode: normalizedCountryCode } = normalizeNeteasePhoneInput(phone, countryCode);
  const { payload } = await requestNeteaseWeapi('sms/captcha/sent', {
    cellphone: normalizedPhone,
    ctcode: normalizedCountryCode,
  });

  if (!payload || Number(payload.code || 0) !== 200) {
    throw new Error(payload?.msg || payload?.message || 'Failed to send Netease music captcha.');
  }

  return {
    phone: normalizedPhone,
    country_code: normalizedCountryCode,
    message: normalizeString(payload?.message || payload?.msg) || '验证码已发送，请注意查收。',
  };
}

export async function loginNeteaseMusicByCaptcha({
  phone,
  captcha,
  countryCode = '86',
}) {
  const { phone: normalizedPhone, countryCode: normalizedCountryCode } = normalizeNeteasePhoneInput(phone, countryCode);
  const normalizedCaptcha = normalizeString(captcha).replace(/\s+/g, '');

  if (!normalizedCaptcha) {
    throw new Error('Captcha is required.');
  }

  const loginPayload = {
    phone: normalizedPhone,
    captcha: normalizedCaptcha,
    countrycode: normalizedCountryCode,
    rememberLogin: true,
  };

  const { payload, setCookieHeaders } = await requestNeteaseWeapi('login/cellphone', loginPayload);

  let cookie = mergeCookieStrings('', setCookieHeaders);
  if (!cookie && payload?.token) {
    cookie = mergeCookieStrings('', [`MUSIC_U=${payload.token}`]);
  }

  if (!payload || Number(payload.code || 0) !== 200) {
    throw new Error(payload?.msg || payload?.message || 'Netease music captcha login failed.');
  }

  if (!cookie) {
    const fallback = await requestNeteaseWeapi('login/cellphone', {
      ...loginPayload,
      checkToken: true,
    }).catch(() => null);
    cookie = mergeCookieStrings(cookie, fallback?.setCookieHeaders || []);
  }

  if (!cookie) {
    throw new Error('Netease music login succeeded but no cookie was returned.');
  }

  return {
    cookie,
    phone: normalizedPhone,
    country_code: normalizedCountryCode,
    account_name: normalizeString(payload?.profile?.nickname || payload?.account?.userName) || null,
  };
}

export async function verifyNeteaseMusicPhoneCaptcha({
  phone,
  captcha,
  countryCode = '86',
}) {
  const { phone: normalizedPhone, countryCode: normalizedCountryCode } = normalizeNeteasePhoneInput(phone, countryCode);
  const normalizedCaptcha = normalizeString(captcha).replace(/\s+/g, '');

  if (!normalizedCaptcha) {
    throw new Error('Captcha is required.');
  }

  const { payload } = await requestNeteaseWeapi('captcha/verify', {
    cellphone: normalizedPhone,
    captcha: normalizedCaptcha,
    ctcode: normalizedCountryCode,
  });

  if (!payload || Number(payload.code || 0) !== 200) {
    throw new Error(payload?.msg || payload?.message || 'Netease music captcha verification failed.');
  }

  return {
    phone: normalizedPhone,
    country_code: normalizedCountryCode,
    message: normalizeString(payload?.message || payload?.msg) || '验证码校验成功。',
  };
}

export async function searchNeteaseMusicTracks({
  keyword,
  page = 1,
  limit = 20,
  cookie = '',
}) {
  const trimmedKeyword = normalizeString(keyword);
  if (!trimmedKeyword) {
    return [];
  }

  const params = new URLSearchParams({
    s: trimmedKeyword,
    type: '1',
    offset: String(Math.max(0, (Math.max(1, Number(page) || 1) - 1) * Math.max(1, Math.min(50, Number(limit) || 20)))),
    total: 'true',
    limit: String(Math.max(1, Math.min(50, Number(limit) || 20))),
    csrf_token: '',
  });

  const { payload } = await requestNeteaseJson(`${NETEASE_MUSIC_ENDPOINT}/api/search/get/web?${params.toString()}`, {
    cookie,
  });
  const list = payload?.result?.songs;
  if (!Array.isArray(list)) {
    return [];
  }

  const detailTracks = await requestNeteaseSongDetails(
    list
      .map((item) => normalizeString(item?.id))
      .filter(Boolean),
    cookie,
  ).catch(() => []);

  return mergeNeteaseTracks(detailTracks, list);
}

export async function getNeteaseMusicLyric({
  trackId,
  cookie = '',
}) {
  const normalizedTrackId = normalizeString(trackId);
  if (!normalizedTrackId) {
    return [];
  }

  const params = new URLSearchParams({
    id: normalizedTrackId,
    lv: '-1',
    tv: '-1',
    kv: '-1',
  });

  const { payload } = await requestNeteaseJson(`${NETEASE_MUSIC_ENDPOINT}/api/song/lyric?${params.toString()}`, {
    cookie,
  });
  const baseLines = parseLyricTextBlock(payload?.lrc?.lyric || '');
  const translationLines = parseLyricTextBlock(payload?.tlyric?.lyric || '');
  const translationMap = new Map(translationLines.map((line) => [line.key, line.text]));

  return baseLines
    .filter((line) => line.text)
    .map((line) => ({
      time: line.time,
      text: line.text,
      translation: translationMap.get(line.key) || '',
    }));
}

export async function resolveNeteaseMusicTrack({
  trackId,
}) {
  const normalizedTrackId = normalizeString(trackId);
  if (!normalizedTrackId) {
    throw new Error('Missing track id.');
  }

  return {
    stream_url: `${NETEASE_MUSIC_ENDPOINT}/song/media/outer/url?id=${encodeURIComponent(normalizedTrackId)}.mp3`,
    quality: '128',
  };
}

function chunkItems(items = [], size = 200) {
  const chunks = [];
  const normalizedSize = Math.max(1, Math.floor(size));

  for (let index = 0; index < items.length; index += normalizedSize) {
    chunks.push(items.slice(index, index + normalizedSize));
  }

  return chunks;
}

function normalizeNeteasePlaylistSummary(playlist, kind) {
  if (!playlist || typeof playlist !== 'object') {
    return null;
  }

  const id = normalizeString(playlist?.id);
  const title = normalizeString(playlist?.name) || 'Untitled Playlist';
  const songCount = Number(playlist?.trackCount ?? playlist?.songCount ?? playlist?.track_number ?? 0);

  if (!id) {
    return null;
  }

  return {
    id,
    title,
    cover_url: normalizePlaylistCoverUrl(
      playlist?.coverImgUrl
      || playlist?.coverUrl
      || playlist?.picUrl
      || playlist?.backgroundCoverUrl,
    ),
    song_count: Number.isFinite(songCount) ? Math.max(0, Math.floor(songCount)) : 0,
    kind,
  };
}

export async function getNeteaseMusicAccountProfile({
  cookie = '',
}) {
  const normalizedCookie = String(cookie || '').trim();
  if (!normalizedCookie) {
    throw new Error('Current Netease Music source does not contain a login cookie.');
  }

  const { payload } = await requestNeteaseWeapi('w/nuser/account/get', {
    noCheckToken: true,
  }, {
    cookie: normalizedCookie,
  });

  const profile = payload?.profile ?? null;
  const account = payload?.account ?? null;
  const userId = normalizeString(profile?.userId || account?.id);
  if (!userId || !profile) {
    throw new Error('Current Netease Music source is not logged in with a valid Netease account.');
  }

  return {
    user_id: userId,
    nickname: normalizeString(profile?.nickname || account?.userName) || null,
    avatar_url: normalizePlaylistCoverUrl(profile?.avatarUrl || profile?.avatarUrlStr),
    profile,
    account,
  };
}

async function requestNeteaseUserPlaylists(userId, cookie = '') {
  const normalizedUserId = normalizeString(userId);
  if (!normalizedUserId) {
    return [];
  }

  const params = new URLSearchParams({
    uid: normalizedUserId,
    limit: '1000',
    offset: '0',
    includeVideo: 'true',
  });
  const { payload } = await requestNeteaseJson(`${NETEASE_MUSIC_ENDPOINT}/api/user/playlist?${params.toString()}`, {
    cookie,
  });

  return Array.isArray(payload?.playlist) ? payload.playlist : [];
}

async function requestNeteasePlaylistDetail(playlistId, trackCount = 1000, cookie = '') {
  const normalizedPlaylistId = normalizeString(playlistId);
  if (!normalizedPlaylistId) {
    return null;
  }

  const params = new URLSearchParams({
    id: normalizedPlaylistId,
    n: String(Math.max(1, Math.min(10000, Number(trackCount) || 1000))),
    s: '0',
  });
  const { payload } = await requestNeteaseJson(`${NETEASE_MUSIC_ENDPOINT}/api/v6/playlist/detail?${params.toString()}`, {
    cookie,
  });

  return payload?.playlist ?? null;
}

async function requestNeteaseSongDetails(trackIds = [], cookie = '') {
  const normalizedTrackIds = [...new Set(
    (Array.isArray(trackIds) ? trackIds : [])
      .map((item) => normalizeString(item))
      .filter(Boolean),
  )];
  if (normalizedTrackIds.length === 0) {
    return [];
  }

  const c = JSON.stringify(
    normalizedTrackIds.map((id) => {
      const numericId = Number(id);
      return { id: Number.isFinite(numericId) ? numericId : id };
    }),
  );
  const ids = `[${normalizedTrackIds.map((id) => JSON.stringify(id)).join(',')}]`;
  const body = new URLSearchParams({ c, ids }).toString();
  const { payload } = await requestNeteaseJson(`${NETEASE_MUSIC_ENDPOINT}/api/v3/song/detail`, {
    method: 'POST',
    cookie,
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  return Array.isArray(payload?.songs) ? payload.songs : [];
}

function mergeNeteaseTracks(primaryTracks = [], secondaryTracks = []) {
  const mergedTracks = [];
  const seenTrackIds = new Set();

  for (const item of [...primaryTracks, ...secondaryTracks]) {
    const mappedTrack = mapNeteaseTrack(item);
    if (!mappedTrack || seenTrackIds.has(mappedTrack.provider_track_id)) {
      continue;
    }

    seenTrackIds.add(mappedTrack.provider_track_id);
    mergedTracks.push(mappedTrack);
  }

  return mergedTracks;
}

async function requestNeteasePlaylistTracks(playlistId, cookie = '') {
  const playlistDetail = await requestNeteasePlaylistDetail(playlistId, 1000, cookie);
  if (!playlistDetail) {
    return [];
  }

  const trackIds = Array.isArray(playlistDetail?.trackIds)
    ? playlistDetail.trackIds
        .map((item) => normalizeString(item?.id || item))
        .filter(Boolean)
    : [];
  const embeddedTracks = Array.isArray(playlistDetail?.tracks) ? playlistDetail.tracks : [];
  let tracks = mergeNeteaseTracks(embeddedTracks, []);

  if (trackIds.length > tracks.length) {
    const embeddedTrackIds = new Set(tracks.map((item) => item.provider_track_id));
    const missingTrackIds = trackIds.filter((id) => !embeddedTrackIds.has(id));

    for (const chunk of chunkItems(missingTrackIds, 200)) {
      const detailTracks = await requestNeteaseSongDetails(chunk, cookie).catch(() => []);
      tracks = mergeNeteaseTracks(tracks, detailTracks);
    }
  }

  return tracks;
}

export async function getNeteaseMusicCollectionPlaylistTracks({
  playlistId,
  cookie = '',
}) {
  const normalizedPlaylistId = normalizeString(playlistId);
  if (!normalizedPlaylistId) {
    return [];
  }

  return requestNeteasePlaylistTracks(normalizedPlaylistId, cookie);
}

export async function getNeteaseMusicCollections({
  cookie = '',
}) {
  const normalizedCookie = String(cookie || '').trim();
  const accountProfile = await getNeteaseMusicAccountProfile({
    cookie: normalizedCookie,
  });
  const playlists = await requestNeteaseUserPlaylists(accountProfile.user_id, normalizedCookie);

  const likedPlaylistRaw = playlists.find((playlist) => {
    const specialType = Number(playlist?.specialType ?? 0);
    const title = normalizeString(playlist?.name);
    return specialType === 5 || /我喜欢|喜欢的音乐/.test(title);
  }) ?? null;
  const createdPlaylistsRaw = playlists.filter((playlist) => {
    const playlistUserId = normalizeString(playlist?.creator?.userId || playlist?.userId);
    const subscribed = Boolean(playlist?.subscribed);
    return playlistUserId === accountProfile.user_id && !subscribed;
  });
  const collectedPlaylistsRaw = playlists.filter((playlist) => {
    const playlistId = normalizeString(playlist?.id);
    if (playlistId && playlistId === normalizeString(likedPlaylistRaw?.id)) {
      return false;
    }

    const playlistUserId = normalizeString(playlist?.creator?.userId || playlist?.userId);
    const subscribed = Boolean(playlist?.subscribed);
    return subscribed || playlistUserId !== accountProfile.user_id;
  });

  const likedSongsPlaylist = normalizeNeteasePlaylistSummary(likedPlaylistRaw, 'liked_songs');
  const createdPlaylists = createdPlaylistsRaw
    .map((playlist) => normalizeNeteasePlaylistSummary(playlist, 'created'))
    .filter((playlist) => playlist && playlist.id !== likedSongsPlaylist?.id);
  const collectedPlaylists = collectedPlaylistsRaw
    .map((playlist) => normalizeNeteasePlaylistSummary(playlist, 'collected'))
    .filter(Boolean);
  const likedTracks = likedSongsPlaylist
    ? await getNeteaseMusicCollectionPlaylistTracks({
        playlistId: likedSongsPlaylist.id,
        cookie: normalizedCookie,
      }).catch(() => [])
    : [];

  return {
    uin: accountProfile.user_id,
    nickname: accountProfile.nickname,
    avatar_url: accountProfile.avatar_url,
    liked_songs_playlist: likedSongsPlaylist,
    liked_tracks: likedTracks,
    created_playlists: createdPlaylists,
    collected_playlists: collectedPlaylists,
  };
}

export async function getQQMusicLyric({
  songmid,
  cookie = '',
}) {
  const normalizedSongmid = normalizeString(songmid);
  if (!normalizedSongmid) {
    return [];
  }

  const response = await requestQQJson(
    `https://i.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${encodeURIComponent(normalizedSongmid)}&g_tk=5381&format=json&inCharset=utf8&outCharset=utf-8&nobase64=1`,
    cookie,
  );

  const baseLines = parseLyricTextBlock(response?.lyric || '');
  const translationLines = parseLyricTextBlock(response?.trans || '');
  const translationMap = new Map(translationLines.map((line) => [line.key, line.text]));

  return baseLines
    .filter((line) => line.text)
    .map((line) => ({
      time: line.time,
      text: line.text,
      translation: translationMap.get(line.key) || '',
    }));
}

export async function searchQQMusicTracks({
  keyword,
  page = 1,
  limit = 20,
  cookie = '',
}) {
  const trimmedKeyword = normalizeString(keyword);
  if (!trimmedKeyword) {
    return [];
  }

  const response = await requestQQMusic(
    {
      comm: {
        ct: '19',
        cv: '1859',
        uin: '0',
      },
      req: {
        method: 'DoSearchForQQMusicDesktop',
        module: 'music.search.SearchCgiService',
        param: {
          grp: 1,
          num_per_page: Math.max(1, Math.min(50, Number(limit) || 20)),
          page_num: Math.max(1, Number(page) || 1),
          query: trimmedKeyword,
          search_type: 0,
        },
      },
    },
    cookie,
  );

  const list = response?.req?.data?.body?.song?.list;
  if (!Array.isArray(list)) {
    return [];
  }

  return list.map(mapQQTrack).filter(Boolean);
}

export async function resolveQQMusicTrack({
  songmid,
  quality = '128',
  cookie = '',
}) {
  const normalizedSongmid = normalizeString(songmid);
  if (!normalizedSongmid) {
    throw new Error('Missing track id.');
  }

  const preferred = normalizeQQQuality(quality);
  const qualityOrder =
    preferred === '320'
      ? ['320', '128', 'm4a']
      : preferred === 'm4a'
        ? ['m4a', '128', '320']
        : ['128', 'm4a', '320'];

  for (const candidate of qualityOrder) {
    const { filename } = getQQFilenameInfo(normalizedSongmid, candidate);
    const response = await requestQQMusic(
      {
        req_1: {
          module: 'vkey.GetVkeyServer',
          method: 'CgiGetVkey',
          param: {
            filename: [filename],
            guid: '10000',
            songmid: [normalizedSongmid],
            songtype: [0],
            uin: '0',
            loginflag: 1,
            platform: '20',
          },
        },
        loginUin: '0',
        comm: {
          uin: '0',
          format: 'json',
          ct: 24,
          cv: 0,
        },
      },
      cookie,
    );

    const sip = response?.req_1?.data?.sip?.[0] || '';
    const purl = response?.req_1?.data?.midurlinfo?.[0]?.purl || '';

    if (sip && purl) {
      return {
        stream_url: `${sip}${purl}`,
        quality: candidate,
      };
    }
  }

  throw new Error('Track is not playable from the current source.');
}

export async function getQQMusicCollections({
  cookie = '',
}) {
  const normalizedCookie = String(cookie || '').trim();
  const uin = extractQQUinFromCookie(normalizedCookie);
  if (!uin) {
    await writeQQMusicDebugSnapshot('qq-music-collections', {
      ok: false,
      step: 'extract_uin',
      message: 'No valid QQ uin was found in the cookie.',
      cookie_keys: [...parseCookieMap(normalizedCookie).keys()],
    });
    throw new Error('当前 QQ 音乐音源未包含有效登录信息，请重新登录后再试。');
  }

  try {
    const [likedPagePayload, profilePayload, createdPayload, collectedPayload] = await Promise.all([
      requestQQLikedSongsPageData(uin, normalizedCookie).catch(() => null),
      requestQQProfileHomepage(uin, normalizedCookie).catch(() => null),
      requestQQCreatedPlaylists(uin, normalizedCookie).catch(() => null),
      requestQQCollectedPlaylists(uin, normalizedCookie).catch(() => null),
    ]);

    if (!likedPagePayload && !profilePayload && !createdPayload && !collectedPayload) {
      await writeQQMusicDebugSnapshot('qq-music-collections', {
        ok: false,
        step: 'fetch_payloads',
        message: 'No payloads were returned by any collection endpoint.',
        uin,
        cookie_keys: [...parseCookieMap(normalizedCookie).keys()],
      });
      throw new Error('未读取到 QQ 音乐收藏数据，请确认当前音源已完成登录后再试。');
    }

    const likedPagePlaylists = extractPlaylistSummaries(likedPagePayload, 'liked_songs');
    const likedPlaylistFromProfile = extractLikedPlaylistFromProfilePayload(profilePayload);
    const createdPlaylists = [
      ...extractCreatedPlaylistsFromProfilePayload(profilePayload),
      ...extractPlaylistSummaries(createdPayload, 'created'),
    ].filter((item, index, array) => array.findIndex((entry) => entry.id === item.id) === index);
    const collectedPlaylists = extractPlaylistSummaries(collectedPayload, 'collected');
    const likedSongsPlaylist =
      pickLikedPlaylist(likedPagePlaylists) ??
      likedPlaylistFromProfile ??
      pickLikedPlaylist(createdPlaylists) ??
      pickLikedPlaylist(collectedPlaylists.map((item) => ({ ...item, kind: 'liked_songs' }))) ??
      null;

    let likedTracks = filterMeaningfulQQTracks(extractTrackList(likedPagePayload));
    if (likedTracks.length === 0 && likedSongsPlaylist) {
      likedTracks = await requestQQPlaylistTracks(likedSongsPlaylist.id, uin, normalizedCookie);
    }

    let browserFallback = null;
    let playlistBrowserFallback = null;
    if (likedTracks.length === 0 && likedSongsPlaylist?.id) {
      browserFallback = await scrapeQQLikedSongsWithBrowser(normalizedCookie, likedSongsPlaylist.id).catch(() => null);
      if (browserFallback) {
        const browserTracks = [
          ...extractTrackList(browserFallback.pageState?.initialData),
          ...extractTrackList(browserFallback.pageState?.initialState),
          ...extractTrackList(browserFallback.pageState?.firstPageData),
          ...browserFallback.responsePayloads.flatMap((entry) => extractTrackList(entry.payload)),
          ...(Array.isArray(browserFallback.domTracks) ? browserFallback.domTracks : []),
        ];

        if (browserTracks.length > 0) {
          likedTracks = filterMeaningfulQQTracks(browserTracks);
        }
      }

      if (likedTracks.length === 0 && likedSongsPlaylist?.id) {
        playlistBrowserFallback = await scrapeQQPlaylistTracksWithBrowser(normalizedCookie, likedSongsPlaylist.id).catch(() => null);
        if (playlistBrowserFallback) {
          const playlistTracks = [
            ...extractTrackList(playlistBrowserFallback.pageState?.firstPageData),
            ...extractTrackList(playlistBrowserFallback.pageState?.initialData),
            ...extractTrackList(playlistBrowserFallback.pageState?.initialState),
            ...playlistBrowserFallback.responsePayloads.flatMap((entry) => extractTrackList(entry.payload)),
            ...(Array.isArray(playlistBrowserFallback.domTracks) ? playlistBrowserFallback.domTracks : []),
          ];

          if (playlistTracks.length > 0) {
            likedTracks = filterMeaningfulQQTracks(playlistTracks);
          }
        }
      }
    }

    const createdWithoutLiked = createdPlaylists.filter((item) => item.id !== likedSongsPlaylist?.id);
    const collectedWithoutLiked = collectedPlaylists.filter((item) => item.id !== likedSongsPlaylist?.id);
    const profile = extractProfileSummary(profilePayload ?? likedPagePayload ?? createdPayload ?? collectedPayload ?? {});

    likedTracks = filterMeaningfulQQTracks(likedTracks);

    const createdWithCounts = await Promise.all(
      createdWithoutLiked.slice(0, 24).map(async (playlist) => {
        const tracks = await requestQQPlaylistTracks(playlist.id, uin, normalizedCookie).catch(() => []);
        return {
          ...playlist,
          song_count: tracks.length > 0 ? tracks.length : playlist.song_count,
        };
      }),
    );

    const collectedWithCounts = await Promise.all(
      collectedWithoutLiked.slice(0, 24).map(async (playlist) => {
        const tracks = await requestQQPlaylistTracks(playlist.id, uin, normalizedCookie).catch(() => []);
        return {
          ...playlist,
          song_count: tracks.length > 0 ? tracks.length : playlist.song_count,
        };
      }),
    );

    await writeQQMusicDebugSnapshot('qq-music-collections', {
      ok: true,
      uin,
      cookie_keys: [...parseCookieMap(normalizedCookie).keys()],
      liked_songs_playlist: likedSongsPlaylist,
      liked_track_count: likedTracks.length,
      created_playlist_count: createdPlaylists.length,
      collected_playlist_count: collectedPlaylists.length,
      liked_page_playlist_count: likedPagePlaylists.length,
      profile,
      liked_tracks_preview: likedTracks.slice(0, 10),
      likedPagePayload,
      profilePayload,
      createdPayload,
      collectedPayload,
      browserFallback,
      playlistBrowserFallback,
    });

    return {
      uin,
      nickname: profile.nickname,
      avatar_url: profile.avatar_url,
      liked_songs_playlist: likedSongsPlaylist,
      liked_tracks: likedTracks,
      created_playlists: createdWithCounts,
      collected_playlists: collectedWithCounts,
    };
  } catch (error) {
    await writeQQMusicDebugSnapshot('qq-music-collections', {
      ok: false,
      step: 'exception',
      uin,
      cookie_keys: [...parseCookieMap(normalizedCookie).keys()],
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

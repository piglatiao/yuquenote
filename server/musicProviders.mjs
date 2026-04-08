import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const QQ_MUSIC_ENDPOINT = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
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
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSingerNames(value) {
  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((item) => normalizeString(item?.name || item?.title))
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
    return directUrl;
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
      const looksLikeSong = Boolean(
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
      if (!looksLikeSong) {
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
  if (!payload) {
    return [];
  }

  return extractTrackList(payload);
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

async function scrapeQQLikedSongsWithBrowser(cookie = '') {
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

    await page.goto('https://y.qq.com/n/ryqq/profile/like/song', {
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

    return {
      pageState,
      responsePayloads,
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
  const artist = normalizeSingerNames(rawSong?.singer || rawSong?.singers) || 'Unknown Artist';
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

    let likedTracks = extractTrackList(likedPagePayload);
    if (likedTracks.length === 0 && likedSongsPlaylist) {
      likedTracks = await requestQQPlaylistTracks(likedSongsPlaylist.id, uin, normalizedCookie);
    }

    let browserFallback = null;
    let playlistBrowserFallback = null;
    if (likedTracks.length === 0) {
      browserFallback = await scrapeQQLikedSongsWithBrowser(normalizedCookie).catch(() => null);
      if (browserFallback) {
        const browserTracks = [
          ...extractTrackList(browserFallback.pageState?.initialData),
          ...extractTrackList(browserFallback.pageState?.initialState),
          ...browserFallback.responsePayloads.flatMap((entry) => extractTrackList(entry.payload)),
        ];

        if (browserTracks.length > 0) {
          const seenTrackIds = new Set();
          likedTracks = browserTracks.filter((track) => {
            if (seenTrackIds.has(track.provider_track_id)) {
              return false;
            }

            seenTrackIds.add(track.provider_track_id);
            return true;
          });
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
            const seenTrackIds = new Set();
            likedTracks = playlistTracks.filter((track) => {
              if (!track?.provider_track_id || seenTrackIds.has(track.provider_track_id)) {
                return false;
              }

              seenTrackIds.add(track.provider_track_id);
              return true;
            });
          }
        }
      }
    }

    const createdWithoutLiked = createdPlaylists.filter((item) => item.id !== likedSongsPlaylist?.id);
    const collectedWithoutLiked = collectedPlaylists.filter((item) => item.id !== likedSongsPlaylist?.id);
    const profile = extractProfileSummary(profilePayload ?? likedPagePayload ?? createdPayload ?? collectedPayload ?? {});

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
      created_playlists: createdWithoutLiked.slice(0, 24),
      collected_playlists: collectedWithoutLiked.slice(0, 24),
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

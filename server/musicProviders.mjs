const QQ_MUSIC_ENDPOINT = 'https://u.y.qq.com/cgi-bin/musicu.fcg';

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

function mapQQTrack(song) {
  const providerTrackId = normalizeString(song?.songmid || song?.mid);
  if (!providerTrackId) {
    return null;
  }

  const albumMid = normalizeString(song?.album?.mid || song?.albumMid);
  const title = normalizeString(song?.title || song?.name) || 'Untitled';
  const artist = normalizeSingerNames(song?.singer) || 'Unknown Artist';
  const album = normalizeString(song?.album?.title || song?.album?.name || song?.albumName) || 'Unknown Album';
  const duration = Number(song?.interval || song?.duration || 0);

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

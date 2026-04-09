import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import {
  DATA_DIR,
  DB_PATH,
  FILES_DIR,
  ROOT_DIR,
  hashPassword,
  commentRowToModel,
  db,
  deleteDocumentRecursive,
  documentRowToModel,
  fileRowToModel,
  getMusicPlayerStateByUserId,
  getMusicSourceById,
  getDocumentById,
  getFolderById,
  getFileById,
  getFileType,
  getNextOrderIndex,
  getResourcePermission,
  getShareLinkById,
  getShareLinkByToken,
  getShareLinkRowById,
  getShareLinkRowByToken,
  getTeamById,
  getTeamInvitationById,
  getTeamMembership,
  getUserById,
  listComments,
  listDiscoverableTeams,
  listDocuments,
  listFiles,
  listFolders,
  listMusicSourcesForUser,
  listNotificationsForUser,
  listPendingInvitationsForUser,
  listPublicDocuments,
  listPublicFiles,
  listResourcePermissions,
  listShareLinks,
  listTeamInvitations,
  listTeamJoinRequests,
  listTeamMembers,
  listTeamsForUser,
  listDissolvedTeams,
  listTodos,
  mimeTypeForExtension,
  newId,
  normalizeShareVisibility,
  now,
  publicUser,
  getPendingTeamInvitationByCode,
  getNotificationById,
  searchInvitableUsers,
  sanitizeNullable,
  shareLinkRowToModel,
  todoRowToModel,
  verifyPassword,
  ensureDefaultMusicSource,
  ensureMusicPlayerState,
} from './db.mjs';
import {
  getQQMusicCollectionPlaylistTracks,
  getNeteaseMusicLyric,
  getQQMusicCollections,
  getQQMusicLyric,
  loginNeteaseMusicByPhone,
  normalizeQQQuality,
  resolveNeteaseMusicTrack,
  resolveQQMusicTrack,
  searchNeteaseMusicTracks,
  searchQQMusicTracks,
} from './musicProviders.mjs';
import { json, readJsonBody, readRequestBuffer, sendEmpty, text } from './utils.mjs';

const execFileAsync = promisify(execFile);

const API_PORT = Number(process.env.PORT || process.env.YUQUE_API_PORT || 3001);
const SERVER_HOST = process.env.HOST || process.env.YUQUE_HOST || '0.0.0.0';
const DIST_DIR = path.resolve(process.env.YUQUE_STATIC_DIR || path.join(ROOT_DIR, 'dist'));
const RESOURCE_TYPES = new Set(['document', 'file']);
const DISSOLVED_TEAM_RETENTION_DAYS = 7;
const MAX_MUSIC_QUEUE_LENGTH = 40;
const MAX_MUSIC_SEARCH_RESULTS = 20;
const DEFAULT_TRANSFER_DOCUMENT_FOLDER_NAME = '转存笔记文件夹';
const DEFAULT_TRANSFER_FILE_FOLDER_NAME = '转存文件文件夹';
const QQ_MUSIC_LOGIN_SESSION_TTL_MS = 1000 * 60 * 8;
const QQ_MUSIC_LOGIN_CONFIG = {
  pageUrl: 'https://y.qq.com/',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  viewport: {
    width: 1440,
    height: 980,
  },
  launchTimeoutMs: 30000,
};
const QQ_MUSIC_QQ_LOGIN_POPUP_SIZE = {
  width: 540,
  height: 760,
};
const QQ_MUSIC_QQ_LOGIN_PAGE_URL = 'https://xui.ptlogin2.qq.com/cgi-bin/xlogin?appid=716027609&daid=383&style=33&login_text=%E7%99%BB%E5%BD%95&hide_title_bar=1&hide_border=1&target=self&s_url=https%3A%2F%2Fgraph.qq.com%2Foauth2.0%2Flogin_jump&pt_3rd_aid=100497308&pt_feedback_link=https%3A%2F%2Fsupport.qq.com%2Fproducts%2F77942%3FcustomInfo%3D.appid100497308&theme=2&verify_theme=';
const QQ_MUSIC_LOGIN_DEBUG_DIR = path.join(DATA_DIR, 'debug');
const QQ_MUSIC_LOGIN_PROFILE_ROOT = path.join(DATA_DIR, 'music-login-profiles');
const qqMusicLoginSessions = new Map();
const QQ_MUSIC_AUTH_COOKIE_NAMES = new Set([
  'uin',
  'p_uin',
  'wxuin',
  'skey',
  'p_skey',
  'lskey',
  'luin',
  'ptcz',
  'pt4_token',
  'qm_keyst',
  'qqmusic_key',
]);
const QQ_MUSIC_LOGIN_TRIGGER_SELECTORS = [
  '.top_login__link',
  'a.top_login__link',
  'text=登录',
  'a:has-text("登录")',
  'button:has-text("登录")',
];
const QQ_MUSIC_WECHAT_QR_SELECTORS = [
  'img.js_qrcode_img',
  'img.qrcode',
  '.js_qrcode_img',
  '.web_qrcode_img',
];
const QQ_MUSIC_QQ_QR_SELECTORS = [
  '#qrlogin_img',
  'img#qrlogin_img',
  '.qrlogin_img',
  '.qrlogin_img img',
  '#qr_area img',
  'img[alt*="二维码"]',
];
const QQ_MUSIC_QQ_LOGIN_TAB_SELECTORS = [
  '#switcher_qlogin',
  'text=QQ登录',
  'a:has-text("QQ登录")',
  'button:has-text("QQ登录")',
  'span:has-text("QQ登录")',
];
const QQ_MUSIC_WECHAT_LOGIN_TAB_SELECTORS = [
  'text=微信登录',
  'a:has-text("微信登录")',
  'button:has-text("微信登录")',
  'span:has-text("微信登录")',
];
const QQ_MUSIC_BROWSER_EXECUTABLE_CANDIDATES = [
  process.env.QQ_MUSIC_BROWSER_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

function addDays(isoString, days) {
  const date = new Date(isoString);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

async function launchQQMusicLoginBrowser() {
  const launchErrors = [];

  try {
    return await chromium.launch({
      headless: true,
      timeout: QQ_MUSIC_LOGIN_CONFIG.launchTimeoutMs,
    });
  } catch (error) {
    launchErrors.push(error instanceof Error ? error.message : String(error));
  }

  for (const executablePath of QQ_MUSIC_BROWSER_EXECUTABLE_CANDIDATES) {
    if (!executablePath || !existsSync(executablePath)) {
      continue;
    }

    try {
      return await chromium.launch({
        headless: true,
        executablePath,
        timeout: QQ_MUSIC_LOGIN_CONFIG.launchTimeoutMs,
      });
    } catch (error) {
      launchErrors.push(`${executablePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(
    `未检测到可用浏览器，请先安装 Playwright Chromium，或配置 QQ_MUSIC_BROWSER_PATH。${launchErrors.length ? ` ${launchErrors[0]}` : ''}`,
  );
}

function resolveQQMusicBrowserExecutablePath() {
  for (const executablePath of QQ_MUSIC_BROWSER_EXECUTABLE_CANDIDATES) {
    if (executablePath && existsSync(executablePath)) {
      return executablePath;
    }
  }

  return undefined;
}

async function launchQQMusicLoginContext(options = {}) {
  const {
    headless = true,
    persistentProfileKey = null,
    viewport = QQ_MUSIC_LOGIN_CONFIG.viewport,
    launchArgs = [],
  } = options;
  const executablePath = resolveQQMusicBrowserExecutablePath();

  if (persistentProfileKey) {
    const userDataDir = path.join(QQ_MUSIC_LOGIN_PROFILE_ROOT, persistentProfileKey);
    await mkdir(userDataDir, { recursive: true });

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless,
      executablePath,
      viewport,
      locale: 'zh-CN',
      userAgent: QQ_MUSIC_LOGIN_CONFIG.userAgent,
      timeout: QQ_MUSIC_LOGIN_CONFIG.launchTimeoutMs,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        ...launchArgs,
      ],
    });
    const page = context.pages()[0] ?? await context.newPage();

    return {
      browser: context.browser() ?? null,
      context,
      page,
      isPersistentContext: true,
    };
  }

  const browser = await launchQQMusicLoginBrowser();
  const context = await browser.newContext({
    viewport,
    locale: 'zh-CN',
    userAgent: QQ_MUSIC_LOGIN_CONFIG.userAgent,
  });
  const page = await context.newPage();

  return {
    browser,
    context,
    page,
    isPersistentContext: false,
  };
}

async function bringLatestDesktopBrowserWindowToFront(options = {}) {
  if (process.platform !== 'win32') {
    return;
  }

  const {
    processNames = ['chrome', 'msedge'],
    minStartTimeMs = Date.now() - 60_000,
    titlePatterns = [],
    retries = 12,
    retryDelayMs = 500,
    keepTopMost = false,
  } = options;
  const normalizedProcessNames = [...new Set(processNames.map((name) => String(name || '').trim().toLowerCase()).filter(Boolean))];
  if (normalizedProcessNames.length === 0) {
    return;
  }

  const thresholdIso = new Date(minStartTimeMs).toISOString();
  const processListLiteral = normalizedProcessNames.map((name) => `'${name.replace(/'/g, "''")}'`).join(', ');
  const titlePatternLiteral = titlePatterns
    .map((pattern) => String(pattern || '').trim())
    .filter(Boolean)
    .map((pattern) => `'${pattern.replace(/'/g, "''")}'`)
    .join(', ');
  const keepTopMostLiteral = keepTopMost ? '$true' : '$false';
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class CodexWindowBridge {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
"@
$processNames = @(${processListLiteral})
$titlePatterns = @(${titlePatternLiteral})
$threshold = [DateTime]::Parse("${thresholdIso}")
$keepTopMost = ${keepTopMostLiteral}
$flags = 0x0001 -bor 0x0002 -bor 0x0040
$topMost = [IntPtr]::new(-1)
$notTopMost = [IntPtr]::new(-2)
for ($attempt = 0; $attempt -lt ${retries}; $attempt++) {
  $target = Get-Process | Where-Object {
    $_.MainWindowHandle -ne 0 -and
    $processNames -contains $_.ProcessName.ToLowerInvariant() -and
    $_.StartTime -ge $threshold
  } | Sort-Object StartTime -Descending | Select-Object -First 1

  if (-not $target) {
    Start-Sleep -Milliseconds ${retryDelayMs}
    continue
  }

  if ($titlePatterns.Count -gt 0) {
    $target = Get-Process | Where-Object {
      $_.MainWindowHandle -ne 0 -and
      $processNames -contains $_.ProcessName.ToLowerInvariant() -and
      $_.StartTime -ge $threshold -and
      (
        $titlePatterns | Where-Object {
          ([string]$PSItem.MainWindowTitle).ToLowerInvariant().Contains(([string]$_).ToLowerInvariant())
        }
      ).Count -gt 0
    } | Sort-Object StartTime -Descending | Select-Object -First 1
  }

  if ($target) {
    $handle = [IntPtr]$target.MainWindowHandle
    [void][CodexWindowBridge]::ShowWindowAsync($handle, 9)
    [void][CodexWindowBridge]::SetWindowPos($handle, $topMost, 0, 0, 0, 0, $flags)
    [void][CodexWindowBridge]::SetForegroundWindow($handle)
    if (-not $keepTopMost) {
      Start-Sleep -Milliseconds 1200
      [void][CodexWindowBridge]::SetWindowPos($handle, $notTopMost, 0, 0, 0, 0, $flags)
    }
    break
  }

  Start-Sleep -Milliseconds ${retryDelayMs}
}
`;

  try {
    await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
    });
  } catch {
    // Ignore focus failures. QQ login remains usable without OS-level focus.
  }
}

function getQQMusicWechatFrame(page) {
  return page.frames().find((frame) => frame.url().includes('open.weixin.qq.com/connect/qrconnect')) ?? null;
}

function getQQMusicQqFrame(page) {
  return page.frames().find((frame) => /ptlogin2\.qq\.com|xui\.ptlogin2\.qq\.com|graph\.qq\.com/i.test(frame.url())) ?? null;
}

function getQQMusicGraphFrame(page) {
  return page.frames().find((frame) => /graph\.qq\.com\/oauth2\.0\/show/i.test(frame.url())) ?? null;
}

async function findVisibleLocatorAcrossScopes(page, selectors, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline && !page.isClosed()) {
    const scopes = [page, ...page.frames()];

    for (const scope of scopes) {
      for (const selector of selectors) {
        try {
          const locator = scope.locator(selector).first();
          if (await locator.count() > 0 && await locator.isVisible()) {
            return locator;
          }
        } catch {
          // Ignore locator errors while the page is still rendering.
        }
      }
    }

    await page.waitForTimeout(250);
  }

  return null;
}

async function waitForQQMusicWechatFrame(page, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline && !page.isClosed()) {
    const frame = getQQMusicWechatFrame(page);
    if (frame) {
      return frame;
    }

    await page.waitForTimeout(250);
  }

  return null;
}

async function captureQQMusicWechatQrImageData(page, frame) {
  const activeFrame = frame ?? getQQMusicWechatFrame(page);
  if (!activeFrame) {
    return null;
  }

  for (const selector of QQ_MUSIC_WECHAT_QR_SELECTORS) {
    try {
      const locator = activeFrame.locator(selector).first();
      if (await locator.count() > 0) {
        await locator.evaluate(async (element) => {
          if (!(element instanceof HTMLImageElement)) {
            return;
          }

          if (element.complete && element.naturalWidth > 0) {
            return;
          }

          await new Promise((resolve) => {
            const done = () => resolve(null);
            element.addEventListener('load', done, { once: true });
            element.addEventListener('error', done, { once: true });
            setTimeout(done, 5000);
          });
        });

        const src = await locator.getAttribute('src');
        if (src) {
          try {
            const qrUrl = new URL(src, activeFrame.url()).toString();
            const response = await fetch(qrUrl, {
              headers: {
                'User-Agent': QQ_MUSIC_LOGIN_CONFIG.userAgent,
                Referer: activeFrame.url(),
              },
            });
            if (response.ok) {
              const buffer = Buffer.from(await response.arrayBuffer());
              if (buffer.length > 0) {
                return `data:${response.headers.get('content-type') || 'image/png'};base64,${buffer.toString('base64')}`;
              }
            }
          } catch {
            // Fall back to element screenshot if direct fetch fails.
          }
        }

        const box = await locator.boundingBox();
        if (!box || box.width < 40 || box.height < 40) {
          continue;
        }

        const buffer = await locator.screenshot({ type: 'png' });
        return `data:image/png;base64,${buffer.toString('base64')}`;
      }
    } catch {
      // Ignore screenshot errors and continue with fallback selectors.
    }
  }

  return null;
}

async function captureVisibleQrLocatorData(locator) {
  try {
    await locator.evaluate(async (element) => {
      if (!(element instanceof HTMLImageElement)) {
        return;
      }

      if (element.complete && element.naturalWidth > 0) {
        return;
      }

      await new Promise((resolve) => {
        const done = () => resolve(null);
        element.addEventListener('load', done, { once: true });
        element.addEventListener('error', done, { once: true });
        setTimeout(done, 5000);
      });
    });
  } catch {
    // Ignore preload failures and fall back to screenshot.
  }

  try {
    const src = await locator.getAttribute('src');
    if (src) {
      const page = locator.page();
      const baseUrl = page?.url?.() || QQ_MUSIC_LOGIN_CONFIG.pageUrl;
      const qrUrl = new URL(src, baseUrl).toString();
      const response = await fetch(qrUrl, {
        headers: {
          'User-Agent': QQ_MUSIC_LOGIN_CONFIG.userAgent,
          Referer: baseUrl,
        },
      });
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > 0) {
          return `data:${response.headers.get('content-type') || 'image/png'};base64,${buffer.toString('base64')}`;
        }
      }
    }
  } catch {
    // Fall back to locator screenshot below.
  }

  const box = await locator.boundingBox().catch(() => null);
  if (!box || box.width < 40 || box.height < 40) {
    return null;
  }

  const buffer = await locator.screenshot({ type: 'png' }).catch(() => null);
  return buffer ? `data:image/png;base64,${buffer.toString('base64')}` : null;
}

async function switchQQMusicLoginMode(page, loginMode) {
  const selectors = loginMode === 'qq' ? QQ_MUSIC_QQ_LOGIN_TAB_SELECTORS : QQ_MUSIC_WECHAT_LOGIN_TAB_SELECTORS;
  const trigger = await findVisibleLocatorAcrossScopes(page, selectors, 5000);
  if (!trigger) {
    return false;
  }

  try {
    await trigger.click();
    await page.waitForTimeout(1000);
    return true;
  } catch {
    return false;
  }
}

async function finalizeQQMusicOauthConsent(page) {
  const graphFrame = getQQMusicGraphFrame(page);
  const directSelectors = [
    '#authorizeButton',
    '#allow',
    '#login_button',
    '#btnAuthorize',
    '#btn_allow',
    'input[name="authorize"]',
    'input[type="submit"]',
    'button[type="submit"]',
    '.btn_allow',
    '.authorize_btn',
    '.btn.btn-primary',
    '.btn.btn_ok',
  ];

  if (graphFrame) {
    for (const selector of directSelectors) {
      try {
        const locator = graphFrame.locator(selector).first();
        if (await locator.count() > 0 && await locator.isVisible()) {
          await locator.click();
          await page.waitForTimeout(1200);
          return true;
        }
      } catch {
        // Try the next selector.
      }
    }

    try {
      const buttons = graphFrame.locator('button, input[type="submit"], a[role="button"]');
      const count = await buttons.count();
      for (let index = 0; index < count; index += 1) {
        const locator = buttons.nth(index);
        if (await locator.isVisible().catch(() => false)) {
          await locator.click().catch(() => null);
          await page.waitForTimeout(1200);
          return true;
        }
      }
    } catch {
      // Fall back to generic text-based selectors below.
    }

    try {
      const submitted = await graphFrame.evaluate(() => {
        const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]'));
        for (const input of checkboxes) {
          if (input instanceof HTMLInputElement && !input.checked && !input.disabled) {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }

        const directCandidates = Array.from(document.querySelectorAll([
          '#authorizeButton',
          '#allow',
          '#login_button',
          '#btnAuthorize',
          '#btn_allow',
          'input[name="authorize"]',
          'input[type="submit"]',
          'button[type="submit"]',
          '.btn_allow',
          '.authorize_btn',
          '.btn.btn-primary',
          '.btn.btn_ok',
          '[data-action*="authorize"]',
          '[class*="authorize"]',
          '[id*="authorize"]',
          '[class*="allow"]',
          '[id*="allow"]',
        ].join(',')));

        for (const element of directCandidates) {
          if (!(element instanceof HTMLElement) || element.hasAttribute('disabled')) {
            continue;
          }
          element.click();
          return true;
        }

        const forms = Array.from(document.forms);
        for (const form of forms) {
          try {
            if (typeof form.requestSubmit === 'function') {
              form.requestSubmit();
            } else {
              form.submit();
            }
            return true;
          } catch {
            // Try the next form.
          }
        }

        return false;
      });

      if (submitted) {
        await page.waitForTimeout(1500);
        return true;
      }
    } catch {
      // Fall back to generic text-based selectors below.
    }
  }

  const consentSelectors = [
    'button:has-text("授权并登录")',
    'a:has-text("授权并登录")',
    'button:has-text("同意")',
    'a:has-text("同意")',
    'button:has-text("确认授权")',
    'a:has-text("确认授权")',
    'button:has-text("登录")',
    'a:has-text("登录")',
    'button:has-text("确定")',
    'a:has-text("确定")',
  ];

  const trigger = await findVisibleLocatorAcrossScopes(page, consentSelectors, 1500);
  if (!trigger) {
    return false;
  }

  try {
    await trigger.click();
    await page.waitForTimeout(1200);
    return true;
  } catch {
    return false;
  }
}

async function finalizeQQMusicQuickLogin(page) {
  const qqFrame = getQQMusicQqFrame(page);
  if (!qqFrame) {
    return false;
  }

  const quickLoginSelectors = [
    '#qlogin_list a',
    '#qlogin_list .face',
    '#qlogin_list .uin',
    '#qlogin_list .nick',
    '.face',
    '.uin',
    '.nick',
    '[data-uin]',
    'a[title]',
  ];

  for (const selector of quickLoginSelectors) {
    try {
      const locator = qqFrame.locator(selector).first();
      if (await locator.count() > 0 && await locator.isVisible().catch(() => false)) {
        await locator.click().catch(() => null);
        await page.waitForTimeout(1200);
        return true;
      }
    } catch {
      // Try next selector.
    }
  }

  try {
    const clicked = await qqFrame.evaluate(() => {
      const selectors = ['#qlogin_list a', '#qlogin_list .face', '#qlogin_list .uin', '#qlogin_list .nick', '.face', '.uin', '.nick', '[data-uin]'];
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element instanceof HTMLElement) {
          element.click();
          return true;
        }
      }

      const textCandidates = Array.from(document.querySelectorAll('a, div, span, button'));
      for (const element of textCandidates) {
        if (!(element instanceof HTMLElement)) {
          continue;
        }
        const text = (element.innerText || '').trim();
        if (text && !/密码登录|注册账号|意见反馈/.test(text)) {
          element.click();
          return true;
        }
      }

      return false;
    });

    if (clicked) {
      await page.waitForTimeout(1200);
      return true;
    }
  } catch {
    // Ignore quick-login click failure.
  }

  return false;
}

async function captureQQMusicQqQrImageData(page) {
  const locator = await findVisibleLocatorAcrossScopes(page, QQ_MUSIC_QQ_QR_SELECTORS, 12000);
  if (!locator) {
    return null;
  }

  return captureVisibleQrLocatorData(locator);
}

async function isWechatFrameStateVisible(frame, selectors) {
  if (!frame) {
    return false;
  }

  for (const selector of selectors) {
    try {
      const locator = frame.locator(selector).first();
      if (await locator.count() > 0 && await locator.isVisible()) {
        return true;
      }
    } catch {
      // Ignore transient frame state errors.
    }
  }

  return false;
}

function serializeBrowserCookies(cookies) {
  return cookies
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

function getQQMusicContextCookies(context) {
  return context.cookies().then((cookies) => cookies.filter((cookie) => {
    const domain = String(cookie.domain || '').replace(/^\./, '').toLowerCase();
    return domain.endsWith('qq.com') || domain.endsWith('y.qq.com');
  }));
}

async function getQQMusicAuthorizedCookieString(context, options = {}) {
  const {
    allowPartial = false,
  } = options;
  const relevantCookies = await getQQMusicContextCookies(context);

  const names = new Set(relevantCookies.map((cookie) => cookie.name));
  const hasAuthCookie = relevantCookies.some((cookie) => QQ_MUSIC_AUTH_COOKIE_NAMES.has(cookie.name));
  const hasPlayableCookie = names.has('qqmusic_key') || names.has('qm_keyst');
  const hasAccountCookie = names.has('uin') || names.has('p_uin') || names.has('wxuin') || names.has('luin');

  if (!hasAuthCookie) {
    return '';
  }

  if (!allowPartial && !hasPlayableCookie && !hasAccountCookie) {
    return '';
  }

  if (!allowPartial && !hasPlayableCookie && hasAccountCookie) {
    return '';
  }

  return serializeBrowserCookies(relevantCookies);
}

async function hydrateQQMusicLoginState(session) {
  if (!session?.page || session.page.isClosed()) {
    return '';
  }

  try {
    await session.page.goto(QQ_MUSIC_LOGIN_CONFIG.pageUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });
    await session.page.waitForTimeout(1200);
  } catch {
    // Ignore navigation failures and fall back to current cookie state.
  }

  return getQQMusicAuthorizedCookieString(session.context, { allowPartial: true });
}

async function writeQQMusicLoginDebugSnapshot(name, payload) {
  try {
    await mkdir(QQ_MUSIC_LOGIN_DEBUG_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const serialized = JSON.stringify(payload, null, 2);
    await writeFile(path.join(QQ_MUSIC_LOGIN_DEBUG_DIR, `${name}-${timestamp}.json`), serialized, 'utf8');
    await writeFile(path.join(QQ_MUSIC_LOGIN_DEBUG_DIR, `${name}-latest.json`), serialized, 'utf8');
  } catch {
    // Ignore debug snapshot failures.
  }
}

async function collectQQMusicLoginDebugState(session, extra = {}) {
  if (!session?.context || !session?.page || session.page.isClosed()) {
    return {
      login_mode: session?.login_mode ?? null,
      page_closed: true,
      ...extra,
    };
  }

  const cookies = await getQQMusicContextCookies(session.context).catch(() => []);
  const pageText = await session.page.locator('body').innerText().catch(() => '');
  const frameSummaries = await Promise.all(
    session.page.frames().map(async (frame) => {
      const buttons = [];
      try {
        const buttonLocators = frame.locator('button, input[type="submit"], a[role="button"], a, input[type="button"]');
        const count = Math.min(await buttonLocators.count(), 12);
        for (let index = 0; index < count; index += 1) {
          const locator = buttonLocators.nth(index);
          const text = await locator.innerText().catch(async () => locator.getAttribute('value').catch(() => ''));
          const visible = await locator.isVisible().catch(() => false);
          if (text || visible) {
            buttons.push({
              text: String(text || '').trim().slice(0, 120),
              visible,
            });
          }
        }
      } catch {
        // Ignore button introspection failures.
      }

      return {
        url: frame.url(),
        text: (await frame.locator('body').innerText().catch(() => '')).slice(0, 500),
        buttons,
      };
    }),
  ).catch(() => []);

  return {
    login_mode: session.login_mode,
    status: session.status,
    page_url: session.page.url(),
    cookie_names: cookies.map((cookie) => cookie.name),
    cookie_count: cookies.length,
    page_text: String(pageText || '').slice(0, 1000),
    frames: frameSummaries,
    ...extra,
  };
}

async function closeQQMusicLoginSessionResources(session) {
  if (!session) {
    return;
  }

  const context = session.context ?? null;
  const browser = session.browser ?? null;
  session.browser = null;
  session.context = null;
  session.page = null;

  if (context) {
    try {
      await context.close();
    } catch {
      // Ignore context cleanup failures.
    }
  }

  if (browser) {
    try {
      await browser.close();
    } catch {
      // Ignore browser cleanup failures.
    }
  }
}

function cleanupQQMusicLoginSessions() {
  const nowValue = Date.now();

  qqMusicLoginSessions.forEach((session, sessionId) => {
    const createdAtValue = new Date(session.created_at).getTime();
    if (!Number.isFinite(createdAtValue) || nowValue - createdAtValue > QQ_MUSIC_LOGIN_SESSION_TTL_MS) {
      session.status = 'expired';
      session.message = '二维码已过期，请重新获取。';
      session.updated_at = now();
      void closeQQMusicLoginSessionResources(session);
      qqMusicLoginSessions.delete(sessionId);
    }
  });
}

function serializeQQMusicLoginSession(session) {
  if (!session) {
    return null;
  }

  return {
    id: session.id,
    provider: 'qq_music',
    login_mode: session.login_mode === 'qq' ? 'qq' : 'wechat',
    status: session.status,
    qr_image_data_url: session.qr_image_data_url ?? null,
    cookie: session.cookie ?? null,
    message: session.message ?? null,
    created_at: session.created_at,
    updated_at: session.updated_at,
  };
}

function getQQMusicLoginSessionForUser(sessionId, userId) {
  cleanupQQMusicLoginSessions();
  const session = qqMusicLoginSessions.get(sessionId) ?? null;
  if (!session || session.user_id !== userId) {
    return null;
  }

  if (Date.now() - new Date(session.created_at).getTime() > QQ_MUSIC_LOGIN_SESSION_TTL_MS) {
    session.status = 'expired';
    session.message = '二维码已过期，请重新获取。';
    session.updated_at = now();
  }

  return session;
}

async function followQQMusicLoginRedirects(startUrl, cookieJar) {
  let nextUrl = startUrl;

  for (let index = 0; index < 8 && nextUrl; index += 1) {
    const result = await requestQQMusicLogin(nextUrl, {
      cookieJar,
      responseType: 'text',
    });
    const location = result.location
      ? new URL(result.location, nextUrl).toString()
      : null;

    if (location && result.status >= 300 && result.status < 400) {
      nextUrl = location;
      continue;
    }

    return result;
  }

  return null;
}

async function createQQMusicWechatLoginSession(userId) {
  cleanupQQMusicLoginSessions();

  const { browser, context, page, isPersistentContext } = await launchQQMusicLoginContext({
    headless: true,
  });

  try {
    await page.goto(QQ_MUSIC_LOGIN_CONFIG.pageUrl, {
      waitUntil: 'networkidle',
      timeout: QQ_MUSIC_LOGIN_CONFIG.launchTimeoutMs,
    });

    const loginTrigger = await findVisibleLocatorAcrossScopes(page, QQ_MUSIC_LOGIN_TRIGGER_SELECTORS, 15000);
    if (!loginTrigger) {
      throw new Error('未找到 QQ音乐 登录入口。');
    }

    await loginTrigger.click();
    const wechatFrame = await waitForQQMusicWechatFrame(page, 20000);
    if (!wechatFrame) {
      throw new Error('未找到微信登录二维码。');
    }

    const qrImageDataUrl = await captureQQMusicWechatQrImageData(page, wechatFrame);
    if (!qrImageDataUrl) {
      throw new Error('未能捕获微信登录二维码。');
    }

    const timestamp = now();
    const session = {
      id: newId(),
      user_id: userId,
      login_mode: 'wechat',
      status: 'pending',
      message: '请使用微信扫码登录。',
      cookie: null,
      qr_image_data_url: qrImageDataUrl,
      created_at: timestamp,
      updated_at: timestamp,
      browser,
      context,
      page,
      is_persistent_context: isPersistentContext,
    };

    qqMusicLoginSessions.set(session.id, session);
    return session;
  } catch (error) {
    await closeQQMusicLoginSessionResources({ browser, context, page });
    throw error;
  }
}

async function createQQMusicQqLoginSession(userId) {
  cleanupQQMusicLoginSessions();
  const popupLaunchStartedAt = Date.now();

  const { browser, context, page, isPersistentContext } = await launchQQMusicLoginContext({
    headless: false,
    persistentProfileKey: `qq-music-qq-${userId}`,
    viewport: QQ_MUSIC_QQ_LOGIN_POPUP_SIZE,
    launchArgs: [`--window-size=${QQ_MUSIC_QQ_LOGIN_POPUP_SIZE.width},${QQ_MUSIC_QQ_LOGIN_POPUP_SIZE.height}`],
  });

  try {
    await page.goto(QQ_MUSIC_QQ_LOGIN_PAGE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: QQ_MUSIC_LOGIN_CONFIG.launchTimeoutMs,
    });
    await page.waitForTimeout(1200);
    await bringLatestDesktopBrowserWindowToFront({
      minStartTimeMs: popupLaunchStartedAt,
      titlePatterns: ['qq', '登录', 'ptlogin', 'graph.qq.com'],
      retries: 20,
      retryDelayMs: 400,
      keepTopMost: true,
    });
    const qrImageDataUrl = await captureQQMusicQqQrImageData(page);
    if (!qrImageDataUrl) {
      throw new Error('未能捕获 QQ 扫码登录二维码。');
    }

    const timestamp = now();
    const session = {
      id: newId(),
      user_id: userId,
      login_mode: 'qq',
      status: 'pending',
      message: '请使用 QQ 扫码登录。',
      cookie: null,
      qr_image_data_url: qrImageDataUrl,
      created_at: timestamp,
      updated_at: timestamp,
      browser,
      context,
      page,
      is_persistent_context: isPersistentContext,
    };

    qqMusicLoginSessions.set(session.id, session);
    return session;
  } catch (error) {
    await closeQQMusicLoginSessionResources({ browser, context, page });
    throw error;
  }
}

async function refreshQQMusicWechatLoginSession(session) {
  if (!session) {
    throw new Error('登录会话不存在。');
  }

  if (session.status === 'authorized' || session.status === 'failed' || session.status === 'expired') {
    return session;
  }

  if (Date.now() - new Date(session.created_at).getTime() > QQ_MUSIC_LOGIN_SESSION_TTL_MS) {
    session.status = 'expired';
    session.message = '二维码已过期，请重新获取。';
    session.updated_at = now();
    await closeQQMusicLoginSessionResources(session);
    return session;
  }

  if (!session.page || session.page.isClosed()) {
    session.status = 'failed';
    session.message = '登录窗口已关闭，请重新获取二维码。';
    session.updated_at = now();
    await closeQQMusicLoginSessionResources(session);
    return session;
  }

  const authorizedCookie = await getQQMusicAuthorizedCookieString(session.context);
  if (authorizedCookie) {
    session.status = 'authorized';
    session.cookie = authorizedCookie;
    session.message = '微信登录成功，可直接保存。';
    session.updated_at = now();
    await closeQQMusicLoginSessionResources(session);
    return session;
  }

  const wechatFrame = getQQMusicWechatFrame(session.page);
  if (!wechatFrame) {
    const hydratedCookie = await hydrateQQMusicLoginState(session);
    if (hydratedCookie) {
      session.status = 'authorized';
      session.cookie = hydratedCookie;
      session.message = '微信登录成功，可直接保存。';
      session.updated_at = now();
      await closeQQMusicLoginSessionResources(session);
      return session;
    }

    session.status = 'pending';
    session.message = '正在等待登录状态回跳。';
    session.updated_at = now();
    return session;
  }

  if (await isWechatFrameStateVisible(wechatFrame, ['#wx_after_scan', '.js_wx_after_scan'])) {
    session.status = 'scanned';
    session.message = '已扫码，请在微信中点击允许。';
    session.updated_at = now();
    return session;
  }

  if (await isWechatFrameStateVisible(wechatFrame, ['#wx_after_cancel', '.js_wx_after_cancel'])) {
    session.status = 'failed';
    session.message = '你已取消此次微信登录，请重新获取二维码。';
    session.updated_at = now();
    await closeQQMusicLoginSessionResources(session);
    return session;
  }

  if (await isWechatFrameStateVisible(wechatFrame, ['.js_web_qrcode_reload', '.js_refresh_qrcode'])) {
    session.status = 'expired';
    session.message = '二维码已失效，请重新获取。';
    session.updated_at = now();
    await closeQQMusicLoginSessionResources(session);
    return session;
  }

  if (!session.qr_image_data_url) {
    session.qr_image_data_url = await captureQQMusicWechatQrImageData(session.page, wechatFrame);
  }

  session.status = 'pending';
  session.message = '等待微信扫码。';
  session.updated_at = now();
  return session;
}

async function refreshQQMusicQqLoginSession(session) {
  if (!session) {
    throw new Error('登录会话不存在。');
  }

  if (session.status === 'authorized' || session.status === 'failed' || session.status === 'expired') {
    return session;
  }

  if (Date.now() - new Date(session.created_at).getTime() > QQ_MUSIC_LOGIN_SESSION_TTL_MS) {
    session.status = 'expired';
    session.message = '二维码已过期，请重新获取。';
    session.updated_at = now();
    await closeQQMusicLoginSessionResources(session);
    return session;
  }

  if (!session.page || session.page.isClosed()) {
    session.status = 'failed';
    session.message = '登录窗口已关闭，请重新获取二维码。';
    session.updated_at = now();
    await closeQQMusicLoginSessionResources(session);
    return session;
  }

  await finalizeQQMusicQuickLogin(session.page);
  await finalizeQQMusicOauthConsent(session.page);

  const authorizedCookie = await getQQMusicAuthorizedCookieString(session.context, { allowPartial: true });
  if (authorizedCookie) {
    session.status = 'authorized';
    session.cookie = authorizedCookie;
    session.message = 'QQ 扫码登录成功，可直接保存。';
    session.updated_at = now();
    await closeQQMusicLoginSessionResources(session);
    return session;
  }

  const qqFrame = getQQMusicQqFrame(session.page);
  const scannedSelectors = [
    'text=请在QQ中确认登录',
    'text=扫码成功',
    'text=请在手机上确认',
    'text=请在手机上点击确认',
    'text=请在QQ手机版上确认',
  ];
  const expiredSelectors = ['text=二维码已失效', 'text=点击刷新', 'text=刷新二维码'];
  const successSelectors = ['text=登录成功', 'text=欢迎登录', 'text=正在登录', 'text=返回QQ音乐'];
  const scannedAtValue = Number(session.scanned_at_value || 0);
  const shouldHydrateAfterScan = scannedAtValue > 0 && Date.now() - scannedAtValue >= 1500;

  if (qqFrame && await isWechatFrameStateVisible(qqFrame, scannedSelectors)) {
    if (!scannedAtValue) {
      session.scanned_at_value = Date.now();
    }

    if (shouldHydrateAfterScan) {
      await finalizeQQMusicOauthConsent(session.page);
      const hydratedCookie = await hydrateQQMusicLoginState(session);
      if (hydratedCookie) {
        session.status = 'authorized';
        session.cookie = hydratedCookie;
        session.message = 'QQ 扫码登录成功，可直接保存。';
        session.updated_at = now();
        await closeQQMusicLoginSessionResources(session);
        return session;
      }
    }

    session.status = 'scanned';
    session.message = '已扫码，请在 QQ 中确认登录。';
    session.updated_at = now();
    await writeQQMusicLoginDebugSnapshot('qq-music-qq-login', await collectQQMusicLoginDebugState(session, {
      phase: 'scanned_waiting_confirm',
      scanned_at_value: session.scanned_at_value,
    }));
    return session;
  }

  if (qqFrame && await isWechatFrameStateVisible(qqFrame, expiredSelectors)) {
    session.status = 'expired';
    session.message = '二维码已失效，请重新获取。';
    session.updated_at = now();
    await closeQQMusicLoginSessionResources(session);
    return session;
  }

  if (qqFrame && await isWechatFrameStateVisible(qqFrame, successSelectors)) {
    await finalizeQQMusicOauthConsent(session.page);
    const hydratedCookie = await hydrateQQMusicLoginState(session);
    if (hydratedCookie) {
      session.status = 'authorized';
      session.cookie = hydratedCookie;
      session.message = 'QQ 扫码登录成功，可直接保存。';
      session.updated_at = now();
      await closeQQMusicLoginSessionResources(session);
      return session;
    }
  }

  if (!session.qr_image_data_url) {
    session.qr_image_data_url = await captureQQMusicQqQrImageData(session.page);
  }

  if (!qqFrame) {
    await finalizeQQMusicOauthConsent(session.page);
    const hydratedCookie = await hydrateQQMusicLoginState(session);
    if (hydratedCookie) {
      session.status = 'authorized';
      session.cookie = hydratedCookie;
      session.message = 'QQ 扫码登录成功，可直接保存。';
      session.updated_at = now();
      await closeQQMusicLoginSessionResources(session);
      return session;
    }
  }

  if (session.status === 'scanned' && shouldHydrateAfterScan) {
    await finalizeQQMusicOauthConsent(session.page);
    const hydratedCookie = await hydrateQQMusicLoginState(session);
    if (hydratedCookie) {
      session.status = 'authorized';
      session.cookie = hydratedCookie;
      session.message = 'QQ 扫码登录成功，可直接保存。';
      session.updated_at = now();
      await closeQQMusicLoginSessionResources(session);
      return session;
    }
  }

  await writeQQMusicLoginDebugSnapshot('qq-music-qq-login', await collectQQMusicLoginDebugState(session, {
    phase: qqFrame ? 'pending_with_frame' : 'pending_without_frame',
    scanned_at_value: session.scanned_at_value ?? null,
  }));

  session.status = 'pending';
  session.message = '等待 QQ 扫码。';
  session.updated_at = now();
  return session;
}

function getCurrentUserId(req) {
  const raw = req.headers['x-user-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return sanitizeNullable(value);
}

function getCurrentUser(req) {
  const userId = getCurrentUserId(req);
  return userId ? getUserById(userId) : null;
}

function requireAuth(req, res) {
  const user = getCurrentUser(req);
  if (!user) {
    json(res, 401, { error: 'Please log in first.' });
    return null;
  }
  return user;
}

function isApprovedTeamMember(userId, teamId) {
  if (!userId || !teamId) return false;
  const team = getTeamById(teamId, { includeDissolved: true });
  if (!team || team.status !== 'active') {
    return false;
  }
  const membership = getTeamMembership(teamId, userId);
  return membership?.status === 'approved';
}

function isTeamOwner(userId, teamId) {
  if (!userId || !teamId) return false;
  const team = getTeamById(teamId, { includeDissolved: true });
  return Boolean(team && team.status === 'active' && team.owner_user_id === userId);
}

function isTeamOwnerIncludingDissolved(userId, teamId) {
  if (!userId || !teamId) return false;
  const team = getTeamById(teamId, { includeDissolved: true });
  return Boolean(team && team.owner_user_id === userId);
}

function serializeTeamForUser(team, userId) {
  if (!team) return null;

  const isOwner = Boolean(userId && team.owner_user_id === userId);
  const membership = userId ? getTeamMembership(team.id, userId) : null;

  return {
    ...team,
    is_owner: isOwner,
    membership_status: isOwner ? 'approved' : membership?.status ?? team.membership_status ?? null,
  };
}

function hasAvailableTeamSeat(teamId) {
  const team = getTeamById(teamId);
  const approvedCountRow = db
    .prepare("SELECT COUNT(*) AS count FROM team_members WHERE team_id = ? AND status = 'approved'")
    .get(teamId);
  const approvedCount = Number(approvedCountRow?.count ?? 0);
  const memberLimit = Number(team?.member_limit ?? 10);

  return approvedCount < memberLimit;
}

function generateInviteCode() {
  return randomBytes(4).toString('hex').toUpperCase();
}

function createUserNotification({
  userId,
  teamId = null,
  actorUserId = null,
  type,
  title,
  content,
  actionUrl = null,
}) {
  const timestamp = now();
  const id = newId();

  db.prepare(`
    INSERT INTO user_notifications (
      id, user_id, team_id, actor_user_id, type, title, content, action_url, is_read, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(id, userId, teamId, actorUserId, type, title, content, actionUrl, timestamp, timestamp);

  return getNotificationById(id);
}

function broadcastTeamNotification(teamId, payload, excludeUserIds = []) {
  const seen = new Set(excludeUserIds);
  const members = listTeamMembers(teamId);

  members.forEach((member) => {
    if (seen.has(member.user_id)) {
      return;
    }

    seen.add(member.user_id);
    createUserNotification({
      ...payload,
      userId: member.user_id,
      teamId,
    });
  });
}

function isExpiredRetention(value) {
  if (!value) {
    return false;
  }

  return new Date(value).getTime() < Date.now();
}

function canAccessDissolvedTeamRecycle(userId, teamId) {
  if (!userId || !teamId) {
    return false;
  }

  const team = getTeamById(teamId, { includeDissolved: true });
  if (!team || team.status !== 'dissolved' || isExpiredRetention(team.retention_until)) {
    return false;
  }

  if (team.owner_user_id === userId) {
    return true;
  }

  // 只要是原团队成员（无论当前状态）都可以访问回收站
  const membership = getTeamMembership(teamId, userId);
  return !!membership;
}

function approveMembership(teamId, userId) {
  const timestamp = now();
  const existingMembership = getTeamMembership(teamId, userId);

  if (existingMembership) {
    db.prepare('UPDATE team_members SET status = ?, updated_at = ? WHERE id = ?').run('approved', timestamp, existingMembership.id);
    return;
  }

  db.prepare(`
    INSERT INTO team_members (id, team_id, user_id, status, created_at, updated_at)
    VALUES (?, ?, ?, 'approved', ?, ?)
  `).run(newId(), teamId, userId, timestamp, timestamp);
}

function canViewDocument(userId, document) {
  if (!document) return false;
  if (document.user_id === userId) return true;
  const teamId = sanitizeNullable(document.team_id);
  if (!teamId || !userId || !isApprovedTeamMember(userId, teamId)) return false;
  return Boolean(getResourcePermission(teamId, 'document', document.id, userId)?.can_view);
}

function canEditDocument(userId, document) {
  if (!document) return false;
  if (document.user_id === userId) return true;
  const teamId = sanitizeNullable(document.team_id);
  if (!teamId || !userId || !isApprovedTeamMember(userId, teamId)) return false;
  return Boolean(getResourcePermission(teamId, 'document', document.id, userId)?.can_edit);
}

function canDeleteDocument(userId, document) {
  if (!document) return false;
  if (document.user_id === userId) return true;
  const teamId = sanitizeNullable(document.team_id);
  if (!teamId || !userId || !isApprovedTeamMember(userId, teamId)) return false;
  return Boolean(getResourcePermission(teamId, 'document', document.id, userId)?.can_delete);
}

function canViewFile(userId, file) {
  if (!file) return false;
  if (file.user_id === userId) return true;
  const teamId = sanitizeNullable(file.team_id);
  if (!teamId || !userId || !isApprovedTeamMember(userId, teamId)) return false;
  return Boolean(getResourcePermission(teamId, 'file', file.id, userId)?.can_view);
}

function canEditFile(userId, file) {
  if (!file) return false;
  if (file.user_id === userId) return true;
  const teamId = sanitizeNullable(file.team_id);
  if (!teamId || !userId || !isApprovedTeamMember(userId, teamId)) return false;
  return Boolean(getResourcePermission(teamId, 'file', file.id, userId)?.can_edit);
}

function canDeleteFile(userId, file) {
  if (!file) return false;
  if (file.user_id === userId) return true;
  const teamId = sanitizeNullable(file.team_id);
  if (!teamId || !userId || !isApprovedTeamMember(userId, teamId)) return false;
  return Boolean(getResourcePermission(teamId, 'file', file.id, userId)?.can_delete);
}

function canAccessFolder(userId, folder) {
  if (!folder || !userId) return false;
  const teamId = sanitizeNullable(folder.team_id);
  if (!teamId) {
    return folder.user_id === userId;
  }
  return isApprovedTeamMember(userId, teamId);
}

function canManageFolder(userId, folder) {
  if (!folder || !userId) return false;
  const teamId = sanitizeNullable(folder.team_id);
  if (!teamId) {
    return folder.user_id === userId;
  }
  return isTeamOwner(userId, teamId);
}

function collectDescendantFolderIds(rootFolderId) {
  const rows = listFolders();
  const childrenByParentId = new Map();

  rows.forEach((folder) => {
    const parentId = sanitizeNullable(folder.parent_id);
    if (!parentId) {
      return;
    }

    const siblings = childrenByParentId.get(parentId) ?? [];
    siblings.push(folder.id);
    childrenByParentId.set(parentId, siblings);
  });

  const ids = [];
  const stack = [rootFolderId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || ids.includes(currentId)) {
      continue;
    }

    ids.push(currentId);
    const childIds = childrenByParentId.get(currentId) ?? [];
    childIds.forEach((childId) => stack.push(childId));
  }

  return ids;
}

function listFilesInFolders(folderIds) {
  if (!Array.isArray(folderIds) || folderIds.length === 0) {
    return [];
  }

  const placeholders = folderIds.map(() => '?').join(', ');
  return db.prepare(`SELECT * FROM files WHERE folder_id IN (${placeholders}) ORDER BY created_at DESC`).all(...folderIds);
}

async function deleteFileRecords(files) {
  for (const file of files) {
    const fullPath = path.join(FILES_DIR, ...String(file.storage_path).split('/'));
    if (existsSync(fullPath)) {
      await unlink(fullPath).catch(() => undefined);
    }
  }

  files.forEach((file) => {
    db.prepare('DELETE FROM share_links WHERE file_id = ?').run(file.id);
    db.prepare("DELETE FROM resource_permissions WHERE resource_type = 'file' AND resource_id = ?").run(file.id);
    db.prepare('DELETE FROM files WHERE id = ?').run(file.id);
  });
}

function normalizeRequestedTeamId(rawValue) {
  if (rawValue === '__personal__') {
    return null;
  }
  return sanitizeNullable(rawValue);
}

function buildWorkspaceStorageScope(teamId) {
  if (!teamId) {
    return 'personal';
  }
  return `team-${String(teamId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function ensureTeamOwner(res, userId, teamId) {
  if (!teamId || !isTeamOwner(userId, teamId)) {
    json(res, 403, { error: 'Only the team owner can manage this team.' });
    return false;
  }
  return true;
}

function ensurePersonalDocumentFolder(userId, preferredParentId = null) {
  const existing = db.prepare(`
    SELECT *
    FROM documents
    WHERE user_id = ?
      AND team_id IS NULL
      AND parent_id IS ?
      AND icon = 'folder'
      AND is_deleted = 0
      AND title = ?
    ORDER BY created_at ASC
    LIMIT 1
  `).get(userId, preferredParentId, DEFAULT_TRANSFER_DOCUMENT_FOLDER_NAME);

  if (existing) {
    return documentRowToModel(existing);
  }

  const timestamp = now();
  const id = newId();
  const orderIndex = getNextOrderIndex('documents', 'parent_id', preferredParentId);

  db.prepare(`
    INSERT INTO documents (id, title, content, parent_id, icon, created_at, updated_at, user_id, team_id, is_starred, order_index, is_deleted)
    VALUES (?, ?, ?, ?, 'folder', ?, ?, ?, NULL, 0, ?, 0)
  `).run(id, DEFAULT_TRANSFER_DOCUMENT_FOLDER_NAME, '<p></p>', preferredParentId, timestamp, timestamp, userId, orderIndex);

  return getDocumentById(id);
}

function ensurePersonalFileFolder(userId, preferredParentId = null) {
  const existing = db.prepare(`
    SELECT *
    FROM folders
    WHERE user_id = ?
      AND team_id IS NULL
      AND parent_id IS ?
      AND name = ?
    ORDER BY created_at ASC
    LIMIT 1
  `).get(userId, preferredParentId, DEFAULT_TRANSFER_FILE_FOLDER_NAME);

  if (existing) {
    return existing;
  }

  const timestamp = now();
  const id = newId();
  const orderIndex = getNextOrderIndex('folders', 'parent_id', preferredParentId);

  db.prepare(`
    INSERT INTO folders (id, name, parent_id, icon, created_at, updated_at, user_id, team_id, order_index)
    VALUES (?, ?, ?, 'folder', ?, ?, ?, NULL, ?)
  `).run(id, DEFAULT_TRANSFER_FILE_FOLDER_NAME, preferredParentId, timestamp, timestamp, userId, orderIndex);

  return getFolderById(id);
}

function resolvePersonalDocumentTarget(userId, requestedParentId) {
  const parentId = sanitizeNullable(requestedParentId);
  if (!parentId) {
    return ensurePersonalDocumentFolder(userId)?.id ?? null;
  }

  const parent = getDocumentById(parentId);
  if (!parent) {
    throw new Error('Target note folder not found.');
  }
  if (parent.icon !== 'folder') {
    throw new Error('Target note location must be a folder.');
  }
  if (parent.user_id !== userId || sanitizeNullable(parent.team_id)) {
    throw new Error('You do not have permission to use this note folder.');
  }
  if (parent.is_deleted) {
    throw new Error('Target note folder has been deleted.');
  }

  return parent.id;
}

function resolvePersonalFileTarget(userId, requestedFolderId) {
  const folderId = sanitizeNullable(requestedFolderId);
  if (!folderId) {
    return ensurePersonalFileFolder(userId)?.id ?? null;
  }

  const folder = getFolderById(folderId);
  if (!folder) {
    throw new Error('Target file folder not found.');
  }
  if (folder.user_id !== userId || sanitizeNullable(folder.team_id)) {
    throw new Error('You do not have permission to use this file folder.');
  }

  return folder.id;
}

function copyDocumentSubtreeToUser(sourceDocumentId, userId, targetParentId, rootOrderIndex = null) {
  const sourceDocument = getDocumentById(sourceDocumentId);
  if (!sourceDocument || sourceDocument.is_deleted) {
    throw new Error('Source document not found.');
  }

  const timestamp = now();
  const id = newId();
  const orderIndex = rootOrderIndex ?? getNextOrderIndex('documents', 'parent_id', targetParentId);

  db.prepare(`
    INSERT INTO documents (id, title, content, parent_id, icon, created_at, updated_at, user_id, team_id, is_starred, order_index, is_deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, 0)
  `).run(
    id,
    sourceDocument.title,
    sourceDocument.content,
    targetParentId,
    sourceDocument.icon ?? 'file',
    timestamp,
    timestamp,
    userId,
    orderIndex,
  );

  const children = db
    .prepare('SELECT * FROM documents WHERE parent_id = ? AND is_deleted = 0 ORDER BY order_index ASC, created_at ASC')
    .all(sourceDocumentId)
    .map(documentRowToModel);

  children.forEach((child, index) => {
    copyDocumentSubtreeToUser(child.id, userId, id, child.order_index ?? index);
  });

  return getDocumentById(id);
}

async function copyFileToUser(file, userId, targetFolderId) {
  if (!file) {
    throw new Error('Source file not found.');
  }

  const sourcePath = path.join(FILES_DIR, ...String(file.storage_path).split('/'));
  if (!existsSync(sourcePath)) {
    throw new Error('Source file is missing.');
  }

  const storedFileName = `${Date.now()}-${newId()}${path.extname(file.name) || path.extname(file.storage_path)}`;
  const dateFolder = new Date().toISOString().slice(0, 10);
  const relativePath = path.posix.join('personal', dateFolder, file.type || getFileType(file.name || '', ''), storedFileName);
  const targetPath = path.join(FILES_DIR, ...relativePath.split('/'));

  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);

  const timestamp = now();
  const id = newId();
  const url = `/uploads/${relativePath}`;
  const thumbnailUrl =
    file.type === 'image'
      ? url
      : file.thumbnail_url && file.thumbnail_url === file.url
        ? url
        : file.thumbnail_url;

  db.prepare(`
    INSERT INTO files (id, name, type, size, url, thumbnail_url, storage_path, folder_id, created_at, updated_at, user_id, team_id, is_starred)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)
  `).run(
    id,
    file.name,
    file.type,
    Number(file.size || 0),
    url,
    thumbnailUrl,
    relativePath,
    targetFolderId,
    timestamp,
    timestamp,
    userId,
  );

  return getFileById(id);
}

function canShareResourceToSpace(userId, resource, targetTeamId) {
  if (!userId || !resource || !targetTeamId) {
    return false;
  }

  const resourceTeamId = sanitizeNullable(resource.team_id);
  if (resourceTeamId) {
    return isApprovedTeamMember(userId, targetTeamId);
  }

  return isTeamOwner(userId, targetTeamId);
}

function canCreateShareLink(userId, resourceType, resource, visibility) {
  if (!userId || !resource) {
    return false;
  }

  if (resource.user_id === userId) {
    return true;
  }

  const resourceTeamId = sanitizeNullable(resource.team_id);
  if (!resourceTeamId || visibility !== 'space') {
    return false;
  }

  return resourceType === 'document'
    ? canViewDocument(userId, resource)
    : canViewFile(userId, resource);
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeMusicText(value, fallback, maxLength = 160) {
  const text = String(value ?? '').trim();
  return (text || fallback).slice(0, maxLength);
}

function getMusicSourceType(value) {
  return value === 'netease_music' ? 'netease_music' : 'qq_music';
}

function getDefaultMusicSourceName(sourceType = 'qq_music') {
  return sourceType === 'netease_music' ? '网易云音乐' : 'QQ音乐';
}

function normalizeMusicSourceName(value, fallback = getDefaultMusicSourceName('qq_music')) {
  return normalizeMusicText(value, fallback, 60);
}

function normalizeMusicSourceConfigInput(value, sourceType = 'qq_music') {
  const raw = value && typeof value === 'object' ? value : {};
  const cookie = typeof raw.cookie === 'string' ? raw.cookie.trim() : '';
  const phone = typeof raw.phone === 'string' ? raw.phone.trim() : '';
  const countryCode = typeof raw.country_code === 'string' ? raw.country_code.trim() : '';
  const accountName = typeof raw.account_name === 'string' ? raw.account_name.trim() : '';
  const normalizedType = getMusicSourceType(sourceType);
  let loginMode = null;

  if (normalizedType === 'netease_music') {
    loginMode = raw.login_mode === 'phone' ? 'phone' : null;
  } else if (raw.login_mode === 'qq' || raw.login_mode === 'wechat') {
    loginMode = raw.login_mode;
  }

  return {
    cookie: cookie || null,
    quality: normalizeQQQuality(raw.quality),
    login_mode: loginMode,
    phone: normalizedType === 'netease_music' ? (phone || null) : null,
    country_code: normalizedType === 'netease_music' ? ((countryCode || '86') || null) : null,
    account_name: normalizedType === 'netease_music' ? (accountName || null) : null,
  };
}

function getAvailableMusicSources(userId, includeDisabled = false) {
  const sources = listMusicSourcesForUser(userId);
  return includeDisabled ? sources : sources.filter((source) => source.is_enabled);
}

function resolveMusicSourceForUser(userId, requestedSourceId = null, includeDisabled = false) {
  const sources = getAvailableMusicSources(userId, includeDisabled);

  if (requestedSourceId) {
    return sources.find((source) => source.id === requestedSourceId) ?? null;
  }

  return sources.find((source) => source.is_default) ?? sources[0] ?? null;
}

function normalizeMusicTrackPayload(track, source) {
  const rawTrack = track && typeof track === 'object' ? track : {};
  const providerTrackId = String(
    rawTrack.provider_track_id ?? rawTrack.songmid ?? rawTrack.track_id ?? rawTrack.id ?? '',
  ).trim();

  if (!providerTrackId || !source) {
    return null;
  }

  const streamUrl = sanitizeNullable(rawTrack.stream_url);
  const coverUrl = sanitizeNullable(rawTrack.cover_url);
  const resolvedAt = sanitizeNullable(rawTrack.resolved_at);
  const lyricLines = Array.isArray(rawTrack.lyric_lines)
    ? rawTrack.lyric_lines
        .map((line) => {
          const time = Math.max(0, Number(line?.time || 0) || 0);
          const text = String(line?.text || '').trim();
          const translation = String(line?.translation || '').trim();

          if (!text) {
            return null;
          }

          return {
            time,
            text,
            translation,
          };
        })
        .filter(Boolean)
    : [];
  const title = normalizeMusicText(rawTrack.title, 'Untitled');
  const artist = normalizeMusicText(rawTrack.artist, 'Unknown Artist');
  const album = normalizeMusicText(rawTrack.album, 'Unknown Album');
  const duration = clampNumber(Number(rawTrack.duration || 0) || 0, 0, 60 * 60 * 4);
  const stableId = String(rawTrack.id || `${source.id}:${providerTrackId}`).trim();

  return {
    id: stableId,
    source_id: source.id,
    source_type: source.type,
    source_name: source.name,
    provider_track_id: providerTrackId,
    title,
    artist,
    album,
    duration,
    cover_url: coverUrl,
    stream_url: streamUrl,
    resolved_at: resolvedAt,
    lyric_lines: lyricLines,
  };
}

function normalizeMusicQueuePayload(queue, sourceMap, fallbackSource) {
  if (!Array.isArray(queue)) {
    return [];
  }

  const normalizedQueue = [];

  for (const item of queue.slice(0, MAX_MUSIC_QUEUE_LENGTH)) {
    const preferredSourceId = sanitizeNullable(item?.source_id) || fallbackSource?.id || null;
    const source = preferredSourceId ? sourceMap.get(preferredSourceId) ?? null : null;
    if (!source) {
      continue;
    }

    const normalizedTrack = normalizeMusicTrackPayload(item, source);
    if (normalizedTrack) {
      normalizedQueue.push(normalizedTrack);
    }
  }

  return normalizedQueue;
}

async function searchTracksByMusicSource(source, keyword, page, limit) {
  if (!source) {
    return [];
  }

  if (source.type === 'qq_music') {
    const tracks = await searchQQMusicTracks({
      keyword,
      page,
      limit,
      cookie: source.config?.cookie || '',
    });

    return tracks
      .map((track) => normalizeMusicTrackPayload(track, source))
      .filter(Boolean);
  }

  if (source.type === 'netease_music') {
    const tracks = await searchNeteaseMusicTracks({
      keyword,
      page,
      limit,
      cookie: source.config?.cookie || '',
    });

    return tracks
      .map((track) => normalizeMusicTrackPayload(track, source))
      .filter(Boolean);
  }

  return [];
}

async function resolveTrackByMusicSource(source, providerTrackId) {
  if (!source) {
    throw new Error('Music source is not available.');
  }

  if (source.type === 'qq_music') {
    return resolveQQMusicTrack({
      songmid: providerTrackId,
      quality: source.config?.quality,
      cookie: source.config?.cookie || '',
    });
  }

  if (source.type === 'netease_music') {
    return resolveNeteaseMusicTrack({
      trackId: providerTrackId,
    });
  }

  throw new Error('Unsupported music source type.');
}

function resolveSharePayload(link) {
  if (!link) return null;
  if (link.document_id) {
    return {
      type: 'document',
      resource: getDocumentById(link.document_id),
    };
  }
  if (link.file_id) {
    return {
      type: 'file',
      resource: getFileById(link.file_id),
    };
  }
  return null;
}

function canAccessShareLink(userId, link, payload, providedPassword = null) {
  if (!link || !payload?.resource) {
    return { allowed: false, status: 404, message: 'Shared resource not found.' };
  }

  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return { allowed: false, status: 410, message: 'Share link has expired.' };
  }

  const visibility = normalizeShareVisibility(link.visibility);

  if (link.password_hash) {
    const password = typeof providedPassword === 'string' ? providedPassword : '';
    if (!password) {
      return { allowed: false, status: 428, message: 'This share link requires a password.' };
    }

    if (!verifyPassword(password, link.password_hash)) {
      return { allowed: false, status: 403, message: 'The share password is incorrect.' };
    }
  }

  const sourceTeamId = sanitizeNullable(payload.resource.team_id);
  if (sourceTeamId) {
    const sourceTeam = getTeamById(sourceTeamId, { includeDissolved: true });
    if (!sourceTeam || sourceTeam.status !== 'active') {
      return { allowed: false, status: 410, message: 'The original workspace is no longer available.' };
    }
  }

  if (visibility === 'link') {
    return { allowed: true };
  }

  if (!userId) {
    return { allowed: false, status: 401, message: 'Please log in first.' };
  }

  if (visibility === 'private') {
    const ownerId = payload.resource.user_id;
    return ownerId === userId
      ? { allowed: true }
      : { allowed: false, status: 403, message: 'You do not have access to this private resource.' };
  }

  if (visibility === 'space') {
    const teamId = sanitizeNullable(link.team_id) || sanitizeNullable(payload.resource.team_id);
    if (!teamId || !isApprovedTeamMember(userId, teamId)) {
      return { allowed: false, status: 403, message: 'You are not a member of this workspace.' };
    }

    return { allowed: true };
  }

  return { allowed: false, status: 403, message: 'Share visibility is invalid.' };
}

function getRequestOrigin(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];
  const rawProto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const rawHost = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  const protocol = String(rawProto || 'http').split(',')[0].trim() || 'http';
  const host = String(rawHost || req.headers.host || `127.0.0.1:${API_PORT}`).split(',')[0].trim();
  return `${protocol}://${host}`;
}

function absolutizeUploadUrl(req, value) {
  const rawValue = sanitizeNullable(value);
  if (!rawValue || !rawValue.startsWith('/uploads/')) {
    return rawValue;
  }
  return new URL(rawValue, getRequestOrigin(req)).toString();
}

function absolutizeUploadsInHtml(req, html) {
  if (typeof html !== 'string' || !html.includes('/uploads/')) {
    return html;
  }

  return html.replace(
    /(src|href)=(["'])(\/uploads\/[^"']*)\2/g,
    (_match, attribute, quote, resourceUrl) => `${attribute}=${quote}${absolutizeUploadUrl(req, resourceUrl)}${quote}`,
  );
}

function serializeSharedDocument(req, document) {
  if (!document) {
    return null;
  }

  return {
    ...document,
    content: absolutizeUploadsInHtml(req, document.content || ''),
  };
}

function serializeSharedFile(req, file) {
  if (!file) {
    return null;
  }

  return {
    ...file,
    url: absolutizeUploadUrl(req, file.url) || file.url,
    thumbnail_url: absolutizeUploadUrl(req, file.thumbnail_url) || file.thumbnail_url,
  };
}

async function handleUploads(res, url) {
  const relativePath = decodeURIComponent(url.pathname.replace('/uploads/', ''));
  const fullPath = path.join(FILES_DIR, ...relativePath.split('/'));

  if (!fullPath.startsWith(FILES_DIR) || !existsSync(fullPath)) {
    json(res, 404, { error: 'File not found.' });
    return;
  }

  const fileStat = await stat(fullPath);
  res.writeHead(200, {
    'Content-Type': mimeTypeForExtension(fullPath),
    'Content-Length': fileStat.size,
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  createReadStream(fullPath).pipe(res);
}

function isPathWithin(basePath, targetPath) {
  const relative = path.relative(basePath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function streamFile(res, filePath, cacheControl = 'no-cache') {
  const fileInfo = await stat(filePath).catch(() => null);
  if (!fileInfo?.isFile()) {
    return false;
  }

  res.writeHead(200, {
    'Content-Type': mimeTypeForExtension(filePath),
    'Cache-Control': cacheControl,
  });
  createReadStream(filePath).pipe(res);
  return true;
}

async function handleFrontend(req, res, url) {
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    text(res, 405, 'Method not allowed.');
    return;
  }

  const requestPath = decodeURIComponent(url.pathname);
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const staticFilePath = path.resolve(DIST_DIR, relativePath);

  if (isPathWithin(DIST_DIR, staticFilePath)) {
    const served = await streamFile(
      res,
      staticFilePath,
      requestPath.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    );
    if (served) {
      return;
    }
  }

  if (path.extname(requestPath)) {
    text(res, 404, 'Not found.');
    return;
  }

  const indexPath = path.join(DIST_DIR, 'index.html');
  const served = await streamFile(res, indexPath, 'no-cache');
  if (served) {
    return;
  }

  text(res, 200, 'Yuque local API server is running.');
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    sendEmpty(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readJsonBody(req);
    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(body.email);
    if (!userRow || !verifyPassword(body.password || '', userRow.password_hash)) {
      json(res, 401, { error: 'Invalid email or password.' });
      return;
    }
    json(res, 200, { user: publicUser(userRow) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const body = await readJsonBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const nickname = String(body.nickname || '').trim();

    if (!email || !password || !nickname) {
      json(res, 400, { error: 'Email, password, and nickname are required.' });
      return;
    }

    if (password.length < 6) {
      json(res, 400, { error: 'Password must be at least 6 characters.' });
      return;
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      json(res, 409, { error: 'Email is already registered.' });
      return;
    }

    const timestamp = now();
    const id = newId();
    db.prepare(`
      INSERT INTO users (id, email, password_hash, nickname, avatar_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, email, hashPassword(password), nickname, null, timestamp, timestamp);

    json(res, 201, { user: publicUser(getUserById(id)) });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/users') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const rows = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all();
    json(res, 200, rows.map(publicUser));
    return;
  }

  if (req.method === 'GET' && /^\/api\/users\/[^/]+$/.test(url.pathname)) {
    const userId = decodeURIComponent(url.pathname.replace('/api/users/', ''));
    const user = getUserById(userId);
    if (!user) {
      json(res, 404, { error: 'User not found.' });
      return;
    }
    json(res, 200, publicUser(user));
    return;
  }

  if (req.method === 'PATCH' && /^\/api\/users\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const userId = decodeURIComponent(url.pathname.replace('/api/users/', ''));
    if (currentUser.id !== userId) {
      json(res, 403, { error: '只能修改当前登录账号的资料。' });
      return;
    }

    const body = await readJsonBody(req);
    const existing = getUserById(userId);
    if (!existing) {
      json(res, 404, { error: 'User not found.' });
      return;
    }

    const nextNickname =
      body.nickname !== undefined
        ? String(body.nickname || '').trim()
        : existing.nickname;
    const nextAvatarUrl =
      body.avatar_url !== undefined
        ? sanitizeNullable(body.avatar_url)
        : existing.avatar_url;
    const nextEmail =
      body.email !== undefined
        ? String(body.email || '').trim().toLowerCase()
        : existing.email;
    const requestedPassword =
      body.new_password !== undefined
        ? String(body.new_password || '')
        : body.password !== undefined
          ? String(body.password || '')
          : null;
    const currentPassword = String(body.current_password || '');

    if (!nextNickname) {
      json(res, 400, { error: '昵称不能为空。' });
      return;
    }

    if (!nextEmail) {
      json(res, 400, { error: '邮箱不能为空。' });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      json(res, 400, { error: '邮箱格式不正确。' });
      return;
    }

    if (nextEmail !== existing.email) {
      const duplicate = db.prepare('SELECT id FROM users WHERE email = ? AND id <> ?').get(nextEmail, userId);
      if (duplicate) {
        json(res, 409, { error: '该邮箱已被其他账号使用。' });
        return;
      }
    }

    let nextPasswordHash = existing.password_hash;
    if (requestedPassword !== null) {
      if (!currentPassword) {
        json(res, 400, { error: '修改密码前请先输入当前密码。' });
        return;
      }

      if (!verifyPassword(currentPassword, existing.password_hash)) {
        json(res, 400, { error: '当前密码不正确。' });
        return;
      }

      if (requestedPassword.length < 6) {
        json(res, 400, { error: '新密码至少需要 6 位。' });
        return;
      }

      nextPasswordHash = hashPassword(requestedPassword);
    }

    db.prepare(`
      UPDATE users
      SET email = ?, nickname = ?, avatar_url = ?, password_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(nextEmail, nextNickname, nextAvatarUrl, nextPasswordHash, now(), userId);

    json(res, 200, { user: publicUser(getUserById(userId)) });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/music/sources') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    json(res, 200, listMusicSourcesForUser(currentUser.id));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/music/sources') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const sourceType = getMusicSourceType(body.type);

    const timestamp = now();
    const id = newId();
    const name = normalizeMusicSourceName(body.name, getDefaultMusicSourceName(sourceType));
    const config = normalizeMusicSourceConfigInput(body.config, sourceType);
    const shouldSetDefault = Boolean(body.is_default);
    const isEnabled = shouldSetDefault ? true : body.is_enabled !== undefined ? Boolean(body.is_enabled) : true;

    if (shouldSetDefault) {
      db.prepare('UPDATE music_sources SET is_default = 0, updated_at = ? WHERE user_id = ?').run(timestamp, currentUser.id);
    }

    db.prepare(`
      INSERT INTO music_sources (id, user_id, type, name, config_json, is_enabled, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      currentUser.id,
      sourceType,
      name,
      JSON.stringify(config),
      Number(isEnabled),
      Number(shouldSetDefault),
      timestamp,
      timestamp,
    );

    ensureDefaultMusicSource(currentUser.id);
    ensureMusicPlayerState(currentUser.id);

    json(res, 201, getMusicSourceById(id, currentUser.id));
    return;
  }

  if (req.method === 'PATCH' && /^\/api\/music\/sources\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const sourceId = decodeURIComponent(url.pathname.replace('/api/music/sources/', ''));
    const existing = getMusicSourceById(sourceId, currentUser.id);
    if (!existing) {
      json(res, 404, { error: 'Music source not found.' });
      return;
    }

    const body = await readJsonBody(req);
    if (body.type !== undefined && getMusicSourceType(body.type) !== existing.type) {
      json(res, 400, { error: 'Music source type cannot be changed after creation.' });
      return;
    }

    const userSources = listMusicSourcesForUser(currentUser.id);
    const enabledSources = userSources.filter((source) => source.is_enabled);
    const mergedConfig =
      body.config && typeof body.config === 'object'
        ? { ...existing.config, ...body.config }
        : existing.config;
    const nextName = body.name !== undefined ? normalizeMusicSourceName(body.name, existing.name) : existing.name;
    let nextIsEnabled = body.is_enabled !== undefined ? Boolean(body.is_enabled) : existing.is_enabled;
    const wantsDefault = body.is_default === true;

    if (!nextIsEnabled && existing.is_enabled && enabledSources.length <= 1) {
      json(res, 400, { error: 'At least one music source must remain enabled.' });
      return;
    }

    if (wantsDefault) {
      nextIsEnabled = true;
      db.prepare('UPDATE music_sources SET is_default = 0, updated_at = ? WHERE user_id = ?').run(now(), currentUser.id);
    }

    const nextIsDefault = wantsDefault ? true : existing.is_default && nextIsEnabled;

    db.prepare(`
      UPDATE music_sources
      SET name = ?, config_json = ?, is_enabled = ?, is_default = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      nextName,
      JSON.stringify(normalizeMusicSourceConfigInput(mergedConfig, existing.type)),
      Number(nextIsEnabled),
      Number(nextIsDefault),
      now(),
      sourceId,
      currentUser.id,
    );

    ensureDefaultMusicSource(currentUser.id);
    ensureMusicPlayerState(currentUser.id);

    json(res, 200, getMusicSourceById(sourceId, currentUser.id));
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/music\/sources\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const sourceId = decodeURIComponent(url.pathname.replace('/api/music/sources/', ''));
    const existing = getMusicSourceById(sourceId, currentUser.id);
    if (!existing) {
      json(res, 404, { error: 'Music source not found.' });
      return;
    }

    db.prepare('DELETE FROM music_sources WHERE id = ? AND user_id = ?').run(sourceId, currentUser.id);
    db.prepare('UPDATE music_player_states SET active_source_id = NULL, updated_at = ? WHERE user_id = ? AND active_source_id = ?').run(
      now(),
      currentUser.id,
      sourceId,
    );

    ensureDefaultMusicSource(currentUser.id);
    ensureMusicPlayerState(currentUser.id);

    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/music/qq-login/sessions') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    try {
      const body = await readJsonBody(req);
      const loginMode = body?.login_mode === 'qq' ? 'qq' : 'wechat';
      const session = loginMode === 'qq'
        ? await createQQMusicQqLoginSession(currentUser.id)
        : await createQQMusicWechatLoginSession(currentUser.id);
      json(res, 201, serializeQQMusicLoginSession(session));
    } catch (error) {
      json(res, 502, { error: error instanceof Error ? error.message : '音乐登录初始化失败。' });
    }
    return;
  }

  if (req.method === 'GET' && /^\/api\/music\/qq-login\/sessions\/[^/]+\/status$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const sessionId = decodeURIComponent(
      url.pathname
        .replace('/api/music/qq-login/sessions/', '')
        .replace('/status', ''),
    );
    const session = getQQMusicLoginSessionForUser(sessionId, currentUser.id);
    if (!session) {
      json(res, 404, { error: '音乐登录会话不存在。' });
      return;
    }

    try {
      const refreshedSession = session.login_mode === 'qq'
        ? await refreshQQMusicQqLoginSession(session)
        : await refreshQQMusicWechatLoginSession(session);
      json(res, 200, serializeQQMusicLoginSession(refreshedSession));
    } catch (error) {
      session.status = 'failed';
      session.message = error instanceof Error ? error.message : '音乐登录失败。';
      session.updated_at = now();
      json(res, 200, serializeQQMusicLoginSession(session));
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/music/netease/login/phone') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    const countryCode = String(body.country_code || '86').trim() || '86';

    if (!phone || !password) {
      json(res, 400, { error: 'Phone and password are required.' });
      return;
    }

    try {
      const result = await loginNeteaseMusicByPhone({
        phone,
        password,
        countryCode,
      });

      json(res, 200, {
        provider: 'netease_music',
        cookie: result.cookie,
        phone: result.phone,
        country_code: result.country_code,
        account_name: result.account_name,
      });
    } catch (error) {
      json(res, 502, { error: error instanceof Error ? error.message : 'Netease music phone login failed.' });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/music/search') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const keyword = String(body.keyword || '').trim();
    if (!keyword) {
      json(res, 400, { error: 'Search keyword is required.' });
      return;
    }

    const sourceId = sanitizeNullable(body.source_id);
    const source = resolveMusicSourceForUser(currentUser.id, sourceId, false);
    if (!source) {
      json(res, 404, { error: 'Available music source not found.' });
      return;
    }

    try {
      const tracks = await searchTracksByMusicSource(
        source,
        keyword,
        Math.max(1, Number(body.page || 1)),
        clampNumber(Number(body.limit || MAX_MUSIC_SEARCH_RESULTS) || MAX_MUSIC_SEARCH_RESULTS, 1, 50),
      );

      json(res, 200, {
        keyword,
        source,
        tracks,
      });
    } catch (error) {
      json(res, 502, { error: error instanceof Error ? error.message : 'Music search failed.' });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/music/collections') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const requestedSourceId = sanitizeNullable(url.searchParams.get('sourceId'));
    const source = requestedSourceId
      ? getMusicSourceById(requestedSourceId, currentUser.id)
      : resolveMusicSourceForUser(currentUser.id, null, false);

    if (!source) {
      json(res, 404, { error: 'Music source not found.' });
      return;
    }

    if (source.type !== 'qq_music') {
      json(res, 400, { error: 'Only QQ Music collections are supported right now.' });
      return;
    }

    try {
      const collections = await getQQMusicCollections({
        cookie: source.config?.cookie || '',
      });

      json(res, 200, {
        source,
        ...collections,
      });
    } catch (error) {
      json(res, 502, { error: error instanceof Error ? error.message : 'Failed to fetch music collections.' });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/music/collections/playlist') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const requestedSourceId = sanitizeNullable(url.searchParams.get('sourceId'));
    const playlistId = sanitizeNullable(url.searchParams.get('playlistId'));
    const playlistTitle = String(url.searchParams.get('playlistTitle') || '').trim() || '未命名歌单';
    const playlistKindRaw = String(url.searchParams.get('playlistKind') || '').trim();
    const playlistKind = playlistKindRaw === 'liked_songs' || playlistKindRaw === 'collected' ? playlistKindRaw : 'created';
    const playlistCoverUrl = sanitizeNullable(url.searchParams.get('playlistCoverUrl'));

    if (!requestedSourceId || !playlistId) {
      json(res, 400, { error: 'Source id and playlist id are required.' });
      return;
    }

    const source = getMusicSourceById(requestedSourceId, currentUser.id);
    if (!source) {
      json(res, 404, { error: 'Music source not found.' });
      return;
    }

    if (source.type !== 'qq_music') {
      json(res, 400, { error: 'Only QQ Music collections are supported right now.' });
      return;
    }

    try {
      const collections = await getQQMusicCollections({
        cookie: source.config?.cookie || '',
      });
      const tracks = await getQQMusicCollectionPlaylistTracks({
        playlistId,
        uin: collections.uin,
        cookie: source.config?.cookie || '',
      });

      json(res, 200, {
        source,
        playlist: {
          id: playlistId,
          title: playlistTitle,
          cover_url: playlistCoverUrl,
          song_count: tracks.length,
          kind: playlistKind,
        },
        tracks: tracks.map((track) => normalizeMusicTrackPayload(track, source)).filter(Boolean),
      });
    } catch (error) {
      json(res, 502, { error: error instanceof Error ? error.message : 'Failed to fetch playlist tracks.' });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/music/resolve') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const trackPayload = body.track && typeof body.track === 'object' ? body.track : null;
    const requestedSourceId = sanitizeNullable(body.source_id) || sanitizeNullable(trackPayload?.source_id);
    const source = requestedSourceId
      ? getMusicSourceById(requestedSourceId, currentUser.id)
      : resolveMusicSourceForUser(currentUser.id, null, true);

    if (!source) {
      json(res, 404, { error: 'Music source not found.' });
      return;
    }

    const providerTrackId = String(
      body.provider_track_id ?? trackPayload?.provider_track_id ?? trackPayload?.songmid ?? '',
    ).trim();

    if (!providerTrackId) {
      json(res, 400, { error: 'Track id is required.' });
      return;
    }

    try {
      const [resolved, lyricLines] = await Promise.all([
        resolveTrackByMusicSource(source, providerTrackId),
        source.type === 'qq_music'
          ? getQQMusicLyric({
              songmid: providerTrackId,
              cookie: source.config?.cookie || '',
            }).catch(() => [])
          : source.type === 'netease_music'
            ? getNeteaseMusicLyric({
                trackId: providerTrackId,
                cookie: source.config?.cookie || '',
              }).catch(() => [])
            : Promise.resolve([]),
      ]);
      const normalizedTrack = normalizeMusicTrackPayload(
        {
          ...trackPayload,
          provider_track_id: providerTrackId,
          stream_url: resolved.stream_url,
          resolved_at: now(),
          lyric_lines: lyricLines,
        },
        source,
      );

      json(res, 200, {
        track: {
          ...normalizedTrack,
          quality: resolved.quality,
        },
      });
    } catch (error) {
      json(res, 502, { error: error instanceof Error ? error.message : 'Track playback url could not be resolved.' });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/music/player-state') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    json(res, 200, getMusicPlayerStateByUserId(currentUser.id));
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/api/music/player-state') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const currentState = getMusicPlayerStateByUserId(currentUser.id);
    const allSources = listMusicSourcesForUser(currentUser.id);
    const enabledSources = allSources.filter((source) => source.is_enabled);
    const sourceMap = new Map(allSources.map((source) => [source.id, source]));
    const fallbackSource =
      enabledSources.find((source) => source.is_default) ?? enabledSources[0] ?? allSources[0] ?? null;
    let activeSourceId = currentState?.active_source_id ?? fallbackSource?.id ?? null;

    if (body.active_source_id !== undefined) {
      const requestedActiveSourceId = sanitizeNullable(body.active_source_id);
      if (requestedActiveSourceId) {
        const requestedSource = sourceMap.get(requestedActiveSourceId);
        if (!requestedSource || !requestedSource.is_enabled) {
          json(res, 400, { error: 'Selected music source is not available.' });
          return;
        }
      }
      activeSourceId = requestedActiveSourceId;
    }

    if (activeSourceId && !enabledSources.some((source) => source.id === activeSourceId)) {
      activeSourceId = fallbackSource?.id ?? null;
    }

    const queue =
      body.queue !== undefined
        ? normalizeMusicQueuePayload(body.queue, sourceMap, fallbackSource)
        : Array.isArray(currentState?.queue)
          ? normalizeMusicQueuePayload(currentState.queue, sourceMap, fallbackSource)
          : [];

    const maxIndex = Math.max(0, queue.length - 1);
    const nextCurrentIndex =
      body.current_index !== undefined
        ? clampNumber(Number(body.current_index || 0) || 0, 0, maxIndex)
        : clampNumber(Number(currentState?.current_index || 0) || 0, 0, maxIndex);
    const nextCurrentTime =
      queue.length === 0
        ? 0
        : Math.max(0, Number(body.current_time ?? currentState?.current_time ?? 0) || 0);
    const nextVolume = clampNumber(
      Number(body.volume ?? currentState?.volume ?? 1) || 0,
      0,
      1,
    );
    const nextMuted = body.is_muted !== undefined ? Boolean(body.is_muted) : Boolean(currentState?.is_muted);
    const nextExpanded = body.is_expanded !== undefined ? Boolean(body.is_expanded) : Boolean(currentState?.is_expanded);
    const nextPlaying = body.is_playing !== undefined ? Boolean(body.is_playing) : Boolean(currentState?.is_playing);

    db.prepare(`
      UPDATE music_player_states
      SET active_source_id = ?, queue_json = ?, current_index = ?, current_time = ?, volume = ?, is_muted = ?, is_expanded = ?, is_playing = ?, updated_at = ?
      WHERE user_id = ?
    `).run(
      activeSourceId,
      JSON.stringify(queue),
      queue.length === 0 ? 0 : nextCurrentIndex,
      nextCurrentTime,
      nextVolume,
      Number(nextMuted),
      Number(nextExpanded),
      Number(nextPlaying),
      now(),
      currentUser.id,
    );

    json(res, 200, getMusicPlayerStateByUserId(currentUser.id));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/teams') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const scope = url.searchParams.get('scope');
    if (scope === 'discover') {
      json(res, 200, listDiscoverableTeams(currentUser.id));
      return;
    }

    json(res, 200, listTeamsForUser(currentUser.id));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/teams/dissolved') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    json(res, 200, listDissolvedTeams(currentUser.id));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/teams') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const name = String(body.name || '').trim();
    if (!name) {
      json(res, 400, { error: 'Team name is required.' });
      return;
    }

    const timestamp = now();
    const teamId = newId();
    const membershipId = newId();

    db.prepare(`
      INSERT INTO teams (id, name, owner_user_id, avatar_url, member_limit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(teamId, name, currentUser.id, null, 10, timestamp, timestamp);

    db.prepare(`
      INSERT INTO team_members (id, team_id, user_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'approved', ?, ?)
    `).run(membershipId, teamId, currentUser.id, timestamp, timestamp);

    json(res, 201, {
      ...getTeamById(teamId),
      membership_status: 'approved',
      is_owner: true,
    });
    return;
  }

  if (req.method === 'PATCH' && /^\/api\/teams\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/api/teams/', ''));
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    const existingTeam = getTeamById(teamId);
    if (!existingTeam) {
      json(res, 404, { error: 'Team not found.' });
      return;
    }

    const body = await readJsonBody(req);
    const nextName = body.name !== undefined ? String(body.name || '').trim() : existingTeam.name;
    const nextAvatarUrl = body.avatar_url !== undefined ? sanitizeNullable(body.avatar_url) : existingTeam.avatar_url;
    const nextCreatedAt = body.created_at !== undefined ? String(body.created_at || '').trim() : existingTeam.created_at;
    const nextMemberLimit = body.member_limit !== undefined ? Number(body.member_limit) : Number(existingTeam.member_limit ?? 10);

    if (!nextName) {
      json(res, 400, { error: 'Team name is required.' });
      return;
    }

    if (!nextCreatedAt || Number.isNaN(new Date(nextCreatedAt).getTime())) {
      json(res, 400, { error: 'created_at must be a valid datetime.' });
      return;
    }

    if (!Number.isInteger(nextMemberLimit) || nextMemberLimit < 1) {
      json(res, 400, { error: 'member_limit must be a positive integer.' });
      return;
    }

    const approvedCountRow = db
      .prepare("SELECT COUNT(*) AS count FROM team_members WHERE team_id = ? AND status = 'approved'")
      .get(teamId);
    const approvedCount = Number(approvedCountRow?.count ?? 0);
    if (nextMemberLimit < approvedCount) {
      json(res, 400, { error: 'member_limit cannot be lower than the current approved member count.' });
      return;
    }

    db.prepare(`
      UPDATE teams
      SET name = ?, avatar_url = ?, member_limit = ?, created_at = ?, updated_at = ?
      WHERE id = ?
    `).run(nextName, nextAvatarUrl, nextMemberLimit, nextCreatedAt, now(), teamId);

    json(res, 200, serializeTeamForUser(getTeamById(teamId), currentUser.id));
    return;
  }

  if (req.method === 'GET' && /^\/api\/teams\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/api/teams/', ''));
    const team = getTeamById(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found.' });
      return;
    }

    if (!(team.owner_user_id === currentUser.id || isApprovedTeamMember(currentUser.id, teamId))) {
      json(res, 403, { error: 'You do not have access to this team.' });
      return;
    }

    json(res, 200, serializeTeamForUser(team, currentUser.id));
    return;
  }

  if (req.method === 'POST' && /^\/api\/teams\/[^/]+\/leave$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/leave', '').replace('/api/teams/', ''));
    const team = getTeamById(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found.' });
      return;
    }

    if (team.owner_user_id === currentUser.id) {
      json(res, 400, { error: 'The team owner cannot leave the workspace. Dissolve it instead.' });
      return;
    }

    const membership = getTeamMembership(teamId, currentUser.id);
    if (!membership || membership.status !== 'approved') {
      json(res, 404, { error: 'You are not a member of this team.' });
      return;
    }

    const timestamp = now();
    db.prepare('UPDATE team_members SET status = ?, updated_at = ? WHERE id = ?').run('left', timestamp, membership.id);
    db.prepare('DELETE FROM resource_permissions WHERE team_id = ? AND member_user_id = ?').run(teamId, currentUser.id);

    createUserNotification({
      userId: team.owner_user_id,
      teamId,
      actorUserId: currentUser.id,
      type: 'team_member_left',
      title: '成员退出了空间',
      content: `${currentUser.nickname || currentUser.email} 已退出「${team.name}」。`,
      actionUrl: `/spaces/${encodeURIComponent(teamId)}/manage?section=members`,
    });

    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && /^\/api\/teams\/[^/]+\/dissolve$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/dissolve', '').replace('/api/teams/', ''));
    const team = getTeamById(teamId, { includeDissolved: true });
    if (!team) {
      json(res, 404, { error: 'Team not found.' });
      return;
    }

    if (!isTeamOwnerIncludingDissolved(currentUser.id, teamId)) {
      json(res, 403, { error: 'Only the team owner can dissolve this team.' });
      return;
    }

    if (team.status === 'dissolved') {
      json(res, 200, { ok: true, retention_until: team.retention_until ?? null });
      return;
    }

    const timestamp = now();
    const retentionUntil = addDays(timestamp, DISSOLVED_TEAM_RETENTION_DAYS);

    db.prepare(`
      UPDATE teams
      SET status = 'dissolved', dissolved_at = ?, retention_until = ?, updated_at = ?
      WHERE id = ?
    `).run(timestamp, retentionUntil, timestamp, teamId);

    db.prepare(`
      UPDATE team_invitations
      SET status = 'revoked', updated_at = ?
      WHERE team_id = ? AND status = 'pending'
    `).run(timestamp, teamId);

    broadcastTeamNotification(
      teamId,
      {
        actorUserId: currentUser.id,
        type: 'team_dissolved',
        title: '空间已解散',
        content: `「${team.name}」已被解散，原空间内容会在回收站保留 ${DISSOLVED_TEAM_RETENTION_DAYS} 天，你可以在期限内转存需要的内容。`,
        actionUrl: `/spaces/${encodeURIComponent(teamId)}/recycle`,
      },
      [currentUser.id],
    );

    json(res, 200, { ok: true, retention_until: retentionUntil });
    return;
  }

  if (req.method === 'POST' && /^\/api\/teams\/[^/]+\/members\/[^/]+\/remove$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const segments = url.pathname.split('/');
    const teamId = decodeURIComponent(segments[3]);
    const memberUserId = decodeURIComponent(segments[5]);
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    const team = getTeamById(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found.' });
      return;
    }

    if (memberUserId === team.owner_user_id) {
      json(res, 400, { error: 'The team owner cannot be removed.' });
      return;
    }

    const membership = getTeamMembership(teamId, memberUserId);
    if (!membership || membership.status !== 'approved') {
      json(res, 404, { error: 'Team member not found.' });
      return;
    }

    const removedUser = getUserById(memberUserId);
    const timestamp = now();
    db.prepare('UPDATE team_members SET status = ?, updated_at = ? WHERE id = ?').run('removed', timestamp, membership.id);
    db.prepare('DELETE FROM resource_permissions WHERE team_id = ? AND member_user_id = ?').run(teamId, memberUserId);

    createUserNotification({
      userId: memberUserId,
      teamId,
      actorUserId: currentUser.id,
      type: 'team_member_removed',
      title: '你已被移出空间',
      content: `你已被移出「${team.name}」，该空间内容将不再可见。`,
      actionUrl: null,
    });

    json(res, 200, {
      ok: true,
      member: removedUser ? publicUser(removedUser) : null,
    });
    return;
  }

  if (req.method === 'POST' && /^\/api\/teams\/[^/]+\/notifications$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/notifications', '').replace('/api/teams/', ''));
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    const team = getTeamById(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found.' });
      return;
    }

    const body = await readJsonBody(req);
    const title = String(body.title || '').trim() || '空间通知';
    const content = String(body.content || '').trim();

    if (!content) {
      json(res, 400, { error: 'Notification content is required.' });
      return;
    }

    broadcastTeamNotification(
      teamId,
      {
        actorUserId: currentUser.id,
        type: 'team_announcement',
        title,
        content,
        actionUrl: `/spaces/${encodeURIComponent(teamId)}/manage?section=overview`,
      },
      [currentUser.id],
    );

    json(res, 201, { ok: true });
    return;
  }

  if (req.method === 'GET' && /^\/api\/teams\/[^/]+\/recycle$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/recycle', '').replace('/api/teams/', ''));
    const team = getTeamById(teamId, { includeDissolved: true });
    if (!team || team.status !== 'dissolved') {
      json(res, 404, { error: 'Recycle workspace not found.' });
      return;
    }

    if (isExpiredRetention(team.retention_until)) {
      json(res, 410, { error: 'Recycle retention has expired.' });
      return;
    }

    if (!canAccessDissolvedTeamRecycle(currentUser.id, teamId)) {
      json(res, 403, { error: 'You do not have access to this recycle space.' });
      return;
    }

    const documents = db
      .prepare('SELECT * FROM documents WHERE team_id = ? AND is_deleted = 0 ORDER BY parent_id, order_index, created_at')
      .all(teamId)
      .map(documentRowToModel);
    const folders = db.prepare('SELECT * FROM folders WHERE team_id = ? ORDER BY parent_id, order_index, created_at').all(teamId);
    const files = db.prepare('SELECT * FROM files WHERE team_id = ? ORDER BY created_at DESC').all(teamId).map(fileRowToModel).filter(Boolean);

    json(res, 200, {
      team,
      retention_until: team.retention_until,
      documents,
      folders,
      files,
    });
    return;
  }

  if (req.method === 'POST' && /^\/api\/teams\/[^/]+\/recycle\/documents\/[^/]+\/save$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const segments = url.pathname.split('/');
    const teamId = decodeURIComponent(segments[3]);
    const documentId = decodeURIComponent(segments[6]);
    const team = getTeamById(teamId, { includeDissolved: true });
    if (!team || team.status !== 'dissolved') {
      json(res, 404, { error: 'Recycle workspace not found.' });
      return;
    }
    if (isExpiredRetention(team.retention_until)) {
      json(res, 410, { error: 'Recycle retention has expired.' });
      return;
    }
    if (!canAccessDissolvedTeamRecycle(currentUser.id, teamId)) {
      json(res, 403, { error: 'You do not have access to this recycle space.' });
      return;
    }

    const sourceDocument = getDocumentById(documentId);
    if (!sourceDocument || sanitizeNullable(sourceDocument.team_id) !== teamId) {
      json(res, 404, { error: 'Document not found in recycle space.' });
      return;
    }

    const body = await readJsonBody(req);
    try {
      const targetParentId = resolvePersonalDocumentTarget(currentUser.id, body.target_document_parent_id);
      const savedDocument = copyDocumentSubtreeToUser(sourceDocument.id, currentUser.id, targetParentId);
      json(res, 201, { ok: true, document: savedDocument });
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : 'Failed to save document.' });
    }
    return;
  }

  if (req.method === 'POST' && /^\/api\/teams\/[^/]+\/recycle\/files\/[^/]+\/save$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const segments = url.pathname.split('/');
    const teamId = decodeURIComponent(segments[3]);
    const fileId = decodeURIComponent(segments[6]);
    const team = getTeamById(teamId, { includeDissolved: true });
    if (!team || team.status !== 'dissolved') {
      json(res, 404, { error: 'Recycle workspace not found.' });
      return;
    }
    if (isExpiredRetention(team.retention_until)) {
      json(res, 410, { error: 'Recycle retention has expired.' });
      return;
    }
    if (!canAccessDissolvedTeamRecycle(currentUser.id, teamId)) {
      json(res, 403, { error: 'You do not have access to this recycle space.' });
      return;
    }

    const sourceFile = getFileById(fileId);
    if (!sourceFile || sanitizeNullable(sourceFile.team_id) !== teamId) {
      json(res, 404, { error: 'File not found in recycle space.' });
      return;
    }

    const body = await readJsonBody(req);
    try {
      const targetFolderId = resolvePersonalFileTarget(currentUser.id, body.target_file_folder_id);
      const savedFile = await copyFileToUser(sourceFile, currentUser.id, targetFolderId);
      json(res, 201, { ok: true, file: savedFile });
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : 'Failed to save file.' });
    }
    return;
  }

  if (req.method === 'GET' && /^\/api\/teams\/[^/]+\/invite-candidates$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/invite-candidates', '').replace('/api/teams/', ''));
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    const query = String(url.searchParams.get('query') || '').trim();
    if (!query) {
      json(res, 200, []);
      return;
    }

    json(res, 200, searchInvitableUsers(teamId, query));
    return;
  }

  if (req.method === 'GET' && /^\/api\/teams\/[^/]+\/invitations$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/invitations', '').replace('/api/teams/', ''));
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    json(res, 200, listTeamInvitations(teamId));
    return;
  }

  if (req.method === 'POST' && /^\/api\/teams\/[^/]+\/invitations$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/invitations', '').replace('/api/teams/', ''));
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    const team = getTeamById(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found.' });
      return;
    }

    const body = await readJsonBody(req);
    const inviteType = String(body.invite_type || '').trim();
    const timestamp = now();

    if (inviteType === 'code') {
      db.prepare(`
        UPDATE team_invitations
        SET status = 'revoked', updated_at = ?
        WHERE team_id = ? AND invite_type = 'code' AND status = 'pending'
      `).run(timestamp, teamId);

      let code = '';
      do {
        code = generateInviteCode();
      } while (db.prepare('SELECT id FROM team_invitations WHERE code = ?').get(code));

      const invitationId = newId();
      db.prepare(`
        INSERT INTO team_invitations (
          id, team_id, invite_type, code, invited_email, invited_user_id, status,
          created_by_user_id, accepted_by_user_id, accepted_at, created_at, updated_at
        )
        VALUES (?, ?, 'code', ?, NULL, NULL, 'pending', ?, NULL, NULL, ?, ?)
      `).run(invitationId, teamId, code, currentUser.id, timestamp, timestamp);

      json(res, 201, listTeamInvitations(teamId).find((invite) => invite.id === invitationId) || null);
      return;
    }

    if (inviteType === 'email') {
      const invitedUserId = sanitizeNullable(body.invited_user_id);
      if (!invitedUserId) {
        json(res, 400, { error: 'invited_user_id is required.' });
        return;
      }

      const invitedUser = getUserById(invitedUserId);
      if (!invitedUser) {
        json(res, 404, { error: 'Invited user not found.' });
        return;
      }

      if (invitedUser.id === team.owner_user_id) {
        json(res, 409, { error: 'The team owner does not need an invitation.' });
        return;
      }

      const membership = getTeamMembership(teamId, invitedUser.id);
      if (membership?.status === 'approved') {
        json(res, 409, { error: 'This user is already a team member.' });
        return;
      }

      if (membership?.status === 'pending') {
        json(res, 409, { error: 'This user already has a pending join request.' });
        return;
      }

      const existingInvite = db.prepare(`
        SELECT id
        FROM team_invitations
        WHERE team_id = ?
          AND invite_type = 'email'
          AND invited_user_id = ?
          AND status = 'pending'
      `).get(teamId, invitedUser.id);

      if (existingInvite) {
        json(res, 409, { error: 'This user already has a pending invitation.' });
        return;
      }

      const invitationId = newId();
      db.prepare(`
        INSERT INTO team_invitations (
          id, team_id, invite_type, code, invited_email, invited_user_id, status,
          created_by_user_id, accepted_by_user_id, accepted_at, created_at, updated_at
        )
        VALUES (?, ?, 'email', NULL, ?, ?, 'pending', ?, NULL, NULL, ?, ?)
      `).run(invitationId, teamId, invitedUser.email, invitedUser.id, currentUser.id, timestamp, timestamp);

      json(res, 201, listTeamInvitations(teamId).find((invite) => invite.id === invitationId) || null);
      return;
    }

    json(res, 400, { error: 'invite_type must be code or email.' });
    return;
  }

  if (req.method === 'POST' && /^\/api\/teams\/[^/]+\/invitations\/[^/]+\/revoke$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const segments = url.pathname.split('/');
    const teamId = decodeURIComponent(segments[3]);
    const invitationId = decodeURIComponent(segments[5]);
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    const invitation = getTeamInvitationById(invitationId);
    if (!invitation || invitation.team_id !== teamId) {
      json(res, 404, { error: 'Invitation not found.' });
      return;
    }

    db.prepare(`
      UPDATE team_invitations
      SET status = 'revoked', updated_at = ?
      WHERE id = ?
    `).run(now(), invitationId);

    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && /^\/api\/teams\/[^/]+\/members$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/members', '').replace('/api/teams/', ''));
    const team = getTeamById(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found.' });
      return;
    }

    if (!(team.owner_user_id === currentUser.id || isApprovedTeamMember(currentUser.id, teamId))) {
      json(res, 403, { error: 'You do not have access to this team.' });
      return;
    }

    json(res, 200, listTeamMembers(teamId));
    return;
  }

  if (req.method === 'POST' && /^\/api\/teams\/[^/]+\/join-requests$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/join-requests', '').replace('/api/teams/', ''));
    const team = getTeamById(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found.' });
      return;
    }

    const existingMembership = getTeamMembership(teamId, currentUser.id);
    const timestamp = now();

    if (existingMembership?.status === 'approved') {
      json(res, 409, { error: 'You are already a team member.' });
      return;
    }

    if (existingMembership?.status === 'pending') {
      json(res, 409, { error: 'Your join request is still pending.' });
      return;
    }

    if (existingMembership) {
      db.prepare('UPDATE team_members SET status = ?, updated_at = ? WHERE id = ?').run('pending', timestamp, existingMembership.id);
      json(res, 200, { ok: true });
      return;
    }

    db.prepare(`
      INSERT INTO team_members (id, team_id, user_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `).run(newId(), teamId, currentUser.id, timestamp, timestamp);

    json(res, 201, { ok: true });
    return;
  }

  if (req.method === 'GET' && /^\/api\/teams\/[^/]+\/join-requests$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/join-requests', '').replace('/api/teams/', ''));
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    json(res, 200, listTeamJoinRequests(teamId));
    return;
  }

  if (req.method === 'POST' && /^\/api\/teams\/[^/]+\/join-requests\/[^/]+\/approve$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const segments = url.pathname.split('/');
    const teamId = decodeURIComponent(segments[3]);
    const requestId = decodeURIComponent(segments[5]);
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    const membership = db.prepare('SELECT * FROM team_members WHERE id = ? AND team_id = ?').get(requestId, teamId);
    if (!membership) {
      json(res, 404, { error: 'Join request not found.' });
      return;
    }

    const team = getTeamById(teamId);
    const approvedCountRow = db
      .prepare("SELECT COUNT(*) AS count FROM team_members WHERE team_id = ? AND status = 'approved'")
      .get(teamId);
    const approvedCount = Number(approvedCountRow?.count ?? 0);
    const memberLimit = Number(team?.member_limit ?? 10);
    if (approvedCount >= memberLimit) {
      json(res, 409, { error: 'Team member limit reached.' });
      return;
    }

    db.prepare('UPDATE team_members SET status = ?, updated_at = ? WHERE id = ?').run('approved', now(), requestId);
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && /^\/api\/teams\/[^/]+\/join-requests\/[^/]+\/reject$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const segments = url.pathname.split('/');
    const teamId = decodeURIComponent(segments[3]);
    const requestId = decodeURIComponent(segments[5]);
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    const membership = db.prepare('SELECT * FROM team_members WHERE id = ? AND team_id = ?').get(requestId, teamId);
    if (!membership) {
      json(res, 404, { error: 'Join request not found.' });
      return;
    }

    db.prepare('UPDATE team_members SET status = ?, updated_at = ? WHERE id = ?').run('rejected', now(), requestId);
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/team-invitations/mine') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    json(res, 200, listPendingInvitationsForUser(currentUser.id, currentUser.email));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/team-invitations/accept-by-code') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const code = String(body.code || '').trim().toUpperCase();
    if (!code) {
      json(res, 400, { error: 'Invitation code is required.' });
      return;
    }

    const invitation = getPendingTeamInvitationByCode(code);
    if (!invitation) {
      json(res, 404, { error: 'Invitation code not found or expired.' });
      return;
    }

    const team = getTeamById(invitation.team_id);
    if (!team) {
      json(res, 404, { error: 'Team not found.' });
      return;
    }

    if (team.owner_user_id === currentUser.id || isApprovedTeamMember(currentUser.id, team.id)) {
      json(res, 200, { ok: true, team: serializeTeamForUser(team, currentUser.id) });
      return;
    }

    if (!hasAvailableTeamSeat(team.id)) {
      json(res, 409, { error: 'Team member limit reached.' });
      return;
    }

    approveMembership(team.id, currentUser.id);
    json(res, 200, { ok: true, team: serializeTeamForUser(getTeamById(team.id), currentUser.id) });
    return;
  }

  if (req.method === 'POST' && /^\/api\/team-invitations\/[^/]+\/accept$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const invitationId = decodeURIComponent(url.pathname.split('/')[3]);
    const invitation = getTeamInvitationById(invitationId);
    if (!invitation || invitation.invite_type !== 'email' || invitation.status !== 'pending') {
      json(res, 404, { error: 'Invitation not found.' });
      return;
    }

    if (!(invitation.invited_user_id === currentUser.id || invitation.invited_email === currentUser.email)) {
      json(res, 403, { error: 'You do not have access to this invitation.' });
      return;
    }

    const team = getTeamById(invitation.team_id);
    if (!team) {
      json(res, 404, { error: 'Team not found.' });
      return;
    }

    if (team.owner_user_id === currentUser.id || isApprovedTeamMember(currentUser.id, team.id)) {
      db.prepare(`
        UPDATE team_invitations
        SET status = 'accepted', accepted_by_user_id = ?, accepted_at = ?, updated_at = ?
        WHERE id = ?
      `).run(currentUser.id, now(), now(), invitation.id);

      json(res, 200, { ok: true, team: serializeTeamForUser(team, currentUser.id) });
      return;
    }

    if (!hasAvailableTeamSeat(team.id)) {
      json(res, 409, { error: 'Team member limit reached.' });
      return;
    }

    approveMembership(team.id, currentUser.id);
    db.prepare(`
      UPDATE team_invitations
      SET status = 'accepted', accepted_by_user_id = ?, accepted_at = ?, updated_at = ?
      WHERE id = ?
    `).run(currentUser.id, now(), now(), invitation.id);

    json(res, 200, { ok: true, team: serializeTeamForUser(getTeamById(team.id), currentUser.id) });
    return;
  }

  if (req.method === 'POST' && /^\/api\/team-invitations\/[^/]+\/reject$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const invitationId = decodeURIComponent(url.pathname.split('/')[3]);
    const invitation = getTeamInvitationById(invitationId);
    if (!invitation || invitation.invite_type !== 'email' || invitation.status !== 'pending') {
      json(res, 404, { error: 'Invitation not found.' });
      return;
    }

    if (!(invitation.invited_user_id === currentUser.id || invitation.invited_email === currentUser.email)) {
      json(res, 403, { error: 'You do not have access to this invitation.' });
      return;
    }

    db.prepare(`
      UPDATE team_invitations
      SET status = 'declined', updated_at = ?
      WHERE id = ?
    `).run(now(), invitation.id);

    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/notifications/mine') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    json(res, 200, listNotificationsForUser(currentUser.id));
    return;
  }

  if (req.method === 'PATCH' && /^\/api\/notifications\/[^/]+\/read$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const notificationId = decodeURIComponent(url.pathname.split('/')[3]);
    const notification = getNotificationById(notificationId);
    if (!notification || notification.user_id !== currentUser.id) {
      json(res, 404, { error: 'Notification not found.' });
      return;
    }

    db.prepare('UPDATE user_notifications SET is_read = 1, updated_at = ? WHERE id = ?').run(now(), notificationId);
    json(res, 200, getNotificationById(notificationId));
    return;
  }

  if (req.method === 'GET' && /^\/api\/teams\/[^/]+\/resource-permissions$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/resource-permissions', '').replace('/api/teams/', ''));
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    const resourceType = String(url.searchParams.get('resourceType') || '').trim();
    const resourceId = String(url.searchParams.get('resourceId') || '').trim();
    if (!RESOURCE_TYPES.has(resourceType) || !resourceId) {
      json(res, 400, { error: 'resourceType and resourceId are required.' });
      return;
    }

    json(res, 200, listResourcePermissions(teamId, resourceType, resourceId, String(url.searchParams.get('query') || '')));
    return;
  }

  if (req.method === 'PUT' && /^\/api\/teams\/[^/]+\/resource-permissions\/batch$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const teamId = decodeURIComponent(url.pathname.replace('/resource-permissions/batch', '').replace('/api/teams/', ''));
    if (!ensureTeamOwner(res, currentUser.id, teamId)) return;

    const body = await readJsonBody(req);
    const resourceType = String(body.resource_type || '').trim();
    const resourceId = String(body.resource_id || '').trim();
    const entries = Array.isArray(body.entries) ? body.entries : [];

    if (!RESOURCE_TYPES.has(resourceType) || !resourceId) {
      json(res, 400, { error: 'resource_type and resource_id are required.' });
      return;
    }

    const timestamp = now();
    db.prepare('DELETE FROM resource_permissions WHERE team_id = ? AND resource_type = ? AND resource_id = ?').run(teamId, resourceType, resourceId);

    const insert = db.prepare(`
      INSERT INTO resource_permissions (
        id, team_id, resource_type, resource_id, member_user_id, can_view, can_edit, can_delete, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const entry of entries) {
      const memberUserId = sanitizeNullable(entry.member_user_id);
      if (!memberUserId) continue;

      const membership = getTeamMembership(teamId, memberUserId);
      if (!membership || membership.status !== 'approved') continue;

      const canView = Number(Boolean(entry.can_view));
      const canEdit = Number(Boolean(entry.can_edit));
      const canDelete = Number(Boolean(entry.can_delete));
      if (!canView && !canEdit && !canDelete) continue;

      insert.run(newId(), teamId, resourceType, resourceId, memberUserId, canView, canEdit, canDelete, timestamp, timestamp);
    }

    json(res, 200, listResourcePermissions(teamId, resourceType, resourceId));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/public/documents') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const requestedTeamId = normalizeRequestedTeamId(url.searchParams.get('teamId'));
    if (requestedTeamId && !isTeamOwner(currentUser.id, requestedTeamId) && !isApprovedTeamMember(currentUser.id, requestedTeamId)) {
      json(res, 403, { error: 'You do not have access to this workspace.' });
      return;
    }

    json(res, 200, listPublicDocuments(requestedTeamId));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/public/files') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const requestedTeamId = normalizeRequestedTeamId(url.searchParams.get('teamId'));
    if (requestedTeamId && !isTeamOwner(currentUser.id, requestedTeamId) && !isApprovedTeamMember(currentUser.id, requestedTeamId)) {
      json(res, 403, { error: 'You do not have access to this workspace.' });
      return;
    }

    json(res, 200, listPublicFiles(requestedTeamId));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/documents') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const documents = listDocuments(url.searchParams.get('includeDeleted') === 'true').filter((document) =>
      canViewDocument(currentUser.id, document),
    );
    json(res, 200, documents);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/documents/starred') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const rows = db.prepare('SELECT * FROM documents WHERE is_starred = 1 AND is_deleted = 0 ORDER BY updated_at DESC').all();
    json(res, 200, rows.map(documentRowToModel).filter((document) => canViewDocument(currentUser.id, document)));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/documents/trash') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const rows = db.prepare('SELECT * FROM documents WHERE is_deleted = 1 ORDER BY updated_at DESC').all();
    json(res, 200, rows.map(documentRowToModel).filter((document) => canViewDocument(currentUser.id, document)));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/documents/recent') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const limit = Number(url.searchParams.get('limit') || 10);
    const rows = db.prepare('SELECT * FROM documents WHERE is_deleted = 0 ORDER BY updated_at DESC LIMIT ?').all(limit);
    json(res, 200, rows.map(documentRowToModel).filter((document) => canViewDocument(currentUser.id, document)));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/documents/search') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const query = `%${String(url.searchParams.get('q') || '').trim()}%`;
    const rows = db.prepare(`
      SELECT * FROM documents
      WHERE is_deleted = 0 AND (title LIKE ? OR content LIKE ?)
      ORDER BY updated_at DESC
    `).all(query, query);
    json(res, 200, rows.map(documentRowToModel).filter((document) => canViewDocument(currentUser.id, document)));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/documents') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const timestamp = now();
    const id = newId();
    const parentId = sanitizeNullable(body.parent_id);
    const teamId = sanitizeNullable(body.team_id);
    const parentDocument = parentId ? getDocumentById(parentId) : null;
    const orderIndex = body.order_index ?? getNextOrderIndex('documents', 'parent_id', parentId);

    if (teamId && !isTeamOwner(currentUser.id, teamId)) {
      json(res, 403, { error: 'Only the team owner can create documents directly in this team.' });
      return;
    }

    if (parentId && !parentDocument) {
      json(res, 404, { error: 'Parent document not found.' });
      return;
    }

    if (parentDocument && parentDocument.icon !== 'folder') {
      json(res, 400, { error: 'Parent document must be a folder.' });
      return;
    }

    if (parentDocument && !canEditDocument(currentUser.id, parentDocument)) {
      json(res, 403, { error: 'You do not have permission to use this parent folder.' });
      return;
    }

    if (parentDocument && sanitizeNullable(parentDocument.team_id) !== teamId) {
      json(res, 400, { error: 'Document team must match the parent folder team.' });
      return;
    }

    db.prepare(`
      INSERT INTO documents (id, title, content, parent_id, icon, created_at, updated_at, user_id, team_id, is_starred, order_index, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.title || 'Untitled',
      body.content || '<p></p>',
      parentId,
      body.icon || 'file',
      timestamp,
      timestamp,
      currentUser.id,
      teamId,
      Number(Boolean(body.is_starred)),
      orderIndex,
      Number(Boolean(body.is_deleted)),
    );

    json(res, 201, getDocumentById(id));
    return;
  }

  if (req.method === 'GET' && /^\/api\/documents\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const document = getDocumentById(decodeURIComponent(url.pathname.replace('/api/documents/', '')));
    if (!document) {
      json(res, 404, { error: 'Document not found.' });
      return;
    }
    if (!canViewDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to view this document.' });
      return;
    }
    json(res, 200, document);
    return;
  }

  if (req.method === 'PATCH' && /^\/api\/documents\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/documents/', ''));
    const existing = getDocumentById(id);
    if (!existing) {
      json(res, 404, { error: 'Document not found.' });
      return;
    }
    if (!canEditDocument(currentUser.id, existing)) {
      json(res, 403, { error: 'You do not have permission to edit this document.' });
      return;
    }

    const body = await readJsonBody(req);
    const nextTeamId =
      body.team_id !== undefined
        ? sanitizeNullable(body.team_id)
        : existing.team_id;
    const nextParentId =
      body.parent_id !== undefined
        ? sanitizeNullable(body.parent_id)
        : existing.parent_id;
    const nextParentDocument = nextParentId ? getDocumentById(nextParentId) : null;

    if (body.team_id !== undefined && existing.user_id !== currentUser.id) {
      json(res, 403, { error: 'Only the owner can change the document team.' });
      return;
    }

    if (nextTeamId && existing.user_id === currentUser.id && !isTeamOwner(currentUser.id, nextTeamId)) {
      json(res, 403, { error: 'Only the team owner can assign a document to this team.' });
      return;
    }

    if (nextParentId && !nextParentDocument) {
      json(res, 404, { error: 'Parent document not found.' });
      return;
    }

    if (nextParentDocument && nextParentDocument.id === existing.id) {
      json(res, 400, { error: 'A document cannot be its own parent.' });
      return;
    }

    if (nextParentDocument && nextParentDocument.icon !== 'folder') {
      json(res, 400, { error: 'Parent document must be a folder.' });
      return;
    }

    if (nextParentDocument && !canEditDocument(currentUser.id, nextParentDocument)) {
      json(res, 403, { error: 'You do not have permission to use this parent folder.' });
      return;
    }

    if (nextParentDocument && sanitizeNullable(nextParentDocument.team_id) !== nextTeamId) {
      json(res, 400, { error: 'Document team must match the parent folder team.' });
      return;
    }

    db.prepare(`
      UPDATE documents
      SET title = ?, content = ?, parent_id = ?, icon = ?, user_id = ?, team_id = ?, is_starred = ?, order_index = ?, is_deleted = ?, updated_at = ?
      WHERE id = ?
    `).run(
      body.title ?? existing.title,
      body.content ?? existing.content,
      nextParentId,
      body.icon ?? existing.icon,
      existing.user_id,
      nextTeamId,
      body.is_starred !== undefined ? Number(Boolean(body.is_starred)) : Number(existing.is_starred),
      body.order_index ?? existing.order_index,
      body.is_deleted !== undefined ? Number(Boolean(body.is_deleted)) : Number(existing.is_deleted),
      now(),
      id,
    );

    json(res, 200, getDocumentById(id));
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/documents\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/documents/', ''));
    const existing = getDocumentById(id);
    if (!existing) {
      json(res, 404, { error: 'Document not found.' });
      return;
    }
    if (!canDeleteDocument(currentUser.id, existing)) {
      json(res, 403, { error: 'You do not have permission to delete this document.' });
      return;
    }

    if (url.searchParams.get('permanent') === 'true') {
      deleteDocumentRecursive(id);
    } else {
      db.prepare('UPDATE documents SET is_deleted = 1, updated_at = ? WHERE id = ?').run(now(), id);
    }

    sendEmpty(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/comments') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const documentId = url.searchParams.get('documentId');
    if (!documentId) {
      json(res, 400, { error: 'documentId is required.' });
      return;
    }
    const document = getDocumentById(documentId);
    if (!document || !canViewDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to view comments for this document.' });
      return;
    }
    json(res, 200, listComments(documentId));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/comments') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const document = getDocumentById(body.document_id);
    if (!document || !canEditDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to add comments to this document.' });
      return;
    }
    const timestamp = now();
    const id = newId();

    db.prepare(`
      INSERT INTO comments (id, document_id, parent_id, content, created_at, updated_at, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.document_id,
      sanitizeNullable(body.parent_id),
      body.content || '',
      timestamp,
      timestamp,
      currentUser.id,
    );

    const created = db.prepare(`
      SELECT
        c.*,
        u.id AS user_ref_id,
        u.email AS user_email,
        u.nickname AS user_nickname,
        u.avatar_url AS user_avatar_url,
        u.created_at AS user_created_at,
        u.updated_at AS user_updated_at
      FROM comments c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE c.id = ?
    `).get(id);

    json(res, 201, commentRowToModel(created));
    return;
  }

  if (req.method === 'PATCH' && /^\/api\/comments\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/comments/', ''));
    const body = await readJsonBody(req);
    const existingComment = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    if (!existingComment) {
      json(res, 404, { error: 'Comment not found.' });
      return;
    }
    const document = getDocumentById(existingComment.document_id);
    if (!document || !canEditDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to edit comments for this document.' });
      return;
    }
    db.prepare('UPDATE comments SET content = ?, updated_at = ? WHERE id = ?').run(body.content || '', now(), id);
    const updated = db.prepare(`
      SELECT
        c.*,
        u.id AS user_ref_id,
        u.email AS user_email,
        u.nickname AS user_nickname,
        u.avatar_url AS user_avatar_url,
        u.created_at AS user_created_at,
        u.updated_at AS user_updated_at
      FROM comments c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE c.id = ?
    `).get(id);
    json(res, 200, commentRowToModel(updated));
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/comments\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/comments/', ''));
    const existingComment = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    if (!existingComment) {
      json(res, 404, { error: 'Comment not found.' });
      return;
    }
    const document = getDocumentById(existingComment.document_id);
    if (!document || !canEditDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to delete comments for this document.' });
      return;
    }
    db.prepare('DELETE FROM comments WHERE parent_id = ?').run(id);
    db.prepare('DELETE FROM comments WHERE id = ?').run(id);
    sendEmpty(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/todos') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const documentId = url.searchParams.get('documentId');
    if (!documentId) {
      json(res, 400, { error: 'documentId is required.' });
      return;
    }
    const document = getDocumentById(documentId);
    if (!document || !canViewDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to view todos for this document.' });
      return;
    }
    json(res, 200, listTodos(documentId));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/todos') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const document = getDocumentById(body.document_id);
    if (!document || !canEditDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to add todos to this document.' });
      return;
    }
    const timestamp = now();
    const id = newId();
    const orderIndex = body.order_index ?? getNextOrderIndex('todos', 'document_id', body.document_id);

    db.prepare(`
      INSERT INTO todos (id, document_id, content, status, priority, due_date, tags, created_at, updated_at, user_id, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.document_id,
      body.content || '',
      body.status || 'pending',
      body.priority || 'medium',
      sanitizeNullable(body.due_date),
      JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
      timestamp,
      timestamp,
      currentUser.id,
      orderIndex,
    );

    json(res, 201, todoRowToModel(db.prepare('SELECT * FROM todos WHERE id = ?').get(id)));
    return;
  }

  if (req.method === 'GET' && /^\/api\/todos\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/todos/', ''));
    const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    if (!todo) {
      json(res, 404, { error: 'Todo not found.' });
      return;
    }
    const document = getDocumentById(todo.document_id);
    if (!document || !canViewDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to view this todo.' });
      return;
    }
    json(res, 200, todoRowToModel(todo));
    return;
  }

  if (req.method === 'PATCH' && /^\/api\/todos\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/todos/', ''));
    const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    if (!existing) {
      json(res, 404, { error: 'Todo not found.' });
      return;
    }
    const document = getDocumentById(existing.document_id);
    if (!document || !canEditDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to edit this todo.' });
      return;
    }

    const body = await readJsonBody(req);
    db.prepare(`
      UPDATE todos
      SET content = ?, status = ?, priority = ?, due_date = ?, tags = ?, updated_at = ?, user_id = ?, order_index = ?
      WHERE id = ?
    `).run(
      body.content ?? existing.content,
      body.status ?? existing.status,
      body.priority ?? existing.priority,
      body.due_date !== undefined ? sanitizeNullable(body.due_date) : existing.due_date,
      body.tags !== undefined ? JSON.stringify(Array.isArray(body.tags) ? body.tags : []) : existing.tags,
      now(),
      body.user_id !== undefined ? sanitizeNullable(body.user_id) : existing.user_id,
      body.order_index ?? existing.order_index,
      id,
    );

    json(res, 200, todoRowToModel(db.prepare('SELECT * FROM todos WHERE id = ?').get(id)));
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/todos\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/todos/', ''));
    const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    if (!existing) {
      json(res, 404, { error: 'Todo not found.' });
      return;
    }
    const document = getDocumentById(existing.document_id);
    if (!document || !canEditDocument(currentUser.id, document)) {
      json(res, 403, { error: 'You do not have permission to delete this todo.' });
      return;
    }
    db.prepare('DELETE FROM todos WHERE id = ?').run(id);
    sendEmpty(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/folders') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const requestedTeamId = normalizeRequestedTeamId(url.searchParams.get('teamId'));
    const hasWorkspaceFilter = url.searchParams.has('teamId');
    const rows = db.prepare('SELECT * FROM folders ORDER BY order_index, created_at').all();
    json(
      res,
      200,
      rows.filter((folder) => {
        if (!canAccessFolder(currentUser.id, folder)) {
          return false;
        }

        if (!hasWorkspaceFilter) {
          return true;
        }

        return sanitizeNullable(folder.team_id) === requestedTeamId;
      }),
    );
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/folders') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const timestamp = now();
    const id = newId();
    const parentId = sanitizeNullable(body.parent_id);
    const teamId = sanitizeNullable(body.team_id);
    const parentFolder = parentId ? getFolderById(parentId) : null;

    if (teamId && !isTeamOwner(currentUser.id, teamId)) {
      json(res, 403, { error: 'Only the team owner can create folders directly in this team.' });
      return;
    }

    if (parentId && !parentFolder) {
      json(res, 404, { error: 'Parent folder not found.' });
      return;
    }

    if (parentFolder && !canAccessFolder(currentUser.id, parentFolder)) {
      json(res, 403, { error: 'You do not have permission to use this folder.' });
      return;
    }

    if (parentFolder && sanitizeNullable(parentFolder.team_id) !== teamId) {
      json(res, 400, { error: 'Folder team must match the parent folder team.' });
      return;
    }

    const orderIndex = body.order_index ?? getNextOrderIndex('folders', 'parent_id', parentId);

    db.prepare(`
      INSERT INTO folders (id, name, parent_id, icon, created_at, updated_at, user_id, team_id, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.name || 'New Folder',
      parentId,
      body.icon || 'folder',
      timestamp,
      timestamp,
      currentUser.id,
      teamId,
      orderIndex,
    );

    json(res, 201, db.prepare('SELECT * FROM folders WHERE id = ?').get(id));
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/folders\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/folders/', ''));
    const folder = getFolderById(id);
    if (!folder) {
      json(res, 404, { error: 'Folder not found.' });
      return;
    }

    if (!canManageFolder(currentUser.id, folder)) {
      json(res, 403, { error: 'You do not have permission to delete this folder.' });
      return;
    }

    const folderIds = collectDescendantFolderIds(id);
    const files = listFilesInFolders(folderIds);

    await deleteFileRecords(files);

    folderIds
      .slice()
      .reverse()
      .forEach((folderId) => {
        db.prepare('DELETE FROM folders WHERE id = ?').run(folderId);
      });

    sendEmpty(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/files') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const requestedTeamId = normalizeRequestedTeamId(url.searchParams.get('teamId'));
    const hasWorkspaceFilter = url.searchParams.has('teamId');
    const matchesRequestedWorkspace = (file) =>
      !hasWorkspaceFilter || sanitizeNullable(file.team_id) === requestedTeamId;

    if (url.searchParams.get('scope') === 'all') {
      const rows = db.prepare('SELECT * FROM files ORDER BY created_at DESC').all();
      json(
        res,
        200,
        rows
          .map(fileRowToModel)
          .filter((file) => file && canViewFile(currentUser.id, file) && matchesRequestedWorkspace(file)),
      );
      return;
    }

    const folderId = sanitizeNullable(url.searchParams.get('folderId'));
    json(
      res,
      200,
      listFiles(folderId).filter((file) => canViewFile(currentUser.id, file) && matchesRequestedWorkspace(file)),
    );
    return;
  }

  if (req.method === 'GET' && /^\/api\/files\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/files/', ''));
    const file = getFileById(id);
    if (!file) {
      json(res, 404, { error: 'File not found.' });
      return;
    }
    if (!canViewFile(currentUser.id, file)) {
      json(res, 403, { error: 'You do not have permission to view this file.' });
      return;
    }
    json(res, 200, file);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/files/upload') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const name = String(url.searchParams.get('name') || 'file.bin');
    const mimeType = String(url.searchParams.get('mimeType') || 'application/octet-stream');
    const folderId = sanitizeNullable(url.searchParams.get('folderId'));
    const teamId = normalizeRequestedTeamId(url.searchParams.get('teamId'));
    const folder = folderId ? getFolderById(folderId) : null;
    const fileType = getFileType(name, mimeType);
    const dateFolder = new Date().toISOString().slice(0, 10);
    const storedFileName = `${Date.now()}-${newId()}${path.extname(name)}`;
    const workspaceScope = buildWorkspaceStorageScope(teamId);
    const relativePath = path.posix.join(workspaceScope, dateFolder, fileType, storedFileName);
    const fullPath = path.join(FILES_DIR, ...relativePath.split('/'));

    if (teamId && !isTeamOwner(currentUser.id, teamId)) {
      json(res, 403, { error: 'Only the team owner can upload files directly in this team.' });
      return;
    }

    if (folderId && !folder) {
      json(res, 404, { error: 'Folder not found.' });
      return;
    }

    if (folder && !canAccessFolder(currentUser.id, folder)) {
      json(res, 403, { error: 'You do not have permission to use this folder.' });
      return;
    }

    if (folder && sanitizeNullable(folder.team_id) !== teamId) {
      json(res, 400, { error: 'Upload workspace must match the target folder team.' });
      return;
    }

    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, await readRequestBuffer(req));

    const publicPath = `/uploads/${relativePath}`;
    json(res, 200, {
      url: publicPath,
      path: relativePath,
      thumbnailUrl: fileType === 'image' ? publicPath : null,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/files') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const timestamp = now();
    const id = newId();
    const fileType = body.type || getFileType(body.name || '', '');
    const fileUrl = body.url || `/uploads/${body.storage_path}`;
    const folderId = sanitizeNullable(body.folder_id);
    const teamId = sanitizeNullable(body.team_id);
    const folder = folderId ? getFolderById(folderId) : null;

    if (teamId && !isTeamOwner(currentUser.id, teamId)) {
      json(res, 403, { error: 'Only the team owner can create files directly in this team.' });
      return;
    }

    if (folderId && !folder) {
      json(res, 404, { error: 'Folder not found.' });
      return;
    }

    if (folder && !canAccessFolder(currentUser.id, folder)) {
      json(res, 403, { error: 'You do not have permission to use this folder.' });
      return;
    }

    if (folder && sanitizeNullable(folder.team_id) !== teamId) {
      json(res, 400, { error: 'File team must match the target folder team.' });
      return;
    }

    db.prepare(`
      INSERT INTO files (id, name, type, size, url, thumbnail_url, storage_path, folder_id, created_at, updated_at, user_id, team_id, is_starred)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.name,
      fileType,
      Number(body.size || 0),
      fileUrl,
      body.thumbnail_url ?? (fileType === 'image' ? fileUrl : null),
      body.storage_path,
      folderId,
      timestamp,
      timestamp,
      currentUser.id,
      teamId,
      Number(Boolean(body.is_starred)),
    );

    json(res, 201, getFileById(id));
    return;
  }

  if (req.method === 'PATCH' && /^\/api\/files\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/files/', ''));
    const existing = getFileById(id);
    if (!existing) {
      json(res, 404, { error: 'File not found.' });
      return;
    }
    if (!canEditFile(currentUser.id, existing)) {
      json(res, 403, { error: 'You do not have permission to edit this file.' });
      return;
    }

    const body = await readJsonBody(req);
    const nextFolderId =
      body.folder_id !== undefined
        ? sanitizeNullable(body.folder_id)
        : existing.folder_id;
    const nextTeamId =
      body.team_id !== undefined
        ? sanitizeNullable(body.team_id)
        : existing.team_id;
    const nextFolder = nextFolderId ? getFolderById(nextFolderId) : null;

    if (body.team_id !== undefined && existing.user_id !== currentUser.id) {
      json(res, 403, { error: 'Only the owner can change the file team.' });
      return;
    }

    if (nextTeamId && existing.user_id === currentUser.id && !isTeamOwner(currentUser.id, nextTeamId)) {
      json(res, 403, { error: 'Only the team owner can assign a file to this team.' });
      return;
    }

    if (nextFolderId && !nextFolder) {
      json(res, 404, { error: 'Folder not found.' });
      return;
    }

    if (nextFolder && !canAccessFolder(currentUser.id, nextFolder)) {
      json(res, 403, { error: 'You do not have permission to use this folder.' });
      return;
    }

    if (nextFolder && sanitizeNullable(nextFolder.team_id) !== nextTeamId) {
      json(res, 400, { error: 'File team must match the target folder team.' });
      return;
    }

    db.prepare(`
      UPDATE files
      SET name = ?, folder_id = ?, team_id = ?, is_starred = ?, updated_at = ?
      WHERE id = ?
    `).run(
      body.name ?? existing.name,
      nextFolderId,
      nextTeamId,
      body.is_starred !== undefined ? Number(Boolean(body.is_starred)) : Number(existing.is_starred),
      now(),
      id,
    );

    json(res, 200, getFileById(id));
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/files\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/files/', ''));
    const file = getFileById(id);
    if (!file) {
      json(res, 404, { error: 'File not found.' });
      return;
    }
    if (!canDeleteFile(currentUser.id, file)) {
      json(res, 403, { error: 'You do not have permission to delete this file.' });
      return;
    }

    await deleteFileRecords([file]);
    sendEmpty(res);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/share-links') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const documentId = sanitizeNullable(url.searchParams.get('documentId'));
    const fileId = sanitizeNullable(url.searchParams.get('fileId'));
    let rows = listShareLinks(documentId);

    if (fileId) {
      rows = db.prepare('SELECT * FROM share_links WHERE file_id = ? ORDER BY created_at DESC').all(fileId).map(shareLinkRowToModel);
    }

    const filtered = rows.filter((row) => row.user_id === currentUser.id);

    json(res, 200, filtered);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/share-links') {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const body = await readJsonBody(req);
    const timestamp = now();
    const documentId = sanitizeNullable(body.document_id);
    const fileId = sanitizeNullable(body.file_id);
    const visibility = normalizeShareVisibility(body.visibility || 'link');
    const requestedTeamId = sanitizeNullable(body.team_id);
    const password = String(body.password || '').trim();

    if (!documentId && !fileId) {
      json(res, 400, { error: 'document_id or file_id is required.' });
      return;
    }

    if (documentId && fileId) {
      json(res, 400, { error: 'Only one resource can be shared at a time.' });
      return;
    }

    if (!['private', 'space', 'link'].includes(visibility)) {
      json(res, 400, { error: 'Share visibility is invalid.' });
      return;
    }

    const resourceType = documentId ? 'document' : 'file';
    const resource = documentId ? getDocumentById(documentId) : getFileById(fileId);
    if (!resource) {
      json(res, 404, { error: 'Shared resource not found.' });
      return;
    }

    if (!canCreateShareLink(currentUser.id, resourceType, resource, visibility)) {
      json(res, 403, { error: 'You do not have permission to create this share.' });
      return;
    }

    let teamId = null;

    if (visibility === 'space') {
      teamId = requestedTeamId;
      if (!teamId) {
        json(res, 400, { error: 'A workspace must be selected for space sharing.' });
        return;
      }

      if (!canShareResourceToSpace(currentUser.id, resource, teamId)) {
        json(res, 403, { error: 'You cannot share this resource to the selected workspace.' });
        return;
      }

      const existingSpaceShare = documentId
        ? db.prepare(`
            SELECT * FROM share_links
            WHERE document_id = ? AND team_id = ? AND user_id = ? AND visibility IN ('space', 'team')
            ORDER BY created_at DESC
            LIMIT 1
          `).get(documentId, teamId, currentUser.id)
        : db.prepare(`
            SELECT * FROM share_links
            WHERE file_id = ? AND team_id = ? AND user_id = ? AND visibility IN ('space', 'team')
            ORDER BY created_at DESC
            LIMIT 1
          `).get(fileId, teamId, currentUser.id);

      if (existingSpaceShare) {
        json(res, 200, shareLinkRowToModel(existingSpaceShare));
        return;
      }
    }

    const id = newId();
    const shareToken = newId().replace(/-/g, '');

    db.prepare(`
      INSERT INTO share_links (id, document_id, file_id, team_id, share_token, visibility, expires_at, created_at, user_id, password_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      documentId,
      fileId,
      teamId,
      shareToken,
      visibility,
      sanitizeNullable(body.expires_at),
      timestamp,
      currentUser.id,
      visibility === 'link' && password ? hashPassword(password) : null,
    );

    json(res, 201, getShareLinkById(id));
    return;
  }

  if (req.method === 'GET' && /^\/api\/share-links\/token\/[^/]+$/.test(url.pathname)) {
    const token = decodeURIComponent(url.pathname.replace('/api/share-links/token/', ''));
    const link = getShareLinkByToken(token);
    if (!link) {
      json(res, 404, { error: 'Share link not found.' });
      return;
    }

    json(res, 200, link);
    return;
  }

  if ((req.method === 'GET' || req.method === 'POST') && /^\/api\/share-links\/token\/[^/]+\/content$/.test(url.pathname)) {
    const token = decodeURIComponent(url.pathname.replace('/api/share-links/token/', '').replace('/content', ''));
    const rawLink = getShareLinkRowByToken(token);
    if (!rawLink) {
      json(res, 404, { error: 'Share link not found.' });
      return;
    }

    const body = req.method === 'POST' ? await readJsonBody(req) : null;
    const payload = resolveSharePayload(rawLink);
    const access = canAccessShareLink(getCurrentUserId(req), rawLink, payload, sanitizeNullable(body?.password));
    if (!access.allowed) {
      json(res, access.status, { error: access.message });
      return;
    }

    const link = shareLinkRowToModel(rawLink);
    json(res, 200, {
      link,
      document: payload?.type === 'document' ? serializeSharedDocument(req, payload.resource) : null,
      file: payload?.type === 'file' ? serializeSharedFile(req, payload.resource) : null,
      team: link.team_id ? getTeamById(link.team_id) : null,
    });
    return;
  }

  if (req.method === 'POST' && /^\/api\/share-links\/token\/[^/]+\/save$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const token = decodeURIComponent(url.pathname.replace('/api/share-links/token/', '').replace('/save', ''));
    const rawLink = getShareLinkRowByToken(token);
    if (!rawLink) {
      json(res, 404, { error: 'Share link not found.' });
      return;
    }

    const body = await readJsonBody(req);
    const payload = resolveSharePayload(rawLink);
    const access = canAccessShareLink(currentUser.id, rawLink, payload, sanitizeNullable(body?.password));
    if (!access.allowed) {
      json(res, access.status, { error: access.message });
      return;
    }

    try {
      if (payload?.type === 'document' && payload.resource) {
        const targetParentId = resolvePersonalDocumentTarget(currentUser.id, body.target_document_parent_id);
        const savedDocument = copyDocumentSubtreeToUser(payload.resource.id, currentUser.id, targetParentId);
        json(res, 201, { ok: true, document: savedDocument });
        return;
      }

      if (payload?.type === 'file' && payload.resource) {
        const targetFolderId = resolvePersonalFileTarget(currentUser.id, body.target_file_folder_id);
        const savedFile = await copyFileToUser(payload.resource, currentUser.id, targetFolderId);
        json(res, 201, { ok: true, file: savedFile });
        return;
      }

      json(res, 404, { error: 'Shared resource not found.' });
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : 'Failed to save shared resource.' });
    }
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/share-links\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireAuth(req, res);
    if (!currentUser) return;

    const id = decodeURIComponent(url.pathname.replace('/api/share-links/', ''));
    const existing = getShareLinkRowById(id);
    if (!existing) {
      json(res, 404, { error: 'Share link not found.' });
      return;
    }

    const payload = resolveSharePayload(existing);
    if (existing.user_id !== currentUser.id) {
      json(res, 403, { error: 'Only the share creator can delete this share.' });
      return;
    }

    db.prepare('DELETE FROM share_links WHERE id = ?').run(id);
    sendEmpty(res);
    return;
  }

  json(res, 501, { error: 'Route not implemented yet.' });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

    if (url.pathname.startsWith('/uploads/')) {
      await handleUploads(res, url);
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    await handleFrontend(req, res, url);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: error instanceof Error ? error.message : 'Internal server error.' });
  }
});

server.listen(API_PORT, SERVER_HOST, () => {
  console.log(`Yuque local API server listening on http://${SERVER_HOST}:${API_PORT}`);
  console.log(`Local access: http://127.0.0.1:${API_PORT}`);
  console.log(`Static assets: ${DIST_DIR}`);
  console.log(`SQLite database: ${DB_PATH}`);
  console.log(`File storage root: ${FILES_DIR}`);
  console.log(`Data directory: ${DATA_DIR}`);
});

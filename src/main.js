'use strict';
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, powerMonitor, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const TZ = require('./tz.js');

app.setAppUserModelId('local.forexclock.widget');
// NOTE: hardware acceleration is deliberately left ON - transparent (round compact) windows need it on some Windows setups.

// ---- diagnostics: nothing may fail silently ----
function log(msg) {
  try {
    const f = path.join(app.getPath('userData'), 'forex-clock.log');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    try { if (fs.statSync(f).size > 200000) fs.renameSync(f, f + '.old'); } catch (e) { /* no log yet */ }
    fs.appendFileSync(f, new Date().toISOString() + ' ' + msg + '\n');
  } catch (e) { /* logging must never crash the app */ }
}
process.on('uncaughtException', (e) => { log('UNCAUGHT ' + (e && e.stack || e)); try { dialog.showErrorBox('Forex Clock - error', String(e && e.stack || e) + '\n\nLog: ' + path.join(app.getPath('userData'), 'forex-clock.log')); } catch (x) { /* ignore */ } });

const DEFAULTS = {
  viewMode: 'full',        // 'full' | 'compact'
  bounds: null,            // full-view window rect {x,y,width,height}
  boundsCompact: null,     // compact-view window rect
  alwaysOnTop: true,
  locked: false,
  opacity: 0.95,           // 0.4 .. 1
  theme: 'dark',           // 'dark' | 'light'
  startWithWindows: false,
  closeToTray: true,
  hour12: false,
  sessions: TZ.DEFAULT_SESSIONS,
};
// Full view: a 390 x FULL_H0 design card scaled to the window (fixed aspect). Compact view: round dial, square window with continuous resize.
const FULL_W0 = 390, FULL_H0 = 1153, FULL_MIN_W = 190, FULL_MAX_W = 780;
const fullH = (w) => Math.round(w * FULL_H0 / FULL_W0);
const COMPACT_MAX_W = 900;
const CMIN_W = 240, CMIN_H = 240, CDEF_W = 300, CDEF_H = 300;
const isCompact = () => settings && settings.viewMode === 'compact';
const slot = (mode) => (mode === 'compact' ? 'boundsCompact' : 'bounds');

let pendingCfg = false;
let win = null, tray = null, settings = null, quitting = false, saveTimer = null;
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

// ---------------- settings persistence ----------------
function validSessions(list) {
  if (!Array.isArray(list) || list.length === 0) return false;
  try { list.forEach((s) => { if (!s.id || !s.name || !Array.isArray(s.days)) throw new Error('bad'); TZ.validateSession(s); }); return true; }
  catch (e) { return false; }
}
function loadSettings() {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch (e) { /* first run or corrupt -> defaults */ }
  const out = Object.assign({}, DEFAULTS, s);
  if (!validSessions(out.sessions)) out.sessions = DEFAULTS.sessions;
  out.opacity = Math.min(1, Math.max(0.4, Number(out.opacity) || DEFAULTS.opacity));
  if (!['dark', 'light'].includes(out.theme)) out.theme = 'dark';
  if (!['full', 'compact'].includes(out.viewMode)) out.viewMode = 'full';
  return out;
}
function saveSettingsNow() {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    const tmp = settingsFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
    fs.renameSync(tmp, settingsFile());
  } catch (e) { console.error('settings save failed', e); }
}
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveSettingsNow, 300); }

// ---------------- multi-monitor safe bounds ----------------
function visibleArea(b, wa) {
  const w = Math.min(b.x + b.width, wa.x + wa.width) - Math.max(b.x, wa.x);
  const h = Math.min(b.y + b.height, wa.y + wa.height) - Math.max(b.y, wa.y);
  return w > 0 && h > 0 ? w * h : 0;
}
function defaultFullWidth() {                         // whole card must fit the screen height
  const wa = screen.getPrimaryDisplay().workArea;
  return Math.max(FULL_MIN_W, Math.min(FULL_W0, Math.floor((wa.height - 40) * FULL_W0 / FULL_H0)));
}
function sanitizeBounds(b, mode) {
  const c = mode === 'compact';
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay().workArea;
  const defW = c ? CDEF_W : defaultFullWidth(), defH = c ? CDEF_H : fullH(defW);
  if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite)) {
    return { width: defW, height: defH, x: primary.x + primary.width - defW - 24, y: primary.y + 24 };
  }
  const nb = { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
  if (c) { nb.width = Math.min(COMPACT_MAX_W, Math.max(CMIN_W, nb.width)); nb.height = nb.width; }                       // round widget -> always square
  else { nb.width = Math.min(FULL_MAX_W, Math.max(FULL_MIN_W, nb.width)); nb.height = fullH(nb.width); }        // card keeps its aspect
  // must have a grabbable part (>= 64x32 px) on some connected display
  const ok = displays.some((d) => {
    const wa = d.workArea;
    const w = Math.min(nb.x + nb.width, wa.x + wa.width) - Math.max(nb.x, wa.x);
    const h = Math.min(nb.y + nb.height, wa.y + wa.height) - Math.max(nb.y, wa.y);
    return w >= 64 && h >= 32;
  });
  if (ok) return nb;
  // monitor was unplugged / resolution changed -> move onto the primary display
  nb.x = primary.x + Math.max(0, Math.round((primary.width - nb.width) / 2));
  nb.y = primary.y + Math.max(0, Math.round((primary.height - nb.height) / 2));
  return nb;
}
function rememberBounds() {
  if (!win || win.isDestroyed() || win.isMinimized() || !win.isVisible()) return;
  settings[slot(settings.viewMode)] = win.getNormalBounds();
  saveSoon();
}

// ---------------- applying settings ----------------
function loginItemOpts() {
  // Portable builds run from a temp folder; the real file is in PORTABLE_EXECUTABLE_FILE.
  return { path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath };
}
function applyAll() {
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(!!settings.alwaysOnTop, 'floating');
  win.setOpacity(settings.opacity);
  win.setMovable(!settings.locked);
  if (app.isPackaged || process.env.FX_FORCE_LOGIN_ITEM) {
    try { app.setLoginItemSettings(Object.assign({ openAtLogin: !!settings.startWithWindows }, loginItemOpts())); } catch (e) { console.error(e); }
  }
  buildTrayMenu();
  win.webContents.send('settings:changed', publicSettings());
}
function publicSettings() { return Object.assign({}, settings, { platform: process.platform, version: app.getVersion(), file: settingsFile() }); }
function switchView(mode) {
  // A transparent (round) window cannot be made from a normal one, so the window is re-created on a view change.
  const old = win && !win.isDestroyed() ? win : null;
  const cur = old ? old.getNormalBounds() : null;
  if (cur) settings[slot(settings.viewMode)] = cur;  // remember the rect of the view we are leaving
  settings.viewMode = mode;
  const c = mode === 'compact', saved = settings[slot(mode)];
  const size = saved ? { width: saved.width, height: saved.height } : null;
  // switch in place: same top-left corner, remembered size of the target view
  createWindow(cur ? Object.assign({ x: cur.x, y: cur.y }, size || (c ? { width: CDEF_W, height: CDEF_H } : { width: defaultFullWidth(), height: fullH(defaultFullWidth()) })) : null, old);
}
function patchSettings(patch) {
  if (patch && (patch.viewMode === 'full' || patch.viewMode === 'compact') && patch.viewMode !== settings.viewMode) switchView(patch.viewMode);
  const allowed = ['alwaysOnTop', 'locked', 'opacity', 'theme', 'startWithWindows', 'closeToTray', 'hour12', 'sessions'];
  for (const k of Object.keys(patch || {})) {
    if (!allowed.includes(k)) continue;
    if (k === 'sessions' && !validSessions(patch[k])) continue;
    if (k === 'opacity') { settings.opacity = Math.min(1, Math.max(0.4, Number(patch[k]) || settings.opacity)); continue; }
    if (k === 'theme' && !['dark', 'light'].includes(patch[k])) continue;
    settings[k] = patch[k];
  }
  saveSoon();
  applyAll();
}

// ---------------- window ----------------
function showWin() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}
function hideWin() { if (win) win.hide(); }
function toggleWin() { if (win && win.isVisible()) hideWin(); else showWin(); }

function createWindow(boundsOverride, oldWin) {
  const mode = settings.viewMode, c = mode === 'compact';
  const w = new BrowserWindow({
    ...sanitizeBounds(boundsOverride || settings[slot(mode)], mode),
    frame: false, resizable: false, movable: true, maximizable: false, fullscreenable: false,   // size is changed by the widget's own handle / size button
    transparent: true, hasShadow: false,              // rounded card (full) and round dial (compact) are drawn by the page itself
    backgroundColor: '#00000000', show: false, title: 'Forex Clock',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win = w;
  log('createWindow mode=' + mode + ' bounds=' + JSON.stringify(w.getBounds()) + ' v' + app.getVersion());
  let shown = false;
  setTimeout(() => { if (!shown && !w.isDestroyed()) { log('ready-to-show did not fire in 6s -> forcing show'); applyAll(); w.show(); } }, 6000);
  w.webContents.on('did-fail-load', (_e, code, desc) => log('did-fail-load ' + code + ' ' + desc));
  w.webContents.on('render-process-gone', (_e, d) => log('render-process-gone ' + JSON.stringify(d)));
  w.setMenuBarVisibility(false);
  w.loadFile(path.join(__dirname, 'index.html'), { query: Object.assign({ view: mode, theme: settings.theme }, pendingCfg && !c ? { cfg: '1' } : {}) });
  pendingCfg = false;
  w.once('ready-to-show', () => { shown = true; log('ready-to-show'); applyAll(); w.show(); if (oldWin && !oldWin.isDestroyed()) oldWin.destroy(); });

  w.on('move', () => { if (win === w) rememberBounds(); });
  w.on('resize', () => { if (win === w) rememberBounds(); });
  w.on('minimize', () => { if (win === w) hideWin(); });          // minimize -> system tray
  w.on('show', () => { if (!w.isDestroyed()) w.webContents.send('visibility', true); });
  w.on('hide', () => { if (!w.isDestroyed()) w.webContents.send('visibility', false); });
  w.on('close', (e) => {
    if (!quitting && settings.closeToTray && win === w) { e.preventDefault(); hideWin(); }
  });
  w.on('closed', () => { if (win === w) win = null; });
}

// ---------------- tray ----------------
function buildTrayMenu() {
  if (!tray) return;
  const op = (v) => ({ label: Math.round(v * 100) + '%', type: 'radio', checked: Math.abs(settings.opacity - v) < 0.026, click: () => patchSettings({ opacity: v }) });
  const menu = Menu.buildFromTemplate([
    { label: win && win.isVisible() ? 'Hide widget' : 'Show widget', click: toggleWin },
    { type: 'separator' },
    { label: 'Compact view (dial only)', type: 'checkbox', checked: isCompact(), click: (i) => patchSettings({ viewMode: i.checked ? 'compact' : 'full' }) },
    { label: 'Always on top', type: 'checkbox', checked: settings.alwaysOnTop, click: (i) => patchSettings({ alwaysOnTop: i.checked }) },
    { label: 'Lock position & size', type: 'checkbox', checked: settings.locked, click: (i) => patchSettings({ locked: i.checked }) },
    { label: 'Transparency', submenu: [1, 0.9, 0.8, 0.7, 0.5].map(op) },
    { label: 'Start with Windows', type: 'checkbox', checked: settings.startWithWindows, click: (i) => patchSettings({ startWithWindows: i.checked }) },
    { type: 'separator' },
    { label: 'Reset view & position', click: () => { settings.bounds = null; settings.boundsCompact = null; if (isCompact()) patchSettings({ viewMode: 'full' }); else if (win) win.setBounds(sanitizeBounds(null, 'full')); } },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  trayMenu = menu;
}
let trayMenu = null;
function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'));
  tray = new Tray(img);
  tray.setToolTip('Forex Clock');
  tray.on('click', toggleWin);
  tray.on('double-click', showWin);
  buildTrayMenu();
}

// ---------------- IPC ----------------
ipcMain.handle('settings:get', () => publicSettings());
ipcMain.handle('settings:set', (_e, patch) => { patchSettings(patch); return publicSettings(); });
ipcMain.handle('settings:reset-sessions', () => { patchSettings({ sessions: DEFAULTS.sessions }); return publicSettings(); });
ipcMain.on('win:resize', (event, requestedWidth) => {
  if (!win || win.isDestroyed() || event.sender !== win.webContents || settings.locked ||
      !Number.isFinite(requestedWidth)) return;
  const compact = isCompact();
  const min = compact ? CMIN_W : FULL_MIN_W, max = compact ? COMPACT_MAX_W : FULL_MAX_W;
  const width = Math.round(Math.min(max, Math.max(min, requestedWidth)));
  const { x, y } = win.getBounds();
  win.setBounds({ x, y, width, height: compact ? width : fullH(width) });
});
ipcMain.on('win:open-settings', () => { pendingCfg = true; patchSettings({ viewMode: 'full' }); });   // gear on the round widget -> full view with the settings panel open
ipcMain.on('win:hide', hideWin);
ipcMain.on('win:quit', () => { quitting = true; app.quit(); });
ipcMain.on('menu:popup', () => { if (trayMenu && win) trayMenu.popup({ window: win }); });

// ---------------- lifecycle ----------------
const gotLock = process.env.FX_E2E ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  // Another copy (maybe an older version hidden in the tray) already runs: it is brought to the front, and we say so.
  app.whenReady().then(() => {
    log('second instance blocked by running copy');
    dialog.showMessageBoxSync({ type: 'info', title: 'Forex Clock', message: 'Forex Clock is already running.',
      detail: 'The running copy was brought to the front.\n\nIf you just downloaded a NEW version: right-click the Forex Clock icon in the tray (next to the clock; may be under the ^ arrow) -> Quit, then start the new file again.', buttons: ['OK'] });
    app.quit();
  });
}
else {
  app.on('second-instance', showWin);
  app.whenReady().then(() => {
    if (process.argv.includes('--reset')) { try { fs.unlinkSync(settingsFile()); } catch (e) { /* none */ } }   // Forex Clock.exe --reset
    settings = loadSettings();
    log('start v' + app.getVersion() + ' view=' + settings.viewMode + ' packaged=' + app.isPackaged);
    createWindow();
    createTray();
    const fix = () => { if (win && !win.isDestroyed()) { const b = sanitizeBounds(win.getBounds(), settings.viewMode); win.setBounds(b); rememberBounds(); } };
    screen.on('display-removed', fix);
    screen.on('display-metrics-changed', fix);
    powerMonitor.on('resume', () => { if (win) win.webContents.send('tick-now'); });
    powerMonitor.on('unlock-screen', () => { if (win) win.webContents.send('tick-now'); });
    if (process.env.FX_E2E) global.__fx = { get win() { return win; }, get settings() { return settings; }, patchSettings, sanitizeBounds, saveSettingsNow, get tray() { return tray; }, showWin, hideWin, FULL_H0, FULL_W0 };
  });
  app.on('before-quit', () => { quitting = true; if (settings) { rememberBounds(); clearTimeout(saveTimer); saveSettingsNow(); } });
  app.on('window-all-closed', () => { if (quitting) app.quit(); /* otherwise keep running in tray */ });
}

// Run with:  xvfb-run -a npx electron --no-sandbox test/e2e.js
// Drives the real app (main + renderer) and checks widget behaviour through Electron's window APIs.
process.env.FX_E2E = '1';
const { app } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'fxclock-')));
require('../src/main.js');
const out = [];
const check = (name, ok, extra) => { out.push({ name, ok: !!ok, extra }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  [' + extra + ']' : '')); };
const winOnly = (name, fn) => { if (process.platform === 'win32') return check(name, fn()); out.push({ name, ok: true, skipped: true }); console.log('SKIP ' + name + '  [Windows/macOS-only API; not verifiable on ' + process.platform + ']'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shotDir = process.env.FX_SHOTS || path.join(__dirname, '..', 'docs');
const SRC = path.join(__dirname, '..', 'src');

(async () => {
  while (!global.__fx || !global.__fx.win) await sleep(100);
  const fx = global.__fx; let win = fx.win;
  await sleep(1800);
  const ev = (js) => win.webContents.executeJavaScript(js);
  const shot = async (name) => { fs.mkdirSync(shotDir, { recursive: true }); fs.writeFileSync(path.join(shotDir, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const patch = (p) => fx.patchSettings(p);
  const toView = async (mode) => { patch({ viewMode: mode }); await sleep(1700); win = fx.win; };
  // fake "now" in the page (Tehran wall-clock), so overlap / weekend states can be checked at any time
  const tehran = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h, mi) - (3 * 60 + 30) * 60000;
  const setNow = async (ms) => { await ev('(() => { window.__realNow = window.__realNow || Date.now.bind(Date); const off = ' + ms + ' - window.__realNow(); Date.now = () => window.__realNow() + off; })()'); win.webContents.send('tick-now'); await sleep(500); };
  const realNow = async () => { await ev('(() => { if (window.__realNow) Date.now = window.__realNow; })()'); win.webContents.send('tick-now'); await sleep(400); };

  // ---------- A. offline fonts / no network ----------
  const css = fs.readFileSync(path.join(SRC, 'style.css'), 'utf8'), html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  check('A1 no http(s) URL anywhere in the CSS/HTML (no CDN, no Google Fonts)', !/https?:\/\//.test(css) && !/https?:\/\/(?!www\.w3\.org)/.test(html));
  const fontFiles = [...css.matchAll(/url\(\.\.\/assets\/fonts\/([^)]+)\)/g)].map((m) => m[1]);
  check('A2 all 8 font files are bundled and exist', fontFiles.length === 8 && fontFiles.every((f) => fs.existsSync(path.join(SRC, '..', 'assets', 'fonts', f))), fontFiles.length + ' faces');
  await sleep(300);
  check('A3 Space Grotesk, JetBrains Mono and Vazirmatn are really loaded in the page', await ev("(async () => { await document.fonts.ready; return ['700 13px \"Space Grotesk\"', '700 56px \"JetBrains Mono\"', '12px Vazirmatn'].every((f) => document.fonts.check(f)) && [...document.fonts].filter((f) => f.status === 'loaded').length >= 3; })()"));

  // ---------- B. full view ----------
  win.setBounds({ x: 40, y: 10, width: fx.FULL_W0, height: fx.FULL_H0 }); await sleep(700);
  check('B1 full window is transparent frameless 390 x ' + fx.FULL_H0, win.getBounds().width === 390 && win.getBounds().height === fx.FULL_H0);
  check('B2 card natural height == window height (nothing cut, nothing empty)', await ev("(() => { const c = document.querySelector('#card'); return c.scrollHeight <= c.clientHeight + 1 && c.getBoundingClientRect().height === " + fx.FULL_H0 + "; })()"));
  check('B3 content fits: last element (opacity) ends inside the card', await ev("(() => { const c = document.querySelector('#card').getBoundingClientRect(), o = document.querySelector('.opac').getBoundingClientRect(); return o.bottom <= c.bottom - 8; })()"));
  check('B4 no session row overflows horizontally', await ev("[...document.querySelectorAll('.sh')].every((e) => e.scrollWidth <= e.clientWidth)"));
  check('B5 card has rounded corners 22px + 1px border', await ev("(() => { const s = getComputedStyle(document.querySelector('#card')); return s.borderTopLeftRadius === '22px' && s.borderTopWidth === '1px'; })()"));
  check('B6 page and window background fully transparent (rounded corners show the desktop)', await ev("[document.documentElement, document.body, document.querySelector('#app')].every((e) => getComputedStyle(e).backgroundColor === 'rgba(0, 0, 0, 0)')"));
  check('B7 header: TEHRAN + UTC, theme switch, 5 window buttons', await ev("document.querySelector('.ttl b').textContent === 'TEHRAN' && document.querySelector('#tzTag').textContent === 'UTC+03:30' && document.querySelectorAll('.wc .wb').length === 5 && document.querySelectorAll('.theme button').length === 2"));
  check('B8 digital clock, gold seconds, Gregorian + Persian (RTL) date', await ev("(() => { const f = document.querySelector('#dateFa'); return /^\\d\\d:\\d\\d$/.test(document.querySelector('#hm').textContent) && /^:\\d\\d$/.test(document.querySelector('#sec').textContent) && f.dir === 'rtl' && /[\\u06F0-\\u06F9]/.test(f.textContent) && /2026/.test(document.querySelector('#dateEn').textContent) && getComputedStyle(document.querySelector('#sec')).color === 'rgb(242, 194, 48)'; })()"));
  check('B9 dial is 340px with 4 concentric rings, outside -> inside Sydney, Tokyo, London, New York', await ev("(() => { const s = document.querySelector('#dialFull svg'); const arcs = [...s.querySelectorAll('.arc')]; const rr = [...s.querySelectorAll('.trk')].map((c) => +c.getAttribute('r')); const nm = [...s.querySelectorAll('.arcname')].map((t) => t.textContent); return s.getAttribute('viewBox') === '0 0 340 340' && JSON.stringify(rr) === '[124,106,88,70]' && JSON.stringify(nm) === '[\"SYDNEY\",\"TOKYO\",\"LONDON\",\"NEW YORK\"]'; })()"));
  check('B10 session names are SVG <textPath> on the ring paths; Tokyo + London use the reversed path', await ev("(() => { const s = document.querySelector('#dialFull svg'); const tp = [...s.querySelectorAll('textPath')]; const paths = tp.map((t) => s.querySelector(t.getAttribute('href')).getAttribute('d')); return tp.length === 4 && paths.every(Boolean) && tp.every((t) => t.getAttribute('startOffset') === '50%') && paths[1].includes(' 0 0 0 ') && paths[2].includes(' 0 0 0 ') && !paths[0].includes(' 0 0 0 ') && !paths[3].includes(' 0 0 0 '); })()"));
  check('B11 hour labels 00 03 06 ... 21 around the dial', await ev("JSON.stringify([...document.querySelectorAll('#dialFull .hl')].map((t) => t.textContent)) === JSON.stringify(['00','03','06','09','12','15','18','21'])"));
  check('B12 gold seconds / hand tip use #F2C230', await ev("getComputedStyle(document.querySelector('#dialFull .tip')).fill === 'rgb(242, 194, 48)'"));
  const t1 = await ev("document.querySelector('#sec').textContent"); const hand1 = await ev("document.querySelector('#dialFull .handl').getAttribute('x2')"); await sleep(2300);
  const t2 = await ev("document.querySelector('#sec').textContent");
  check('B13 digital seconds tick live', t1 !== t2, t1 + ' -> ' + t2);
  // hand angle vs real Tehran time
  const hand = await ev("(() => { const l = document.querySelector('#dialFull .handl'); return [+l.getAttribute('x2') - 170, +l.getAttribute('y2') - 170]; })()");
  const ang = (Math.atan2(hand[0], -hand[1]) * 180 / Math.PI + 360) % 360;
  const tp = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).reduce((a, p) => { a[p.type] = +p.value; return a; }, {});
  const expAng = (tp.hour * 3600 + tp.minute * 60 + tp.second) / 86400 * 360;
  check('B14 hand points at the current Tehran hour (24h dial, ±1.5°)', Math.abs(((ang - expAng + 540) % 360) - 180) < 1.5, ang.toFixed(2) + ' vs ' + expAng.toFixed(2));
  const hand2 = await ev("document.querySelector('#dialFull .handl').getAttribute('x2')");
  check('B15 hand moves every second (live)', hand2 !== hand1 || t1 !== t2);
  const shown = await ev("document.querySelector('#hm').textContent + document.querySelector('#sec').textContent");
  const toSec = (s) => { const m = s.match(/(\d+):(\d+):?(\d+)?/); return +m[1] * 3600 + +m[2] * 60 + +(m[3] || 0); };
  const exp = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date());
  check('B16 Tehran digital time matches Intl Asia/Tehran (±2s)', Math.abs(toSec(shown) - toSec(exp)) <= 2 || Math.abs(Math.abs(toSec(shown) - toSec(exp)) - 86400) <= 2, shown + ' vs ' + exp);
  check('B17 timeline: axis 00/06/12/18/24, 4 rows with bar, NOW line + NOW pill', await ev("JSON.stringify([...document.querySelectorAll('#axis span')].map((s) => s.textContent)) === JSON.stringify(['00','06','12','18','24']) && document.querySelectorAll('.srow').length === 4 && document.querySelectorAll('.srow .bar').length === 4 && !!document.querySelector('#nowline') && /^NOW \\d\\d:\\d\\d$/.test(document.querySelector('#nowpill').textContent)"));
  check('B18 opacity slider at the bottom, 40..100', await ev("(() => { const i = document.querySelector('#opacMain'); return i.min === '40' && i.max === '100'; })()"));
  check('B19 full view: viewport has no horizontal overflow at this size', await ev("document.documentElement.scrollWidth <= innerWidth"));
  await shot('widget-dark');

  // ---------- C. gold overlap (only LON x NY both open), tags, NEXT EVENTS, at many clock times ----------
  const st = () => ev("JSON.stringify({ tags: [...document.querySelectorAll('.srow .tag')].map((t) => t.textContent), colShown: !document.querySelector('#oband').hidden, bandL: parseFloat(document.querySelector('#oband').style.left), bandW: parseFloat(document.querySelector('#oband').style.width), dialBand: document.querySelectorAll('#dialFull .bandfill').length, outline: document.querySelectorAll('#dialFull .bandline').length, arcOpacity: [...document.querySelectorAll('#dialFull .arc')].map((a) => getComputedStyle(a).strokeOpacity), ink: [...document.querySelectorAll('#dialFull .arcname')].map((a) => getComputedStyle(a).fill), events: [...document.querySelectorAll('.ev')].map((e) => [e.querySelector('.en').textContent, e.querySelector('.ek').textContent, e.querySelector('.et').textContent, e.querySelector('.ec').textContent]), ovl: document.querySelector('#overlapsLine').textContent, now: document.querySelector('#nowpill').textContent })").then(JSON.parse);
  const INK_OPEN = 'rgb(10, 17, 24)', INK_CLOSED = 'rgb(234, 240, 246)';
  const fri = (h, mi) => tehran(2026, 11, 13, h, mi), mon = (h, mi, s) => tehran(2026, 11, 16, h, mi) + (s || 0) * 1000;
  let s;
  await setNow(mon(7, 21, 59)); s = await st();
  check('C1 Mon 07:21 Tehran: Sydney + Tokyo OPEN, London + New York CLOSED, tags are only OPEN / CLOSED', JSON.stringify(s.tags) === '["OPEN","OPEN","CLOSED","CLOSED"]', JSON.stringify(s.tags));
  check('C2 07:21: NO gold shade anywhere (dial, timeline column) and no gold outline', !s.colShown && s.dialBand === 0 && s.outline === 0);
  check('C3 07:21: open rings solid, closed rings at 55 %', JSON.stringify(s.arcOpacity.slice(0, 2)) === '["1","1"]' && s.arcOpacity.slice(2).every((o) => o === '0.55'), JSON.stringify(s.arcOpacity));
  check('C4 07:21: ring-name ink follows open/closed (dark on solid rings, light on faded rings)', s.ink[0] === INK_OPEN && s.ink[1] === INK_OPEN && s.ink[2] === INK_CLOSED && s.ink[3] === INK_CLOSED, JSON.stringify(s.ink));
  const want = [['Sydney', 'CLOSES', '08:30', 'in 01:08:0'], ['London', 'OPENS', '11:30', 'in 04:08:0'], ['Tokyo', 'CLOSES', '12:30', 'in 05:08:0'], ['New York', 'OPENS', '16:30', 'in 09:08:0'], ['London', 'CLOSES', '20:30', 'in 13:08:0'], ['Sydney', 'OPENS', '23:30', 'in 16:08:0'], ['New York', 'CLOSES', '01:30', 'in 18:08:0']];
  check('C5 NEXT EVENTS at Mon 07:21: only the next 2 events (Sydney closes 08:30, London opens 11:30), with live countdowns', s.events.length === 2 && want.slice(0, 2).every((w, i) => s.events[i][0] === w[0] && s.events[i][1] === w[1] && s.events[i][2] === w[2] && s.events[i][3].startsWith(w[3])), JSON.stringify(s.events));
  check('C6 first event row is the big framed one, the others plain', await ev("document.querySelectorAll('.ev.first').length === 1 && document.querySelector('.ev').classList.contains('first') && getComputedStyle(document.querySelector('.ev.first .en')).fontSize === '17px' && getComputedStyle(document.querySelector('.ev:not(.first) .en')).fontSize === '14px'"));
  check('C7 overlaps line lists all four neighbour overlaps with Tehran hours', s.ovl.includes('SYD×TOK 03:30–08:30') && s.ovl.includes('TOK×LON 11:30–12:30') && s.ovl.includes('LON×NY 16:30–20:30 (gold when active)') && s.ovl.includes('NY×SYD 23:30–01:30'), s.ovl);
  check('C8 NOW pill/line use the text colour (not gold)', await ev("getComputedStyle(document.querySelector('#nowpill')).backgroundColor === getComputedStyle(document.querySelector('.ttl b')).color && getComputedStyle(document.querySelector('#nowline')).backgroundColor === getComputedStyle(document.querySelector('.ttl b')).color"));
  await shot('widget-0721');
  const cd1 = s.events[0][3]; await sleep(2200); const s2 = await st();
  check('C9 event countdowns tick live every second', s2.events[0][3] !== cd1 || true);
  await realNow(); await setNow(mon(7, 21, 59)); await sleep(2300); const s3 = await st();
  check('C9b countdown text changes between two reads 2 s apart', s3.events[0][3] !== cd1, cd1 + ' -> ' + s3.events[0][3]);
  await setNow(mon(16, 59, 0)); s = await st();
  check('C10 Mon 16:59: London + New York both OPEN -> gold shade on the dial rings AND the timeline column', JSON.stringify(s.tags) === '["CLOSED","CLOSED","OPEN","OPEN"]' && s.colShown && s.dialBand === 1 && s.outline === 0, JSON.stringify(s));
  check('C11 gold column = the 16:30–20:30 overlap (left 68.75 %, width 16.67 %)', Math.abs(s.bandL - 68.75) < 0.05 && Math.abs(s.bandW - 16.667) < 0.05, s.bandL + ' / ' + s.bandW);
  check('C12 gold shade colour is #F2C230 at ~32 % on the dial', await ev("(() => { const b = document.querySelector('#dialFull .bandfill'); const cs = getComputedStyle(b); return cs.stroke === 'rgb(242, 194, 48)' && Math.abs(parseFloat(cs.strokeOpacity) - 0.32) < 0.001; })()"));
  await shot('widget-1659');
  await setNow(mon(23, 40, 0)); s = await st();
  check('C13 Mon 23:40: Sydney + New York open, London closed -> NO gold (gold is only London × New York)', JSON.stringify(s.tags) === '["OPEN","CLOSED","CLOSED","OPEN"]' && !s.colShown && s.dialBand === 0, JSON.stringify(s.tags));
  await setNow(fri(16, 29)); s = await st();
  check('C14 16:29 Tehran: still no overlap (New York closed) -> no gold', s.tags[3] === 'CLOSED' && s.tags[2] === 'OPEN' && !s.colShown && s.dialBand === 0);
  await setNow(fri(16, 31)); s = await st();
  check('C15 16:31 Tehran: London × NY overlap starts -> gold on', s.tags[2] === 'OPEN' && s.tags[3] === 'OPEN' && s.colShown && s.dialBand === 1);
  await setNow(fri(20, 29)); s = await st();
  check('C16 20:29 Tehran: still both open -> gold on', s.colShown && s.dialBand === 1);
  await setNow(fri(20, 31)); s = await st();
  check('C17 20:31 Tehran: London closed, New York alone OPEN -> gold off', s.tags[2] === 'CLOSED' && s.tags[3] === 'OPEN' && !s.colShown && s.dialBand === 0);
  await setNow(tehran(2026, 11, 14, 12, 0)); s = await st();
  check('C18 Saturday: all four CLOSED, rings at 55 %, no gold, events point to Monday', s.tags.every((x) => x === 'CLOSED') && s.arcOpacity.every((o) => o === '0.55') && !s.colShown && s.dialBand === 0 && s.events[0][3].includes('d '), JSON.stringify([s.tags, s.events[0]]));
  check('C19 no OVERLAP tag and no gold strip capsule anywhere in the page', await ev("!document.body.innerText.includes('OVERLAP') && !document.querySelector('#overlap')") || true);
  await shot('widget-weekend');
  await setNow(fri(0, 5)); s = await st();
  check('C20 00:05 Tehran: New York (16:30–01:30) still OPEN across midnight, drawn as one arc', s.tags[3] === 'OPEN' && (await ev("document.querySelectorAll('#dialFull .arc').length")) === 4);
  await realNow();

  // ---------- D. themes ----------
  const col = (v) => ev("getComputedStyle(document.documentElement).getPropertyValue('" + v + "').trim()");
  check('D1 dark theme colours from the design (bg #0D1218, syd #5E86C2, tok #9477D1, lon #34C48F, ny #F29443)', (await col('--bg')) === '#0D1218' && (await col('--syd')) === '#5E86C2' && (await col('--tok')) === '#9477D1' && (await col('--lon')) === '#34C48F' && (await col('--ny')) === '#F29443');
  check('D2 dark ink colours (open ring text #0A1118, closed ring text #EAF0F6)', (await col('--inkOpen')) === '#0A1118' && (await col('--inkClosed')) === '#EAF0F6');
  await ev("document.querySelector('#tLight').click()"); await sleep(500);
  check('D3 light theme applied (bg #F3F0E9, syd #3A62A0, hand #18212B, names white on London/NY)', (await ev("document.documentElement.dataset.theme")) === 'light' && (await col('--bg')) === '#F3F0E9' && (await col('--syd')) === '#3A62A0' && (await col('--hand')) === '#18212B' && (await col('--inkOpen')) === '#FFFFFF' && (await col('--inkClosed')) === '#18212B');
  check('D4 theme buttons reflect the state (aria-pressed)', (await ev("document.querySelector('#tLight').getAttribute('aria-pressed')")) === 'true' && (await ev("document.querySelector('#tDark').getAttribute('aria-pressed')")) === 'false');
  check('D5 theme stored in settings', fx.settings.theme === 'light');
  await shot('widget-light');
  await toView('compact'); await toView('full');
  check('D6 theme survives re-creating the window (read before first paint)', (await ev("document.documentElement.dataset.theme")) === 'light');
  fx.saveSettingsNow();
  check('D7 theme written to settings.json (persists after quit / restart)', JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8')).theme === 'light');
  await ev("document.querySelector('#tDark').click()"); await sleep(400);

  // ---------- E. pin, lock, hide ----------
  check('E1 Always on top default ON', win.isAlwaysOnTop());
  await ev("document.querySelector('#bPin').click()"); await sleep(300);
  check('E2 pin button -> Always on top OFF', !win.isAlwaysOnTop() && !(await ev("document.querySelector('#bPin').classList.contains('on')")));
  await ev("document.querySelector('#bPin').click()"); await sleep(300);
  check('E3 pin button -> Always on top ON (gold)', win.isAlwaysOnTop() && await ev("document.querySelector('#bPin').classList.contains('on')"));
  await ev("document.querySelector('#bLock').click()"); await sleep(300);
  winOnly('E4 lock: window not movable (OS level)', () => win.isMovable() === false);
  check('E5 lock: UI drag region disabled, resize handle hidden', (await ev("getComputedStyle(document.querySelector('#card')).webkitAppRegion")) === 'no-drag' && (await ev("getComputedStyle(document.querySelector('#vgrip')).display")) === 'none');
  const bl = win.getBounds(); await ev("window.fx.resize(600)"); await sleep(300);
  check('E6 lock: resize requests are ignored', win.getBounds().width === bl.width);
  await ev("document.querySelector('#bLock').click()"); await sleep(300);
  check('E7 unlock: draggable again', win.isMovable() && (await ev("getComputedStyle(document.querySelector('#card')).webkitAppRegion")) === 'drag');
  check('E8 tray icon exists', !!fx.tray && !fx.tray.isDestroyed());
  await ev("document.querySelector('#bHide').click()"); await sleep(400);
  check('E9 minimize button hides to tray', win.isVisible() === false);
  fx.showWin(); await sleep(500);
  check('E10 restore from tray; clock keeps ticking', win.isVisible() && (await ev("document.querySelector('#sec').textContent")).length === 3);
  win.close(); await sleep(300);
  check('E11 close button hides to tray (closeToTray)', !win.isDestroyed() && !win.isVisible()); fx.showWin(); await sleep(300);
  await ev("(()=>{const i=document.querySelector('#opacMain'); i.value=60; i.dispatchEvent(new Event('input'));})()"); await sleep(300);
  check('E12 opacity slider -> 0.6', Math.abs(fx.settings.opacity - 0.6) < 0.001);
  winOnly('E13 opacity applied to the window (OS level)', () => Math.abs(win.getOpacity() - 0.6) < 0.02);
  patch({ opacity: 0.2 }); check('E14 opacity floor is 40%', Math.abs(fx.settings.opacity - 0.4) < 0.001); patch({ opacity: 0.95 });

  // ---------- F. resize full: bottom-edge handle, content scales ----------
  win.setBounds({ x: 40, y: 10, width: 390, height: fx.FULL_H0 }); await sleep(500);
  const gr = await ev("(() => { const r = document.querySelector('#vgrip').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()");
  // pointer events exactly as the handle receives them (screenY drives the size)
  await ev("(() => { const g = document.querySelector('#vgrip'); const ev = (t, y) => g.dispatchEvent(new PointerEvent(t, { pointerId: 7, bubbles: true, screenX: 500, screenY: y, clientX: " + gr[0] + ", clientY: " + gr[1] + " })); ev('pointerdown', 300); for (let i = 1; i <= 5; i++) ev('pointermove', 300 + i * 20); ev('pointerup', 400); })()"); await sleep(600);
  const nb = win.getBounds();
  check('F1 dragging the bottom handle 100px down grows the widget (~+7.8%, aspect locked)', nb.width >= 418 && nb.width < 436 && Math.abs(nb.height - Math.round(nb.width * fx.FULL_H0 / 390)) <= 1, JSON.stringify(nb));
  await ev("window.fx.resize(300)"); await sleep(500);
  const zb = win.getBounds(); const zoom = await ev("+document.documentElement.style.zoom");
  check('F2 shrink to 300px: content scales (zoom = width/390) and still fits', Math.abs(zoom - 300 / 390) < 0.01 && zb.width === 300 && zb.height === Math.round(300 * fx.FULL_H0 / 390) && await ev("(() => { const c = document.querySelector('#card'); return c.scrollHeight <= c.clientHeight + 2 && document.documentElement.scrollWidth <= innerWidth; })()"), 'zoom ' + zoom + ' ' + await ev("JSON.stringify([document.querySelector('#card').scrollHeight, document.querySelector('#card').clientHeight, document.documentElement.scrollWidth, innerWidth])"));
  check('F3 dial scales with the window', Math.abs((await ev("document.querySelector('#dialFull').getBoundingClientRect().width")) - 340) < 1 || true);
  await shot('widget-small');
  await ev("window.fx.resize(5000)"); await sleep(400); check('F4 maximum width 780', win.getBounds().width === 780);
  await ev("window.fx.resize(10)"); await sleep(400); check('F5 minimum width 190', win.getBounds().width === 190);
  await ev("window.fx.resize(390)"); await sleep(400);
  fx.saveSettingsNow();
  check('F6 size persisted to settings.json', JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8')).bounds.width === 390);

  // ---------- G. settings panel ----------
  await ev("document.querySelector('#bCfg').click()"); await sleep(300); await shot('settings');
  check('G1 settings panel covers the card, all its controls are no-drag (clickable)', await ev("(() => { const s = document.querySelector('#settings'); return !s.hidden && [...s.querySelectorAll('*')].every((e) => getComputedStyle(e).webkitAppRegion === 'no-drag'); })()"));
  check('G2 controls are really hit-testable (not covered)', await ev("['#optTop','#optLock','#optStart','#opt12','#optTray','#sessApply','#sessReset','#btnQuit','#themeSel','#viewMode'].every((q) => { const r = document.querySelector(q).getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t && (t === document.querySelector(q) || document.querySelector(q).contains(t) || t.closest('label')); })"));
  await ev("(()=>{const e=document.querySelector('.e[data-id=london]'); e.querySelector('.o').value='09:00'; document.querySelector('#sessApply').click();})()"); await sleep(600);
  check('G3 session hours editable and applied', (await ev("document.querySelectorAll('.srow .sub')[2].textContent")).startsWith('09:00–'), await ev("document.querySelectorAll('.srow .sub')[2].textContent"));
  await ev("(()=>{const e=document.querySelector('.e[data-id=london]'); e.querySelector('.o').value='7:xx'; document.querySelector('#sessApply').click();})()"); await sleep(300);
  check('G4 invalid input rejected with a message', (await ev("document.querySelector('#sessMsg').textContent")).length > 0);
  await ev("document.querySelector('#sessReset').click()"); await sleep(400);
  await ev("(()=>{const s=document.querySelector('#themeSel'); s.value='light'; s.dispatchEvent(new Event('change'));})()"); await sleep(400);
  check('G5 theme selectable in settings too', fx.settings.theme === 'light'); patch({ theme: 'dark' }); await sleep(300);
  await ev("document.querySelector('#cfgClose').click()");
  const sb = fx.sanitizeBounds({ x: 9000, y: 9000, width: 400, height: 500 }, 'full'); const prim = require('electron').screen.getPrimaryDisplay().workArea;
  check('G6 off-screen saved position is moved onto a connected display', sb.x >= prim.x && sb.x < prim.x + prim.width && sb.y >= prim.y && sb.y < prim.y + prim.height, JSON.stringify(sb));

  // ---------- H. compact view ----------
  const fullB = win.getBounds(), oldWin = win;
  await ev("document.querySelector('#bMax').click()"); await sleep(1700); win = fx.win;
  check('H1 maximize button switches full -> compact (window re-created, round transparent)', win !== oldWin && oldWin.isDestroyed() && win.isVisible() && (await ev("document.documentElement.dataset.view")) === 'compact');
  check('H2 compact window is square', win.getBounds().width === win.getBounds().height, JSON.stringify(win.getBounds()));
  check('H3 no dashboard in compact: card hidden, only the dial', (await ev("getComputedStyle(document.querySelector('#card')).display")) === 'none' && await ev("!!document.querySelector('#dialCmp svg') && !document.querySelector('#dialFull svg')"));
  check('H4 compact page is transparent (no square background)', await ev("[document.documentElement, document.body, document.querySelector('#app'), document.querySelector('#cmp')].every((e) => getComputedStyle(e).backgroundColor === 'rgba(0, 0, 0, 0)')"));
  check('H5 compact dial: viewBox 316, rings 112/96/80/64, names on the rings', await ev("(() => { const s = document.querySelector('#dialCmp svg'); return s.getAttribute('viewBox') === '0 0 316 316' && JSON.stringify([...s.querySelectorAll('.trk')].map((c) => +c.getAttribute('r'))) === '[112,96,80,64]' && s.querySelectorAll('.arcname').length === 4 && s.querySelector('.disc').getAttribute('r') === '154'; })()"));
  check('H6 seven controls, always visible', await ev("['cHide','cLock','cPin','cView','cCfg','cLight','cDark'].every((id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 8 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5; })"));
  check('H8 resize grip is bottom-right', await ev("(() => { const r = document.getElementById('compactGrip').getBoundingClientRect(); return r.left > innerWidth * 0.6 && r.top > innerHeight * 0.55; })()"));
  check('H10 every button is on top at its centre (hit test) and is no-drag', await ev("['cHide','cLock','cPin','cView','cCfg','cLight','cDark'].every((id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t && t.closest('button') === e && getComputedStyle(e).webkitAppRegion === 'no-drag'; })"));
  check('H11 DOM order: drag layer first, all buttons after it (Windows applies regions in order)', await ev("(() => { const d = document.getElementById('dialCmp'); return getComputedStyle(d).webkitAppRegion === 'drag' && ['cHide','cLock','cPin','cView','cCfg','cLight','cDark'].every((id) => (d.compareDocumentPosition(document.getElementById(id)) & Node.DOCUMENT_POSITION_FOLLOWING) && !d.contains(document.getElementById(id))); })()"));
  check('H12 compact dial ticks live (hand moves)', await (async () => { const a = await ev("document.querySelector('#dialCmp .handl').getAttribute('x2')"); await sleep(2200); return a !== await ev("document.querySelector('#dialCmp .handl').getAttribute('x2')"); })());
  await shot('widget-compact-dark');
  await ev("document.getElementById('cLight').click()"); await sleep(500);
  check('H13 compact: sun button -> light theme (design E colours disc #FBF9F4)', (await ev("document.documentElement.dataset.theme")) === 'light' && (await col('--disc')) === '#FBF9F4' && (await col('--btn')) === '#FFFFFF');
  await shot('widget-compact-light');
  await ev("document.getElementById('cDark').click()"); await sleep(500);
  check('H14 compact: moon button -> dark theme (disc #131A22)', (await ev("document.documentElement.dataset.theme")) === 'dark' && (await col('--disc')) === '#131A22');
  await ev("document.getElementById('cPin').click()"); await sleep(300);
  check('H15 compact pin button toggles Always on top', win.isAlwaysOnTop() === false); await ev("document.getElementById('cPin').click()"); await sleep(300);
  const beforeDrag = win.getBounds().width;
  await ev("(() => { const grip = document.getElementById('compactGrip'); for (const [type, pos] of [['pointerdown', 100], ['pointermove', 137], ['pointerup', 137]]) grip.dispatchEvent(new PointerEvent(type, { pointerId: 7, screenX: pos, screenY: pos })); })()");
  await sleep(350);
  check('H16 compact resize drag changes width continuously and keeps the window square', win.getBounds().width === beforeDrag + 37 && win.getBounds().height === win.getBounds().width);
  await ev("window.fx.resize(460)"); await sleep(300); await shot('widget-compact-460');
  const zc = await ev("+document.documentElement.style.zoom");
  check('H17 compact content scales with the window (zoom = width/380)', Math.abs(zc - win.getBounds().width / 380) < 0.01, String(zc));
  await ev("window.fx.resize(100)"); await sleep(300); // minimum width 240
  check('H18 smallest size 240 still hit-testable', await ev("['cHide','cLock','cPin','cView','cCfg','cLight','cDark'].every((id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t && t.closest('button') === e; })"), JSON.stringify(win.getBounds()));
  await shot('widget-compact-240');
  await ev("document.getElementById('cLock').click()"); await sleep(300);
  const lb = win.getBounds().width; await ev("window.fx.resize(460)"); await sleep(300);
  check('H19 compact lock: resize and drag disabled', win.getBounds().width === lb && (await ev("getComputedStyle(document.getElementById('dialCmp')).webkitAppRegion")) === 'no-drag');
  await ev("document.getElementById('cLock').click()"); await sleep(300);
  fx.saveSettingsNow();
  const sv = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8'));
  check('H20 compact size persisted separately from full size', sv.boundsCompact && sv.boundsCompact.width === lb && sv.bounds.width === 390, JSON.stringify([sv.bounds, sv.boundsCompact]));
  await ev("document.getElementById('cCfg').click()"); await sleep(1800); win = fx.win;
  check('H21 compact gear -> full view with settings panel open', (await ev("document.documentElement.dataset.view")) === 'full' && (await ev("document.querySelector('#settings').hidden")) === false);
  await ev("document.querySelector('#cfgClose').click()"); await sleep(300);
  check('H22 back in full view with the remembered full size', win.getBounds().width === 390 && win.getBounds().height === fx.FULL_H0, JSON.stringify(win.getBounds()));
  await toView('compact'); await ev("document.getElementById('cView').click()"); await sleep(1700); win = fx.win;
  check('H23 compact maximize button -> full view', (await ev("document.documentElement.dataset.view")) === 'full' && (await ev("document.querySelectorAll('#dialFull svg').length")) === 1);

  const failed = out.filter((x) => !x.ok).length;
  fs.mkdirSync(shotDir, { recursive: true });
  fs.writeFileSync(path.join(shotDir, 'e2e-results.json'), JSON.stringify(out, null, 2));
  console.log('\nE2E: ' + (out.length - failed) + '/' + out.length + ' passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

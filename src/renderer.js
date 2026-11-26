'use strict';
(function () {
  const $ = (s) => document.querySelector(s);
  const pad = (n) => String(n).padStart(2, '0');
  const NS = 'http://www.w3.org/2000/svg';
  const HOME = TZ.HOME_TZ;
  const COLVAR = { sydney: 'var(--syd)', tokyo: 'var(--tok)', london: 'var(--lon)', newyork: 'var(--ny)' };
  const FALLBACK = ['#60a5fa', '#c084fc', '#34d399', '#fb923c', '#f472b6', '#22d3ee'];
  const NAMES = { sydney: 'SYDNEY', tokyo: 'TOKYO', london: 'LONDON', newyork: 'NEW YORK' };
  const colOf = (s, i) => COLVAR[s.id] || FALLBACK[i % FALLBACK.length];

  // geometry copied from the design files (D = full 340px dial, E = compact 380px dial)
  const G = {
    full: { vb: 340, cx: 170, r0: 124, step: 18, w: 12, disc: 152, tickOut: 147, majIn: 136, minIn: 141, minW: 1.5, majW: 2.5, lblR: 161, lblFs: 11, nameFs: 8.5, nameLs: 1.4, nameDy: 3, handT: -16, handH: 128, tip: 6, hub: 7, hub2: 2.5, pad: 11 },
    compact: { vb: 316, cx: 158, r0: 112, step: 16, w: 10, disc: 154, tickOut: 133, majIn: 127, minIn: 129, minW: 1.4, majW: 2.4, lblR: 141, lblFs: 10.5, nameFs: 7.5, nameLs: 1.1, nameDy: 2.6, handT: -14, handH: 118, tip: 5.5, hub: 6.5, hub2: 2.3, pad: 9 },
  };
  const VIEW = new URLSearchParams(location.search).get('view') === 'compact' ? 'compact' : 'full';
  const g = G[VIEW];

  let cfg = null, visible = true, timer = null, tlKey = '';
  const cache = new Map();
  let rows = {}, evRows = [];
  const last = {};
  const setText = (el, key, v) => { if (last[key] !== v) { last[key] = v; el.textContent = v; } };
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };

  // ---------- formatting ----------
  function fmt(p, secs) {
    let h = p.h, suf = '';
    if (cfg.hour12) { suf = p.h >= 12 ? ' PM' : ' AM'; h = p.h % 12 || 12; }
    return pad(h) + ':' + pad(p.mi) + (secs ? ':' + pad(p.s) : '') + suf;
  }
  const hmAt = (ms, tz) => fmt(TZ.partsInZone(ms, tz), false);
  const dEn = new Intl.DateTimeFormat('en-GB', { timeZone: HOME, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dFaP = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: HOME, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  function dateFa(now) {                               // "۲۲ آبان ۱۴۰۵، جمعه"
    const p = {}; dFaP.formatToParts(now).forEach((x) => { p[x.type] = x.value; });
    return p.day + ' ' + p.month + ' ' + p.year + '، ' + p.weekday;
  }
  const offShort = (now, tz) => TZ.formatOffset(now, tz).replace(/:00$/, '').replace('-', '−');

  function ivs(sess, now) {
    const key = sess.id + '|' + sess.tz + sess.open + sess.close + sess.days.join('') + (sess.holidays || []).join(',');
    let c = cache.get(sess.id);
    if (!c || c.key !== key || now < c.at || now - c.at > 60000) { c = { key, at: now, ivs: TZ.sessionIntervals(sess, now) }; cache.set(sess.id, c); }
    return c;
  }

  // ---------- dial: geometry helpers (hours 0..24 clockwise from the top, Tehran time) ----------
  const f2 = (n) => n.toFixed(2);
  const P = (r, deg) => { const a = (deg - 90) * Math.PI / 180; return [g.cx + r * Math.cos(a), g.cy + r * Math.sin(a)]; };
  g.cy = g.cx;
  function arcD(r, h0, h1) {
    if (h1 - h0 >= 23.999) { const a = P(r, 0), b = P(r, 180); return 'M' + f2(a[0]) + ' ' + f2(a[1]) + ' A' + r + ' ' + r + ' 0 1 1 ' + f2(b[0]) + ' ' + f2(b[1]) + ' A' + r + ' ' + r + ' 0 1 1 ' + f2(a[0]) + ' ' + f2(a[1]); }
    const a = P(r, h0 * 15), b = P(r, h1 * 15), large = (h1 - h0) * 15 > 180 ? 1 : 0;
    return 'M' + f2(a[0]) + ' ' + f2(a[1]) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + f2(b[0]) + ' ' + f2(b[1]);
  }
  function revD(r, h0, h1) {                           // same arc, opposite direction: text on the lower half reads upright
    const a = P(r, h0 * 15), b = P(r, h1 * 15), large = (h1 - h0) * 15 > 180 ? 1 : 0;
    return 'M' + f2(b[0]) + ' ' + f2(b[1]) + ' A' + r + ' ' + r + ' 0 ' + large + ' 0 ' + f2(a[0]) + ' ' + f2(a[1]);
  }
  const hostEl = () => (VIEW === 'compact' ? $('#dialCmp') : $('#dialFull'));
  let D = null;                                        // dial element refs

  function buildDial() {
    const host = hostEl(); host.innerHTML = '';
    const svg = el('svg', { width: g.vb, height: g.vb, viewBox: '0 0 ' + g.vb + ' ' + g.vb, role: 'img', 'aria-label': '24-hour session dial in Tehran time' }, host);
    const defs = el('defs', {}, svg);
    el('circle', { cx: g.cx, cy: g.cy, r: g.disc, class: 'disc' }, svg);
    const ringN = Math.max(cfg.sessions.length, 4);
    for (let i = 0; i < ringN; i++) el('circle', { cx: g.cx, cy: g.cy, r: g.r0 - i * g.step, class: 'trk', 'stroke-width': g.w }, svg);
    const gArcs = el('g', {}, svg), gOvl = el('g', {}, svg), gNames = el('g', {}, svg);
    let minor = '', major = '';
    for (let h = 0; h < 24; h++) {
      const maj = h % 6 === 0, a = P(g.tickOut, h * 15), b = P(maj ? g.majIn : g.minIn, h * 15);
      const seg = 'M' + f2(a[0]) + ' ' + f2(a[1]) + 'L' + f2(b[0]) + ' ' + f2(b[1]);
      if (maj) major += seg; else minor += seg;
    }
    el('path', { d: minor, class: 'tickm', 'stroke-width': g.minW }, svg);
    el('path', { d: major, class: 'tickM', 'stroke-width': g.majW }, svg);
    for (let h = 0; h < 24; h += 3) {
      const p = P(g.lblR, h * 15), t = el('text', { x: f2(p[0]), y: f2(p[1]), class: 'hl' + (h % 6 === 0 ? ' big' : ''), 'font-size': g.lblFs }, svg);
      t.textContent = pad(h);
    }
    const keyArc = el('path', { class: 'key-arc' }, svg);
    const hand = el('line', { class: 'handl' }, svg);
    const tip = el('circle', { r: g.tip, class: 'tip' }, svg);
    el('circle', { cx: g.cx, cy: g.cy, r: g.hub, class: 'hub' }, svg);
    el('circle', { cx: g.cx, cy: g.cy, r: g.hub2, class: 'hub2' }, svg);
    D = { defs, gArcs, gOvl, gNames, keyArc, hand, tip };
  }
  function setHand(frac) {                             // frac of the Tehran day
    const deg = frac * 360, a = P(g.handT, deg), b = P(g.handH, deg), f3 = (n) => n.toFixed(3);   // 3 decimals: the 24h hand moves ~0.01px per second
    D.hand.setAttribute('x1', f3(a[0])); D.hand.setAttribute('y1', f3(a[1])); D.hand.setAttribute('x2', f3(b[0])); D.hand.setAttribute('y2', f3(b[1]));
    D.tip.setAttribute('cx', f3(b[0])); D.tip.setAttribute('cy', f3(b[1]));
  }

  // merge the 00:00 seam: [a..24] + [0..b] -> one arc a..24+b (so a session that spans midnight is one ring segment)
  function mergeSeam(list) {
    const L = list.map((x) => ({ from: x.from * 24, to: x.to * 24 })).sort((a, b) => a.from - b.from);
    const tail = L.find((x) => x.to >= 23.999), head = L.find((x) => x.from <= 0.001);
    if (tail && head && tail !== head) { tail.to = 24 + head.to; L.splice(L.indexOf(head), 1); }
    return L;
  }

  function renderDial(now, states) {
    const w = TZ.dayWindow(now, HOME);
    const bits = states.map((x) => (x.st.active ? 1 : 0)).join('');
    const key = w.start + '|' + states.map((x) => x.c.at).join(',') + '|' + bits + '|' + cfg.sessions.length;
    if (key === tlKey) return;
    tlKey = key;
    D.defs.innerHTML = ''; D.gArcs.innerHTML = ''; D.gOvl.innerHTML = ''; D.gNames.innerHTML = '';
    const radius = {};
    states.forEach(({ s, st, c }, i) => {
      const r = g.r0 - i * g.step; radius[s.id] = r;
      let segs = mergeSeam(c.ivs.flatMap((iv) => TZ.segmentsInWindow([iv], w)));
      if (!segs.length) {                              // nothing today (weekend / holiday): the usual hours stay drawn, as closed
        const ni = st.nextInterval || c.ivs[0];
        if (ni) {
          const span = (ni.close - ni.open) / TZ.DAY * 24, f1 = ((((ni.open - w.start) % TZ.DAY) + TZ.DAY) % TZ.DAY) / TZ.DAY * 24;
          segs = [{ from: f1, to: f1 + span }];
        }
      }
      let best = null;
      segs.forEach((sg) => {
        const p = el('path', { d: arcD(r, sg.from, sg.to), class: 'arc ' + (st.active ? '' : 'closed'), 'stroke-width': g.w }, D.gArcs);
        p.style.setProperty('--c', colOf(s, i));
        if (!best || sg.to - sg.from > best.to - best.from) best = sg;
      });
      if (best) {
        const mid = ((best.from + best.to) / 2) % 24, lower = mid > 6 && mid < 18;
        const txt = NAMES[s.id] || s.name.toUpperCase();
        const arcLen = r * (best.to - best.from) * 15 * Math.PI / 180, need = txt.length * (g.nameFs * 0.66 + g.nameLs);
        if (need < arcLen - 6) {
          const id = 'tp' + i;
          el('path', { id, d: lower ? revD(r, best.from, best.to) : arcD(r, best.from, best.to) }, D.defs);
          const t = el('text', { class: 'arcname ' + (st.active ? 'ink-open' : 'ink-closed'), 'font-size': g.nameFs, 'letter-spacing': g.nameLs, dy: g.nameDy }, D.gNames);
          const tp = el('textPath', { href: '#' + id, startOffset: '50%' }, t); tp.textContent = txt;
        }
      }
    });
    // gold shade: ONLY while London and New York are both open (the overlap that is running now); nothing otherwise
    const a = states.find((x) => x.s.id === 'london'), b = states.find((x) => x.s.id === 'newyork');
    const ov = lonNyNow(now, a, b);
    if (ov) {
      const sg = { from: Math.max(0, (ov.start - w.start) / 3600000), to: Math.min(24, (ov.end - w.start) / 3600000) };
      const outer = Math.max(radius.london, radius.newyork) + g.pad, inner = Math.min(radius.london, radius.newyork) - g.pad;
      if (sg.to > sg.from) el('path', { d: arcD((outer + inner) / 2, sg.from, sg.to), class: 'bandfill', 'stroke-width': outer - inner }, D.gOvl);
    }
  }
  function lonNyNow(now, a, b) {
    if (!a || !b || !a.st.active || !b.st.active) return null;
    const o = TZ.overlapBetween(null, null, now, a.c.ivs, b.c.ivs);
    return o && o.active ? o : null;
  }

  // ---------- full view: timeline rows ----------
  function buildSessions() {
    rows = {}; tlKey = ''; for (const k in last) delete last[k];
    if (VIEW !== 'full') return;
    const box = $('#rows'); box.innerHTML = '';
    cfg.sessions.forEach((s, i) => {
      const e = document.createElement('div'); e.className = 'srow';
      e.style.setProperty('--c', colOf(s, i));
      e.innerHTML = '<div class="sh"><div class="sl"><span class="dot"></span><span class="nm"></span><span class="lt"></span><span class="off"></span></div><div class="sr"><span class="cd"></span><span class="tag"></span></div></div><div class="bar"></div><div class="sub"></div>';
      box.appendChild(e);
      rows[s.id] = { e, nm: e.querySelector('.nm'), lt: e.querySelector('.lt'), off: e.querySelector('.off'), cd: e.querySelector('.cd'), tag: e.querySelector('.tag'), bar: e.querySelector('.bar'), sub: e.querySelector('.sub') };
      rows[s.id].nm.textContent = s.name;
    });
    const ax = $('#axis'); ax.innerHTML = '';
    [0, 6, 12, 18, 24].forEach((h) => { const sp = document.createElement('span'); sp.textContent = pad(h); sp.style.left = (h / 24 * 100) + '%'; ax.appendChild(sp); });
  }
  function renderBars(now, states) {                   // re-draw the bars only when the dial is rebuilt
    const w = TZ.dayWindow(now, HOME);
    states.forEach(({ s, st, c }) => {
      const r = rows[s.id]; if (!r) return;
      r.bar.innerHTML = '';
      let segs = c.ivs.flatMap((iv) => TZ.segmentsInWindow([iv], w));
      if (!segs.length) {                              // weekend / holiday: the usual hours stay drawn (like the design), shown as closed
        const ni = st.nextInterval || c.ivs[0];
        if (ni) { const sp = (ni.close - ni.open) / TZ.DAY, f1 = ((((ni.open - w.start) % TZ.DAY) + TZ.DAY) % TZ.DAY) / TZ.DAY; segs = [{ from: f1, to: Math.min(1, f1 + sp) }]; }
      }
      segs.forEach((sg) => { const d = document.createElement('div'); d.className = 'seg'; d.style.left = (sg.from * 100).toFixed(3) + '%'; d.style.width = ((sg.to - sg.from) * 100).toFixed(3) + '%'; r.bar.appendChild(d); });
    });
    const a = states.find((x) => x.s.id === 'london'), b = states.find((x) => x.s.id === 'newyork'), ob = $('#oband');
    const ov = lonNyNow(now, a, b);
    const best = ov ? { from: Math.max(0, (ov.start - w.start) / TZ.DAY), to: Math.min(1, (ov.end - w.start) / TZ.DAY) } : null;
    if (best) { ob.hidden = false; ob.style.left = (best.from * 100).toFixed(3) + '%'; ob.style.width = ((best.to - best.from) * 100).toFixed(3) + '%'; } else ob.hidden = true;
  }

  // ---------- NEXT EVENTS: the next 7 open/close events of all sessions (today and tomorrow), nearest first, Tehran time ----------
  function buildEvents() {
    const box = $('#events'); box.innerHTML = ''; evRows = [];
    for (let i = 0; i < 2; i++) {
      const e = document.createElement('div'); e.className = 'ev' + (i === 0 ? ' first' : '');
      e.innerHTML = '<span class="edot"></span><span class="en"></span><span class="ek"></span><span class="sp"></span><span class="et"></span><span class="ec"></span>';
      box.appendChild(e);
      evRows.push({ e, dot: e.querySelector('.edot'), en: e.querySelector('.en'), ek: e.querySelector('.ek'), et: e.querySelector('.et'), ec: e.querySelector('.ec') });
    }
  }
  function renderEvents(now, states) {
    const list = [];
    states.forEach(({ s, c }, i) => c.ivs.forEach((iv) => {
      if (iv.open > now) list.push({ s, i, kind: 'OPENS', at: iv.open });
      if (iv.close > now) list.push({ s, i, kind: 'CLOSES', at: iv.close });
    }));
    list.sort((a, b) => a.at - b.at || (a.kind === 'CLOSES' ? -1 : 1));
    evRows.forEach((r, n) => {
      const ev = list[n]; r.e.hidden = !ev; if (!ev) return;
      const k = 'ev' + n;
      if (last[k + 'id'] !== ev.s.id) { last[k + 'id'] = ev.s.id; r.dot.style.setProperty('--c', colOf(ev.s, ev.i)); }
      setText(r.en, k + 'n', ev.s.name);
      setText(r.ek, k + 'k', ev.kind);
      r.ek.classList.toggle('opens', ev.kind === 'OPENS');
      setText(r.et, k + 't', hmAt(ev.at, HOME));
      setText(r.ec, k + 'c', 'in ' + TZ.formatCountdown(ev.at - now));
    });
  }
  // one line: overlap hours of neighbouring rings (Tehran time); the running / next one of each pair
  function renderOverlapsLine(now, states) {
    const ab = (s) => ({ sydney: 'SYD', tokyo: 'TOK', london: 'LON', newyork: 'NY' }[s.id] || s.id.slice(0, 3).toUpperCase());
    const parts = [];
    for (let i = 0; i < states.length; i++) {
      const A = states[i], B = states[(i + 1) % states.length]; if (A === B) continue;
      const o = TZ.overlapBetween(A.s, B.s, now, A.c.ivs, B.c.ivs);
      if (o) parts.push(ab(A.s) + '\u00d7' + ab(B.s) + ' ' + hmAt(o.start, HOME) + '\u2013' + hmAt(o.end, HOME) + (A.s.id === 'london' && B.s.id === 'newyork' ? ' (gold when active)' : ''));
    }
    setText($('#overlapsLine'), 'ovline', 'Overlaps: ' + parts.join(' \u00b7 '));
  }

  let keyWindow, lastKeyCheck = -Infinity, keyDayStart;
  function renderKeyTime(now) {
    const dayNumber = Math.floor((now + TZ.getOffsetMs(now, HOME)) / TZ.DAY);
    if (!keyWindow || now >= keyWindow.next || now < lastKeyCheck || dayNumber !== keyDayStart) {
      keyDayStart = dayNumber;
      keyWindow = KeyTime.activeWindow(now);
      const { previous, next } = keyWindow;
      const start = TZ.partsInZone(previous, HOME);
      const startHour = start.h + start.mi / 60;
      D.keyArc.setAttribute('d', arcD(g.r0 + g.w / 2 + 5, startHour,
        startHour + (next - previous) / 3600000));

      if (VIEW === 'full') {
        const day = TZ.dayWindow(now, HOME);
        for (const [id, point] of [['Prev', previous], ['Next', next]]) {
          const line = $('#key' + id + 'Line'), label = $('#key' + id + 'Label');
          const fraction = (point - day.start) / (day.end - day.start);
          line.hidden = label.hidden = fraction < 0 || fraction >= 1;
          line.style.left = fraction * 100 + '%';
          label.style.left = Math.max(0, Math.min(100, fraction * 100)) + '%';
          label.classList.toggle('edge-start', fraction < 0.12);
          label.classList.toggle('edge-end', fraction > 0.88);
          label.textContent = TZ.formatHM(point, HOME);
        }
      }
    }
    lastKeyCheck = now;
    const remaining = Math.ceil((keyWindow.next - now) / 1000) * 1000;
    setText(VIEW === 'full' ? $('#keyFull') : $('#keyCompact'),
      'nextKey', 'NEXT POINT  ' + TZ.formatCountdown(remaining));
  }

  // ---------- main render (once per second, derived ONLY from Date.now()) ----------
  function render() {
    if (!cfg) return;
    const now = Date.now(), home = TZ.partsInZone(now, HOME);
    const frac = (home.h * 3600 + home.mi * 60 + home.s) / 86400;
    setHand(frac);
    const states = cfg.sessions.map((s) => { const c = ivs(s, now); return { s, st: TZ.sessionState(s, now, c.ivs), c }; });
    const before = tlKey;
    renderDial(now, states);
    renderKeyTime(now);
    if (VIEW !== 'full') return;
    if (before !== tlKey) renderBars(now, states);

    let h = home.h, ap = '';
    if (cfg.hour12) { ap = home.h >= 12 ? 'PM' : 'AM'; h = home.h % 12 || 12; }
    setText($('#hm'), 'hm', pad(h) + ':' + pad(home.mi));
    setText($('#sec'), 'sec', ':' + pad(home.s));
    setText($('#ampm'), 'ap', ap);
    setText($('#dateEn'), 'den', dEn.format(now));
    setText($('#dateFa'), 'dfa', dateFa(now));
    setText($('#tzTag'), 'tz', TZ.formatOffset(now, HOME));
    for (const { s, st } of states) {
      const r = rows[s.id]; if (!r) continue;
      const k = s.id + ':';
      setText(r.lt, k + 'lt', fmt(st.local, false));
      setText(r.off, k + 'off', offShort(now, s.tz));
      setText(r.tag, k + 'tag', st.active ? 'OPEN' : 'CLOSED');
      r.e.classList.toggle('active', st.active);
      const shown = st.current || st.nextInterval;
      setText(r.sub, k + 'sub', shown
        ? fmt({ h: TZ.partsInZone(shown.open, s.tz).h, mi: TZ.partsInZone(shown.open, s.tz).mi }) + '\u2013' + hmAt(shown.close, s.tz) + ' \u00b7 ' + hmAt(shown.open, HOME) + '\u2013' + hmAt(shown.close, HOME) + ' Tehran'
        : 'no upcoming session');
      setText(r.cd, k + 'cd', st.nextEvent ? (st.nextType === 'close' ? 'closes in ' : 'opens in ') + TZ.formatCountdown(st.nextEvent - now) : '\u2014');
    }
    renderEvents(now, states);
    renderOverlapsLine(now, states);
    const nl = $('#nowline'), np = $('#nowpill');
    nl.style.left = (frac * 100).toFixed(3) + '%'; np.style.left = (frac * 100).toFixed(3) + '%';
    setText(np, 'now', 'NOW ' + fmt(home, false));
  }

  function loop() {
    clearTimeout(timer);
    if (!visible || document.hidden) return;
    render();
    timer = setTimeout(loop, 1000 - (Date.now() % 1000) + 3);
  }
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) loop(); });

  // ---------- settings UI ----------
  function applyZoom() { document.documentElement.style.zoom = String(window.innerWidth / (VIEW === 'compact' ? 380 : 390)); }
  function applyCfg() {
    document.documentElement.dataset.theme = cfg.theme;
    const dark = cfg.theme === 'dark';
    ['#tDark', '#cDark'].forEach((s) => $(s).setAttribute('aria-pressed', String(dark)));
    ['#tLight', '#cLight'].forEach((s) => $(s).setAttribute('aria-pressed', String(!dark)));
    $('#app').classList.toggle('locked', cfg.locked);
    ['#bPin', '#cPin'].forEach((s) => $(s).classList.toggle('on', cfg.alwaysOnTop));
    ['#bLock', '#cLock'].forEach((s) => $(s).classList.toggle('on', cfg.locked));
    $('#bPin').title = cfg.alwaysOnTop ? 'Always on top: ON' : 'Always on top: OFF';
    $('#bLock').title = cfg.locked ? 'Position & size locked (click to unlock)' : 'Lock position & size';
    $('#opacMain').value = Math.round(cfg.opacity * 100);
    $('#opac').value = Math.round(cfg.opacity * 100); $('#opacV').textContent = Math.round(cfg.opacity * 100) + '%';
    $('#viewMode').value = cfg.viewMode; $('#themeSel').value = cfg.theme;
    $('#optTop').checked = cfg.alwaysOnTop; $('#optLock').checked = cfg.locked; $('#optStart').checked = cfg.startWithWindows;
    $('#opt12').checked = cfg.hour12; $('#optTray').checked = cfg.closeToTray;
    $('#cfgFile').textContent = 'Settings file: ' + cfg.file;
  }
  function buildSessEdit() {
    const box = $('#sessEdit'); box.innerHTML = '';
    cfg.sessions.forEach((s) => {
      const e = document.createElement('div'); e.className = 'e'; e.dataset.id = s.id;
      e.innerHTML = '<b></b><input type="text" class="o" maxlength="5" placeholder="HH:MM"><input type="text" class="c" maxlength="5" placeholder="HH:MM"><input type="text" class="hol" placeholder="holidays YYYY-MM-DD, …">';
      e.querySelector('b').textContent = s.name; e.querySelector('.o').value = s.open; e.querySelector('.c').value = s.close;
      e.querySelector('.hol').value = (s.holidays || []).join(', ');
      box.appendChild(e);
    });
  }
  async function pushSettings(p) { cfg = await window.fx.setSettings(p); }

  function wire() {
    const set = (p) => window.fx.setSettings(p);
    const toggleTop = () => set({ alwaysOnTop: !cfg.alwaysOnTop }), toggleLock = () => set({ locked: !cfg.locked });
    $('#bPin').onclick = toggleTop; $('#cPin').onclick = toggleTop;
    $('#bLock').onclick = toggleLock; $('#cLock').onclick = toggleLock;
    $('#bHide').onclick = () => window.fx.hide(); $('#cHide').onclick = () => window.fx.hide();
    $('#bMax').onclick = () => set({ viewMode: 'compact' });      // maximize / restore = full <-> compact
    $('#cView').onclick = () => set({ viewMode: 'full' });
    $('#cCfg').onclick = () => window.fx.openSettings();
    ['#tLight', '#cLight'].forEach((s) => { $(s).onclick = () => set({ theme: 'light' }); });
    ['#tDark', '#cDark'].forEach((s) => { $(s).onclick = () => set({ theme: 'dark' }); });
    $('#app').addEventListener('contextmenu', () => window.fx.popupMenu());
    (function grip() {                                 // bottom edge of the card: height drag, width follows (fixed aspect), content scales
      const compact = VIEW === 'compact';
      const gp = $(compact ? '#compactGrip' : '#vgrip'); let rs = null, raf = 0, want = 0;
      gp.addEventListener('pointerdown', (e) => { if (e.button !== 0 || cfg.locked) return; e.preventDefault(); try { gp.setPointerCapture(e.pointerId); } catch (x) { /* synthetic pointer */ } rs = { x: e.screenX, y: e.screenY, w: window.innerWidth, h: window.innerHeight }; });
      gp.addEventListener('pointermove', (e) => {
        if (!rs) return;
        want = compact ? rs.w + ((e.screenX - rs.x) + (e.screenY - rs.y)) / 2
          : rs.w * (1 + (e.screenY - rs.y) / rs.h);   // height h = w * aspect, so dh/h == dw/w
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; window.fx.resize(want); });
      });
      const end = () => { rs = null; };
      gp.addEventListener('pointerup', end); gp.addEventListener('pointercancel', end);
    })();
    window.addEventListener('resize', applyZoom);
    $('#viewMode').onchange = (e) => set({ viewMode: e.target.value });
    $('#themeSel').onchange = (e) => set({ theme: e.target.value });
    $('#bCfg').onclick = () => { const s = $('#settings'); s.hidden = !s.hidden; if (!s.hidden) buildSessEdit(); };
    $('#cfgClose').onclick = () => { $('#settings').hidden = true; };
    $('#btnQuit').onclick = () => window.fx.quit();
    $('#opacMain').oninput = (e) => set({ opacity: e.target.value / 100 });
    $('#opac').oninput = (e) => set({ opacity: e.target.value / 100 });
    $('#optTop').onchange = (e) => set({ alwaysOnTop: e.target.checked });
    $('#optLock').onchange = (e) => set({ locked: e.target.checked });
    $('#optStart').onchange = (e) => set({ startWithWindows: e.target.checked });
    $('#opt12').onchange = (e) => set({ hour12: e.target.checked });
    $('#optTray').onchange = (e) => set({ closeToTray: e.target.checked });
    $('#sessReset').onclick = async () => { cfg = await window.fx.resetSessions(); buildSessEdit(); msg('Defaults restored', true); };
    $('#sessApply').onclick = async () => {
      try {
        const next = cfg.sessions.map((s) => {
          const e = document.querySelector('.e[data-id="' + s.id + '"]');
          const hol = e.querySelector('.hol').value.split(/[,\s]+/).filter(Boolean);
          hol.forEach((d) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('Bad holiday date "' + d + '"'); });
          const n = Object.assign({}, s, { open: e.querySelector('.o').value, close: e.querySelector('.c').value, holidays: hol });
          TZ.validateSession(n); return n;
        });
        await pushSettings({ sessions: next }); msg('Saved', true);
      } catch (err) { msg(err.message, false); }
    };
    window.fx.onSettings((s) => { const rebuild = JSON.stringify(s.sessions) !== JSON.stringify(cfg.sessions); cfg = s; applyCfg(); if (rebuild) { buildSessions(); } render(); });
    window.fx.onVisibility((v) => { visible = v; if (v) loop(); else clearTimeout(timer); });
    window.fx.onTickNow(() => { keyWindow = null; cache.clear(); tlKey = ''; if (visible) loop(); });
  }
  function msg(t, ok) { const m = $('#sessMsg'); m.textContent = t; m.className = 'msg' + (ok ? ' ok' : ''); }

  (async function init() {
    cfg = await window.fx.getSettings();
    buildDial(); buildSessions(); if (VIEW === 'full') buildEvents(); applyCfg(); wire(); applyZoom();
    if (new URLSearchParams(location.search).get('cfg') === '1') $('#bCfg').click();
    loop();
  })();
})();

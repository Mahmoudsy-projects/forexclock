/*
 * tz.js - time zone + Forex session engine (pure functions, no UI, no Electron).
 *
 * All zone math is done through the IANA tz database that ships inside the
 * JavaScript runtime (Intl.DateTimeFormat / ICU). Fixed UTC offsets are NEVER
 * used: the offset of every zone is looked up for the exact instant in question.
 *
 * Works both as a CommonJS module (main process, tests) and as a plain
 * <script> in the renderer (exposes window.TZ).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TZ = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const HOUR = 3600e3;
  const DAY = 24 * HOUR;

  // ---- default, user-configurable session definitions -------------------
  // open/close are LOCAL wall-clock times in the session's own IANA zone, so
  // DST of each region is followed automatically.  days: 0=Sun ... 6=Sat
  // (local weekday on which the session OPENS). holidays: local dates
  // "YYYY-MM-DD" on which that session does not open.
  const DEFAULT_SESSIONS = [
    { id: 'sydney',  name: 'Sydney',   tz: 'Australia/Sydney',  open: '07:00', close: '16:00', days: [1, 2, 3, 4, 5], holidays: [] },
    { id: 'tokyo',   name: 'Tokyo',    tz: 'Asia/Tokyo',        open: '09:00', close: '18:00', days: [1, 2, 3, 4, 5], holidays: [] },
    { id: 'london',  name: 'London',   tz: 'Europe/London',     open: '08:00', close: '17:00', days: [1, 2, 3, 4, 5], holidays: [] },
    { id: 'newyork', name: 'New York', tz: 'America/New_York',  open: '08:00', close: '17:00', days: [1, 2, 3, 4, 5], holidays: [] },
  ];
  const HOME_TZ = 'Asia/Tehran';

  // ---- Intl helpers ------------------------------------------------------
  const fmtCache = new Map();
  function dtf(tz) {
    let f = fmtCache.get(tz);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short',
      });
      fmtCache.set(tz, f);
    }
    return f;
  }
  const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  /** Wall-clock parts of instant utcMs in zone tz. weekday: 0=Sun. */
  function partsInZone(utcMs, tz) {
    const o = {};
    for (const p of dtf(tz).formatToParts(new Date(utcMs))) o[p.type] = p.value;
    return {
      y: +o.year, mo: +o.month, d: +o.day,
      h: +o.hour % 24, mi: +o.minute, s: +o.second,
      weekday: WD[o.weekday],
    };
  }

  /** UTC offset (ms, east positive) of zone tz at instant utcMs. */
  function getOffsetMs(utcMs, tz) {
    const t = Math.floor(utcMs / 1000) * 1000;
    const p = partsInZone(t, tz);
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - t;
  }

  /**
   * Convert a local wall-clock time in zone tz to a UTC instant (ms).
   * Ambiguous time (clock set back): earlier instant is returned.
   * Non-existent time (clock set forward): the instant just after the gap.
   */
  function zonedToUtc(y, mo, d, h, mi, tz, s) {
    s = s || 0;
    const guess = Date.UTC(y, mo - 1, d, h, mi, s);
    const o1 = getOffsetMs(guess, tz);
    const c1 = guess - o1;
    const o2 = getOffsetMs(c1, tz);
    const c2 = guess - o2;
    const matches = (c) => {
      const p = partsInZone(c, tz);
      return p.y === y && p.mo === mo && p.d === d && p.h === h && p.mi === mi;
    };
    const ok = [c1, c2].filter(matches);
    if (ok.length) return Math.min(...ok);
    return Math.max(c1, c2);
  }

  const pad = (n) => String(n).padStart(2, '0');
  function parseHM(str) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(str).trim());
    if (!m) throw new Error('Bad time "' + str + '" (use HH:MM)');
    const h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) throw new Error('Bad time "' + str + '"');
    return [h, mi];
  }
  const dateKey = (y, mo, d) => y + '-' + pad(mo) + '-' + pad(d);

  // ---- session engine ----------------------------------------------------
  /**
   * All [open, close) intervals (UTC ms) of a session whose local opening date
   * lies within [-backDays, +fwdDays] of "now" in the session's own zone.
   */
  function sessionIntervals(sess, nowMs, backDays, fwdDays) {
    backDays = backDays == null ? 2 : backDays;
    fwdDays = fwdDays == null ? 9 : fwdDays;
    const [oh, om] = parseHM(sess.open);
    const [ch, cm] = parseHM(sess.close);
    const overnight = ch * 60 + cm <= oh * 60 + om;
    const p = partsInZone(nowMs, sess.tz);
    const out = [];
    for (let k = -backDays; k <= fwdDays; k++) {
      const base = new Date(Date.UTC(p.y, p.mo - 1, p.d + k));
      const y = base.getUTCFullYear(), mo = base.getUTCMonth() + 1, d = base.getUTCDate();
      if (!sess.days.includes(base.getUTCDay())) continue;
      if ((sess.holidays || []).includes(dateKey(y, mo, d))) continue;
      const open = zonedToUtc(y, mo, d, oh, om, sess.tz);
      let close;
      if (overnight) {
        const nx = new Date(Date.UTC(y, mo - 1, d + 1));
        close = zonedToUtc(nx.getUTCFullYear(), nx.getUTCMonth() + 1, nx.getUTCDate(), ch, cm, sess.tz);
      } else close = zonedToUtc(y, mo, d, ch, cm, sess.tz);
      out.push({ open, close });
    }
    return out.sort((a, b) => a.open - b.open);
  }

  /** Current state of one session. */
  function sessionState(sess, nowMs, ivs) {
    const iv = ivs || sessionIntervals(sess, nowMs);
    const cur = iv.find((i) => nowMs >= i.open && nowMs < i.close);
    const next = iv.find((i) => i.open > nowMs);
    const local = partsInZone(nowMs, sess.tz);
    return {
      id: sess.id, name: sess.name, tz: sess.tz, local,
      active: !!cur,
      current: cur || null,
      nextOpen: next ? next.open : null,
      nextInterval: next || null,
      // the next boundary: closing if open now, otherwise next opening
      nextEvent: cur ? cur.close : (next ? next.open : null),
      nextType: cur ? 'close' : 'open',
      intervals: iv,
    };
  }

  /** Overlap between two sessions: current one (active) or the next upcoming. */
  function overlapIntervals(a, b) {
    const list = [];
    for (const x of a) for (const y of b) {
      const s = Math.max(x.open, y.open), e = Math.min(x.close, y.close);
      if (e > s) list.push({ open: s, close: e });
    }
    return list.sort((p, q) => p.open - q.open);
  }
  function overlapBetween(sessA, sessB, nowMs, ivA, ivB) {
    const list = overlapIntervals(ivA || sessionIntervals(sessA, nowMs), ivB || sessionIntervals(sessB, nowMs))
      .map((o) => ({ start: o.open, end: o.close }));
    const hit = list.find((o) => o.end > nowMs);
    if (!hit) return null;
    return { active: nowMs >= hit.start, start: hit.start, end: hit.end };
  }

  /** Names of all sessions currently open (for generic overlap highlighting). */
  function activeIds(states) { return states.filter((s) => s.active).map((s) => s.id); }

  // ---- formatting / layout helpers --------------------------------------
  function formatCountdown(ms) {
    ms = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(ms / 86400), h = Math.floor((ms % 86400) / 3600);
    const m = Math.floor((ms % 3600) / 60), s = ms % 60;
    return (d ? d + 'd ' : '') + pad(h) + ':' + pad(m) + ':' + pad(s);
  }
  function formatHM(utcMs, tz) { const p = partsInZone(utcMs, tz); return pad(p.h) + ':' + pad(p.mi); }
  function formatOffset(utcMs, tz) {
    const m = Math.round(getOffsetMs(utcMs, tz) / 60000), a = Math.abs(m);
    return 'UTC' + (m < 0 ? '-' : '+') + pad(Math.floor(a / 60)) + (a % 60 ? ':' + pad(a % 60) : '');
  }

  /** UTC instants of local midnight (start of day) and the next one in zone tz. */
  function dayWindow(nowMs, tz) {
    const p = partsInZone(nowMs, tz);
    const start = zonedToUtc(p.y, p.mo, p.d, 0, 0, tz);
    const n = new Date(Date.UTC(p.y, p.mo - 1, p.d + 1));
    const end = zonedToUtc(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate(), 0, 0, tz);
    return { start, end };
  }

  /** Intervals clipped to a window and expressed as 0..1 fractions of it. */
  function segmentsInWindow(intervals, w) {
    const span = w.end - w.start, out = [];
    for (const i of intervals) {
      const s = Math.max(i.open, w.start), e = Math.min(i.close, w.end);
      if (e > s) out.push({ from: (s - w.start) / span, to: (e - w.start) / span });
    }
    return out;
  }

  function validateSession(s) {
    parseHM(s.open); parseHM(s.close);
    dtf(s.tz); // throws RangeError for an unknown IANA zone
    return true;
  }

  return {
    HOUR, DAY, DEFAULT_SESSIONS, HOME_TZ,
    partsInZone, getOffsetMs, zonedToUtc, parseHM,
    sessionIntervals, overlapIntervals, sessionState, overlapBetween, activeIds,
    formatCountdown, formatHM, formatOffset, dayWindow, segmentsInWindow, validateSession,
  };
});

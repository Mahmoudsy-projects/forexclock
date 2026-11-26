'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TZ = require('../src/tz.js');
const H = 3600e3;
const U = (s) => Date.parse(s); // ISO with Z
const off = (t, z) => TZ.getOffsetMs(t, z) / H;
const S = (id) => TZ.DEFAULT_SESSIONS.find((s) => s.id === id);
const iso = (ms) => new Date(ms).toISOString().slice(0, 16) + 'Z';

test('1. normal winter time (15 Jan 2026)', () => {
  const t = U('2026-01-15T12:00:00Z');
  assert.equal(off(t, 'Asia/Tehran'), 3.5);
  assert.equal(off(t, 'Europe/London'), 0);
  assert.equal(off(t, 'America/New_York'), -5);
  assert.equal(off(t, 'Asia/Tokyo'), 9);
  assert.equal(off(t, 'Australia/Sydney'), 11); // southern summer = DST
});

test('2. normal summer time (15 Jul 2026)', () => {
  const t = U('2026-07-15T12:00:00Z');
  assert.equal(off(t, 'Asia/Tehran'), 3.5); // Iran has no DST since 2022
  assert.equal(off(t, 'Europe/London'), 1);
  assert.equal(off(t, 'America/New_York'), -4);
  assert.equal(off(t, 'Asia/Tokyo'), 9);
  assert.equal(off(t, 'Australia/Sydney'), 10); // southern winter = standard
});

test('3. European DST transition (29 Mar 2026, 01:00 UTC)', () => {
  assert.equal(off(U('2026-03-29T00:59:59Z'), 'Europe/London'), 0);
  assert.equal(off(U('2026-03-29T01:00:00Z'), 'Europe/London'), 1);
  assert.equal(off(U('2026-03-29T01:00:00Z'), 'America/New_York'), -4); // US already switched
  // London session open before/after the change
  const fri = TZ.sessionIntervals(S('london'), U('2026-03-27T12:00:00Z'));
  const mon = TZ.sessionIntervals(S('london'), U('2026-03-30T12:00:00Z'));
  assert.ok(fri.some((i) => iso(i.open) === '2026-03-27T08:00Z')); // GMT
  assert.ok(mon.some((i) => iso(i.open) === '2026-03-30T07:00Z')); // BST
  // October end of DST (25 Oct 2026, 01:00 UTC)
  assert.equal(off(U('2026-10-25T00:59:59Z'), 'Europe/London'), 1);
  assert.equal(off(U('2026-10-25T01:00:00Z'), 'Europe/London'), 0);
});

test('4. US DST transition (8 Mar 2026 07:00 UTC, 1 Nov 2026 06:00 UTC)', () => {
  assert.equal(off(U('2026-03-08T06:59:59Z'), 'America/New_York'), -5);
  assert.equal(off(U('2026-03-08T07:00:00Z'), 'America/New_York'), -4);
  assert.equal(off(U('2026-11-01T05:59:59Z'), 'America/New_York'), -4);
  assert.equal(off(U('2026-11-01T06:00:00Z'), 'America/New_York'), -5);
  const fri = TZ.sessionIntervals(S('newyork'), U('2026-03-06T12:00:00Z'));
  const mon = TZ.sessionIntervals(S('newyork'), U('2026-03-09T12:00:00Z'));
  assert.ok(fri.some((i) => iso(i.open) === '2026-03-06T13:00Z')); // EST
  assert.ok(mon.some((i) => iso(i.open) === '2026-03-09T12:00Z')); // EDT
});

test('5. weeks where Europe and US have different offsets (spring: 8-28 Mar, autumn: 26 Oct-31 Oct 2026)', () => {
  for (const day of ['2026-03-10', '2026-03-20', '2026-03-28', '2026-10-27', '2026-10-31']) {
    const t = U(day + 'T12:00:00Z');
    assert.equal(off(t, 'America/New_York') - off(t, 'Europe/London'), -4, day + ' gap should be 4h');
  }
  for (const day of ['2026-02-10', '2026-04-10', '2026-07-10', '2026-11-10']) {
    const t = U(day + 'T12:00:00Z');
    assert.equal(off(t, 'America/New_York') - off(t, 'Europe/London'), -5, day + ' gap should be 5h');
  }
  // London/NY overlap length: 4h normally (13-17Z), 5h in the gap weeks (12-17Z)
  const ov = (d) => TZ.overlapBetween(S('london'), S('newyork'), U(d));
  const normal = ov('2026-02-10T00:00:00Z'), gap = ov('2026-03-10T00:00:00Z');
  assert.equal(iso(normal.start) + '/' + iso(normal.end), '2026-02-10T13:00Z/2026-02-10T17:00Z');
  assert.equal(iso(gap.start) + '/' + iso(gap.end), '2026-03-10T12:00Z/2026-03-10T17:00Z');
  assert.equal(ov('2026-07-14T14:00:00Z').active, true);
});

test('6. Sydney seasonal changes (5 Apr and 4 Oct 2026)', () => {
  assert.equal(off(U('2026-04-04T15:59:59Z'), 'Australia/Sydney'), 11);
  assert.equal(off(U('2026-04-04T16:00:00Z'), 'Australia/Sydney'), 10);
  assert.equal(off(U('2026-10-03T15:59:59Z'), 'Australia/Sydney'), 10);
  assert.equal(off(U('2026-10-03T16:00:00Z'), 'Australia/Sydney'), 11);
  const before = TZ.sessionIntervals(S('sydney'), U('2026-04-03T00:00:00Z'));
  const after = TZ.sessionIntervals(S('sydney'), U('2026-04-07T00:00:00Z'));
  assert.ok(before.some((i) => iso(i.open) === '2026-04-02T20:00Z')); // Fri 03 Apr 07:00 AEDT
  assert.ok(after.some((i) => iso(i.open) === '2026-04-06T21:00Z')); // Tue 07 Apr 07:00 AEST
});

test('7. Tokyo has no DST, Tehran is fixed +03:30', () => {
  for (const m of ['01', '04', '07', '10']) {
    const t = U('2026-' + m + '-15T12:00:00Z');
    assert.equal(off(t, 'Asia/Tokyo'), 9);
    assert.equal(off(t, 'Asia/Tehran'), 3.5);
  }
});

test('8. session state: active/closed, countdown target, weekend skip', () => {
  const lon = S('london');
  let st = TZ.sessionState(lon, U('2026-07-15T10:00:00Z')); // Wed, 11:00 BST
  assert.equal(st.active, true);
  assert.equal(iso(st.nextEvent), '2026-07-15T16:00Z'); // closes 17:00 BST
  assert.equal(st.nextType, 'close');
  st = TZ.sessionState(lon, U('2026-07-15T17:00:00Z')); // exactly at close -> closed
  assert.equal(st.active, false);
  assert.equal(iso(st.nextEvent), '2026-07-16T07:00Z');
  st = TZ.sessionState(lon, U('2026-07-18T12:00:00Z')); // Saturday
  assert.equal(st.active, false);
  assert.equal(iso(st.nextEvent), '2026-07-20T07:00Z'); // Monday
  assert.equal(st.nextType, 'open');
});

test('9. zonedToUtc handles DST gap and overlap', () => {
  // NY 2026-03-08 02:30 does not exist -> resolved just after the gap (03:30 EDT = 07:30Z)
  assert.equal(iso(TZ.zonedToUtc(2026, 3, 8, 2, 30, 'America/New_York')), '2026-03-08T07:30Z');
  // NY 2026-11-01 01:30 happens twice -> first (EDT) = 05:30Z
  assert.equal(iso(TZ.zonedToUtc(2026, 11, 1, 1, 30, 'America/New_York')), '2026-11-01T05:30Z');
  assert.equal(iso(TZ.zonedToUtc(2026, 7, 1, 8, 0, 'Europe/London')), '2026-07-01T07:00Z');
});

test('10. overnight session and holidays are supported by config', () => {
  const night = { id: 'x', name: 'X', tz: 'Asia/Tokyo', open: '22:00', close: '06:00', days: [1, 2, 3, 4, 5], holidays: [] };
  const st = TZ.sessionState(night, U('2026-07-14T15:00:00Z')); // Wed 00:00 JST -> inside Tue 22:00 session
  assert.equal(st.active, true);
  const hol = Object.assign({}, S('london'), { holidays: ['2026-07-15'] });
  const s2 = TZ.sessionState(hol, U('2026-07-15T10:00:00Z'));
  assert.equal(s2.active, false);
  assert.equal(iso(s2.nextEvent), '2026-07-16T07:00Z');
});

test('11. no drift: results depend only on the instant, not on system zone', () => {
  const t = U('2026-07-15T12:00:00Z');
  const p = TZ.partsInZone(t, 'Asia/Tehran');
  assert.deepEqual([p.h, p.mi], [15, 30]);
  assert.equal(TZ.formatOffset(t, 'Asia/Tehran'), 'UTC+03:30');
  assert.equal(TZ.formatCountdown(90061000), '1d 01:01:01');
});

test('12. validation of user supplied config', () => {
  assert.ok(TZ.validateSession(S('london')));
  assert.throws(() => TZ.validateSession({ tz: 'Mars/Base', open: '07:00', close: '16:00' }));
  assert.throws(() => TZ.validateSession({ tz: 'Asia/Tokyo', open: '7am', close: '16:00' }));
});

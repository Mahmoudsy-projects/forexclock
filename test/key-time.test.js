'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { activeWindow } = require('../src/key-time');

function windowAt(iso) {
  const { previous, next } = activeWindow(Date.parse(iso));
  return [new Date(previous).toISOString(), new Date(next).toISOString()];
}

test('US summer time changes New York points before Europe changes its clocks', () => {
  assert.deepEqual(windowAt('2026-03-06T14:20:00Z'),
    ['2026-03-06T13:30:00.000Z', '2026-03-06T14:30:00.000Z']);
  assert.deepEqual(windowAt('2026-03-13T13:20:00Z'),
    ['2026-03-13T12:30:00.000Z', '2026-03-13T13:30:00.000Z']);
});

test('Frankfurt and London shift on their own DST date', () => {
  assert.deepEqual(windowAt('2026-03-27T07:15:00Z'),
    ['2026-03-27T07:00:00.000Z', '2026-03-27T08:00:00.000Z']);
  assert.deepEqual(windowAt('2026-03-30T06:15:00Z'),
    ['2026-03-30T06:00:00.000Z', '2026-03-30T07:00:00.000Z']);
});

test('Sydney moves independently and Tokyo does not change', () => {
  assert.deepEqual(windowAt('2026-04-03T05:30:00Z'),
    ['2026-04-03T05:00:00.000Z', '2026-04-03T06:00:00.000Z']);
  assert.deepEqual(windowAt('2026-04-06T05:30:00Z'),
    ['2026-04-06T04:00:00.000Z', '2026-04-06T06:00:00.000Z']);
});

test('at the exact point the countdown advances across Tehran midnight', () => {
  assert.deepEqual(windowAt('2026-07-15T21:00:00Z'),
    ['2026-07-15T21:00:00.000Z', '2026-07-16T00:00:00.000Z']);
});

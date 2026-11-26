'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./tz'));
  else root.KeyTime = factory(root.TZ);
})(globalThis, function (TZ) {
  const ny = 'America/New_York', tokyo = 'Asia/Tokyo', london = 'Europe/London';
  // RiskManager MT4 v112, RM_Tools.mqh: main points first for coincident times.
  const schedule = [
    [ny, 17, 0], [tokyo, 9, 0], [tokyo, 10, 0], ['Europe/Berlin', 8, 0],
    [london, 8, 0], [ny, 9, 30], [ny, 11, 0], [ny, 13, 0],
    [tokyo, 13, 0], ['Australia/Sydney', 16, 0], [tokyo, 19, 0], [ny, 8, 30],
    [ny, 14, 0], [ny, 16, 0], [london, 17, 0], [tokyo, 18, 0],
  ];

  function activeWindow(now) {
    let previous = -Infinity, next = Infinity;
    for (const [zone, hour, minute] of schedule) {
      const local = TZ.partsInZone(now, zone);
      for (const offset of [-1, 0, 1]) {
        const day = new Date(Date.UTC(local.y, local.mo - 1, local.d + offset));
        const point = TZ.zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1,
          day.getUTCDate(), hour, minute, zone);
        if (point <= now) previous = Math.max(previous, point);
        else next = Math.min(next, point);
      }
    }
    return { previous, next };
  }

  return { activeWindow };
});

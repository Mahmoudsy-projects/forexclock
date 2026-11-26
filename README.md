# Forex Clock – Tehran time + Forex sessions desktop widget (Windows 10/11)

A standalone floating desktop widget (Electron, no browser window, no internet needed) that shows
Tehran time (digital + 24-hour radial dial) and the four Forex sessions – Sydney, Tokyo, London,
New York – with live status, countdowns and London × New York overlap highlighting.

## 1. Install & launch
**Portable (no installation):** copy [`ForexClock-portable-2.2.0.exe`](https://github.com/Mahmoudsy-projects/forexclock/releases/tag/v2.2.0) anywhere you like (e.g. `C:\Tools\ForexClock\`)
and double-click it. Windows 10 / 11, 64-bit. First start takes a few seconds (self-extraction).
SmartScreen may warn because the file is unsigned: *More info → Run anyway*.

**From source** (needs Node.js 20+): `npm install` → `npm start`. Build the exe on any OS: `npm run dist`.
Tests: `npm test` (time engine) and `xvfb-run -a npx electron --no-sandbox test/e2e.js` (app, Linux CI).

[راهنمای فارسی (PDF)](docs/ForexClock-Guide-fa.pdf) · For the GitHub release build, verify the checksum in the release’s `SHA256SUMS.txt`.

## 2. Start with Windows
Open ⚙ settings (or right-click the clock / tray icon) → tick **Start with Windows**. The app registers
itself in `HKCU\...\Run` for the current user via Electron's login-item API. For the portable build it registers the
real path of the .exe you launched – so **keep the file in its final folder before enabling it**; if you move it, untick and re-tick the option.
Manual alternative: `Win+R` → `shell:startup` → put a shortcut to the exe in that folder.

## 3. Using the widget
| Feature | How |
|---|---|
| Move | drag anywhere on the card (full) or on the dial (compact) |
| Resize (full) | drag the little grip bar at the bottom edge of the card; the whole card scales (fixed aspect) |
| Resize (compact) | drag the lower-right grip to resize continuously |
| Key Time | Both views count down to the next RiskManager MT4 v112 point and show the active interval as an outer arc. Full view adds dashed markers for the previous and next points that fall on the displayed Tehran day. Each point follows its own market’s local time and DST rules. |
| Always on top | pin button (gold = on) / settings / tray menu (default ON) |
| Lock position & size | lock button / settings / tray menu |
| Light / dark theme | sun / moon buttons (header in full view, in the bottom toolbar in compact); remembered after restart |
| Transparency | Opacity slider at the bottom of the card (40–100 %) or tray → Transparency |
| Minimize to tray | “–” button or minimize; the “×” also hides to tray (option) |
| Full ⇄ Compact | square button (maximize/restore) in the header or compact toolbar; tray → *Compact view*; settings → View |
| Settings | gear button (in the compact toolbar it opens the full view with the panel) |
| Restore | left-click / double-click the tray icon (or tray → Show widget) |
| Quit | tray → Quit, or settings → Quit application |
| Session hours | settings → Session hours (local time of each market) + optional local holidays |

Size, position, opacity, lock, always-on-top, session hours etc. are saved to
`%APPDATA%\Forex Clock\settings.json` and restored on the next start. If the saved position is no longer on a
connected monitor (unplugged / resolution change) the widget is moved onto the primary display automatically.
Only one instance runs; starting it again brings the existing widget to the front.

## 4. Reading the display
* Header: TEHRAN + UTC offset (from the tz database). Big clock: Tehran time with gold seconds, Gregorian + Persian date.
* **24-hour dial** (design D/E): 00 at the top, clockwise, Tehran hours; hand = current Tehran time. Rings from the outside in: Sydney, Tokyo, London, New York,
  each drawn as an arc over the Tehran day with its name written along the ring (SVG textPath). Open sessions are solid, closed ones 55 % transparent.
  The gold translucent band + outline is the London × New York overlap.
* Gold strip: overlap state + countdown + Tehran range. Below: 0–24 timeline per session (local clock, UTC offset, countdown, OPEN / OVERLAP / CLOSED tag), gold overlap column and NOW line.

## 5. Time-zone & DST implementation
* Everything is computed in `src/tz.js` from the **IANA time-zone database built into the runtime** (ICU via `Intl.DateTimeFormat`)
  using the required zones `Asia/Tehran`, `Australia/Sydney`, `Asia/Tokyo`, `Europe/London`, `America/New_York`.
  **No fixed UTC offsets are used anywhere.** The offset of each zone is looked up for the exact instant being evaluated.
* A session is defined by *local wall-clock* open/close times **in its own zone** (defaults: Sydney 07:00–16:00, Tokyo 09:00–18:00,
  London 08:00–17:00, New York 08:00–17:00, Mon–Fri). Each day's open/close is converted to a UTC instant with `zonedToUtc()`
  (handles clock-set-forward gaps and clock-set-back overlaps). Consequently Europe's, the US's and Australia's DST changes are
  followed independently, with no manual adjustment – e.g. London × NY overlap is 4 h normally but 5 h in the weeks when the US
  has switched to DST and Europe has not (second Sunday of March → last Sunday of March; and last Sunday of October → first Sunday of November).
* Tokyo has no DST. Tehran follows whatever the bundled tz database says; under the law in force since 2022 Iran is a fixed UTC+03:30.
  Rule changes arrive with Electron/Chromium updates (rebuild with a newer Electron to pick up new tzdata).
* The displayed time is always derived from `Date.now()` on every tick (aligned to the second, no accumulated drift), so system clock
  changes, sleep/resume and system time-zone changes are harmless (a power-resume event forces an immediate refresh).
* **Hours are configurable** (settings UI or `settings.json` → `sessions[]`: `open`, `close`, `days` (0=Sun…6=Sat of the local opening day),
  `holidays` as local `YYYY-MM-DD`, overnight sessions where close < open are supported).
* **Limits to be aware of:** holidays are *not* auto-detected (no holiday calendar is bundled) – add them in settings. Sessions are
  shown as simple Mon–Fri blocks; real interbank liquidity is not a hard on/off switch and the weekly Forex close (Fri 17:00 NY)
  is represented by the individual sessions closing, not as a separate event.

## 6. Resource use
One 1 Hz timer aligned to the second, nothing runs while the widget is hidden in the tray,
and session intervals are cached for 60 s. Memory and CPU were not measured on Windows.

## 7. Project layout
```
src/tz.js        time-zone / DST / session engine (pure functions, unit-tested)
src/main.js      window, tray, settings persistence, startup, multi-monitor handling
src/preload.js   minimal, sandboxed IPC bridge
src/index.html, style.css, renderer.js, boot.js   UI (design D full / E compact, themes, settings)
test/*.test.js   time zone and Key Time tests    test/e2e.js  app-level tests (Electron under xvfb)
assets/          icons + fonts/ (Space Grotesk, JetBrains Mono, Vazirmatn – bundled, no internet)
design/          reference designs (CombinedD / CompactE)            docs/  screenshots + test results
```

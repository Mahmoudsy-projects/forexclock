# Test report – Forex Clock 2.0.0 (new design)
Run date: 2026-11-13. Engine tests: Node 22 (ICU tz data bundled with the runtime). App tests: Electron 33 on **Linux under Xvfb**.

## A. Time / DST engine – `npm test` → 12/12 pass
All tests were also run with the *system* time zone set to Asia/Tehran and America/Los_Angeles (12/12 each) to prove results do not depend on the PC's own zone.

| # | Scenario | Verified |
|---|---|---|
| 1 | Normal winter (15 Jan 2026) | Tehran +3:30, London +0, New York −5, Tokyo +9, Sydney +11 (southern summer) |
| 2 | Normal summer (15 Jul 2026) | Tehran +3:30 (no DST), London +1, New York −4, Tokyo +9, Sydney +10 |
| 3 | European DST transition | London offset flips 0→+1 exactly at 29 Mar 2026 01:00 UTC (and back 25 Oct); London open moves 08:00Z (Fri 27 Mar) → 07:00Z (Mon 30 Mar) |
| 4 | US DST transition | NY flips −5→−4 at 8 Mar 2026 07:00 UTC, back at 1 Nov 06:00 UTC; NY open 13:00Z (Fri 6 Mar) → 12:00Z (Mon 9 Mar) |
| 5 | Weeks with different Europe/US offsets | London–NY gap is 4 h on 10/20/28 Mar and 27/31 Oct 2026, 5 h on normal dates; London×NY overlap = 13:00–17:00Z normally, **12:00–17:00Z** in the gap weeks |
| 6 | Sydney seasonal change | +11→+10 at 4 Apr 2026 16:00Z, +10→+11 at 3 Oct 16:00Z; session open 02 Apr 20:00Z → 06 Apr 21:00Z |
| 7 | Tokyo / Tehran fixed | Tokyo +9 and Tehran +3:30 in Jan/Apr/Jul/Oct |
| 8 | Session state | active/closed, boundary instant is closed, countdown target, weekend skipped to Monday |
| 9 | Gap/overlap local times | 02:30 on US spring-forward → 03:30 EDT; 01:30 on fall-back → first occurrence |
| 10 | Config features | overnight session, holiday skipping |
| 11 | Independence | Tehran 15:30 at 12:00Z in July; countdown formatting |
| 12 | Input validation | bad zone / bad HH:MM rejected |

## B. Application / UI – `xvfb-run -a npx electron --no-sandbox test/e2e.js` → 90/90 pass (2 skipped: Windows-only APIs)
Includes: bundled fonts really loaded, ring geometry & names (textPath) vs design, live hand angle vs Intl Tehran time, London×NY overlap at 16:29/16:31/20:29/20:31 Tehran and on a Saturday (page clock faked), light/dark colours, theme persistence, pin/lock, resize handle, compact buttons hit-test + DOM order.

| Result | Check |
|---|---|
| PASS | A1 no http(s) URL anywhere in the CSS/HTML (no CDN, no Google Fonts) |
| PASS | A2 all 8 font files are bundled and exist |
| PASS | A3 Space Grotesk, JetBrains Mono and Vazirmatn are really loaded in the page |
| PASS | B1 full window is transparent frameless 390 x 1020 |
| PASS | B2 card natural height == window height (nothing cut, nothing empty) |
| PASS | B3 content fits: last element (opacity) ends inside the card |
| PASS | B4 no session row overflows horizontally |
| PASS | B5 card has rounded corners 22px + 1px border |
| PASS | B6 page and window background fully transparent (rounded corners show the desktop) |
| PASS | B7 header: TEHRAN + UTC, theme switch, 5 window buttons |
| PASS | B8 digital clock, gold seconds, Gregorian + Persian (RTL) date |
| PASS | B9 dial is 340px with 4 concentric rings, outside -> inside Sydney, Tokyo, London, New York |
| PASS | B10 session names are SVG <textPath> on the ring paths; Tokyo + London use the reversed path |
| PASS | B11 hour labels 00 03 06 ... 21 around the dial |
| PASS | B12 gold seconds / tip / overlap strip use #F2C230 |
| PASS | B13 digital seconds tick live |
| PASS | B14 hand points at the current Tehran hour (24h dial, ±1.5°) |
| PASS | B15 hand moves every second (live) |
| PASS | B16 Tehran digital time matches Intl Asia/Tehran (±2s) |
| PASS | B17 timeline: axis 00/06/12/18/24, 4 rows with bar, NOW line + NOW pill |
| PASS | B18 opacity slider at the bottom, 40..100 |
| PASS | B19 full view: viewport has no horizontal overflow at this size |
| PASS | C1 Fri 18:00 Tehran: London x NY overlap active (strip, tags, band on rings and timeline) |
| PASS | C2 timeline overlap column = 16:30-20:30 (left 68.75%, width 16.67%) |
| PASS | C3 closed sessions (Sydney, Tokyo) drawn at 55% opacity, open ones solid |
| PASS | C4 strip text shows the countdown to 20:30 and the 16:30–20:30 range |
| PASS | C5 NOW pill follows the faked time |
| PASS | C1b overlap state: no row overflows (OVERLAP tag + countdown fit in 390px) |
| PASS | C6 16:29 Tehran: no overlap yet (New York still closed) |
| PASS | C7 16:31 Tehran: overlap begins |
| PASS | C8 20:29 Tehran: still overlapping |
| PASS | C9 20:31 Tehran: London closed, New York alone OPEN, strip switches to the next overlap |
| PASS | C10 Saturday: all four sessions CLOSED, faint ghost arcs keep the names visible |
| PASS | C11 00:05 Tehran Friday: New York (16:30-01:30) draws ONE arc across midnight |
| PASS | D1 dark theme colours from the design (bg #0D1218, syd #5E86C2, tok #9477D1, lon #34C48F, ny #F29443) |
| PASS | D2 dark ring-name colours (Sydney/Tokyo light, London #06231A, NY #2A1500) |
| PASS | D3 light theme applied (bg #F3F0E9, syd #3A62A0, hand #18212B, names white on London/NY) |
| PASS | D4 theme buttons reflect the state (aria-pressed) |
| PASS | D5 theme stored in settings |
| PASS | D6 theme survives re-creating the window (read before first paint) |
| PASS | D7 theme written to settings.json (persists after quit / restart) |
| PASS | E1 Always on top default ON |
| PASS | E2 pin button -> Always on top OFF |
| PASS | E3 pin button -> Always on top ON (gold) |
| SKIP | E4 lock: window not movable (OS level) |
| PASS | E5 lock: UI drag region disabled, resize handle hidden |
| PASS | E6 lock: resize requests are ignored |
| PASS | E7 unlock: draggable again |
| PASS | E8 tray icon exists |
| PASS | E9 minimize button hides to tray |
| PASS | E10 restore from tray; clock keeps ticking |
| PASS | E11 close button hides to tray (closeToTray) |
| PASS | E12 opacity slider -> 0.6 |
| SKIP | E13 opacity applied to the window (OS level) |
| PASS | E14 opacity floor is 40% |
| PASS | F1 dragging the bottom handle 100px down grows the widget (~+9.8%, aspect locked) |
| PASS | F2 shrink to 300px: content scales (zoom = width/390) and still fits |
| PASS | F3 dial scales with the window |
| PASS | F4 maximum width 780 |
| PASS | F5 minimum width 190 |
| PASS | F6 size persisted to settings.json |
| PASS | G1 settings panel covers the card, all its controls are no-drag (clickable) |
| PASS | G2 controls are really hit-testable (not covered) |
| PASS | G3 session hours editable and applied |
| PASS | G4 invalid input rejected with a message |
| PASS | G5 theme selectable in settings too |
| PASS | G6 off-screen saved position is moved onto a connected display |
| PASS | H1 maximize button switches full -> compact (window re-created, round transparent) |
| PASS | H2 compact window is square |
| PASS | H3 no dashboard in compact: card hidden, only the dial |
| PASS | H4 compact page is transparent (no square background) |
| PASS | H5 compact dial: viewBox 380, rings 112/96/80/64, names on the rings |
| PASS | H6 seven ring buttons + size button, always visible |
| PASS | H7 bottom arc order right->left: minimize, lock, pin, maximize, settings, sun, moon |
| PASS | H8 size button (gold dot) is bottom-right |
| PASS | H9 buttons sit inside the disc and do not overlap |
| PASS | H10 every button is on top at its centre (hit test) and is no-drag |
| PASS | H11 DOM order: drag layer first, all buttons after it (Windows applies regions in order) |
| PASS | H12 compact dial ticks live (hand moves) |
| PASS | H13 compact: sun button -> light theme (design E colours disc #FBF9F4) |
| PASS | H14 compact: moon button -> dark theme (disc #131A22) |
| PASS | H15 compact pin button toggles Always on top |
| PASS | H16 gold-dot size button cycles 240 -> 300 -> 380 -> 460 -> 240 (square each time) |
| PASS | H17 compact content scales with the window (zoom = width/380) |
| PASS | H18 smallest size 240 still hit-testable |
| PASS | H19 compact lock: size button / drag disabled |
| PASS | H20 compact size persisted separately from full size |
| PASS | H21 compact gear -> full view with settings panel open |
| PASS | H22 back in full view with the remembered full size |
| PASS | H23 compact maximize button -> full view |

Screenshots: `docs/widget-dark.png`, `widget-light.png`, `widget-overlap.png`, `widget-weekend.png`, `widget-small.png`, `widget-compact-*.png`, `settings.png`.

## C. What was NOT verified (honest limits)
Note: DOM-based `.click()` in tests bypasses Windows' drag-region hit testing – this hid a real bug in 1.3.0 (ring buttons unclickable). It is now guarded by a DOM-order test, but real mouse clicks still need checking on Windows.
This was built and tested on a Linux server; **no Windows machine was available**. The .exe was cross-built with electron-builder and its structure
checked (PE32 executable, app.asar contains all source/assets) but it has **never been launched on Windows**. Specifically unverified:
* Real mouse dragging / edge resizing with the Windows frameless window (implemented with `-webkit-app-region` + OS resize border; “moved” was tested via API calls only).
* Windows-only APIs `setMovable` and `setOpacity` (skipped on Linux; the setting and UI state are tested, the OS effect is not).
* Always-on-top behaviour over other applications (flag state tested, z-order on Windows not).
* Tray icon appearance/menu on the Windows shell, Start-with-Windows registry entry, behaviour with real multiple monitors and DPI scaling (only the bounds-sanitising logic is tested).
* **v2.0 specifics:** CSS `zoom` scaling of the whole page plus `-webkit-app-region` drag regions under zoom (verified for hit-testing in Chromium/Linux only), the bottom-edge resize handle with a real mouse (tested with dispatched pointer events), the fully transparent rounded full-view window (no OS shadow; no square corners), light-theme legibility on a real desktop, Vazirmatn at weight 400 only (design asks 400/500).
* **Round compact view (v1.2):** transparent frameless window on Windows (circular look, click-through of the transparent corners), the custom resize grip on the rim (a transparent window cannot be resized from its edges on Windows), `setBounds` on a non-resizable window, and right-click on the dial (Windows may show its system menu on drag regions – use the hover buttons or tray menu instead).
* NSIS installer: not produced (needs Wine on Linux); only the portable exe is delivered.
Please run the checklist in section D on your PC.

## D. 5-minute manual checklist for Windows
1. Launch exe → widget appears top-right, seconds tick, Tehran time equals Windows clock (Tehran zone).
2. Drag the card by any empty area; drag the grip bar at the bottom edge down/up – the whole card must scale smoothly. Check rounded corners (no black corners).
3. Toggle 📌 and open a maximized window – widget stays above only when ON.
4. Toggle 🔒 – dragging/resizing must stop. Move opacity slider – window fades.
5. “–” → disappears to tray; click tray icon → returns. Right-click tray → all menu items work.
6. Enable Start with Windows, sign out/in – widget starts; check Task Manager → Startup apps.
7. Close, relaunch – same size/position/settings. Drag to 2nd monitor, close, unplug it, relaunch → widget lands on primary.
8. Compact view: switch with the □ button; the widget must look round (no square background), drag it anywhere on the dial, all 8 round buttons are visible on the lower arc, click each (minimize, lock, pin, maximize, settings, sun, moon), press the gold-dot button repeatedly to cycle sizes, switch back to Full.
9. Change Windows date to 15 Mar 2026 and 1 Apr 2026 (Europe and US offsets differ in March) – overlap banner shows 12:00Z–17:00Z-based Tehran times (15:30–20:30 Tehran vs 16:30–20:30 normally) .

10. Full view: switch sun/moon, close and reopen the exe – theme must be remembered. Set the Windows date to a Saturday – all four tags CLOSED. At 16:30–20:30 Tehran time the gold overlap column/band must appear.

## 2.1.1 — updated design (NEXT EVENTS, gold only on LON×NY)
- Gold shade (dial + timeline column) appears only while London AND New York are both open; no outline, no OVERLAP tag, no weekend ghost bars.
- Tags are OPEN / CLOSED only; ring names use dark ink on open rings and light ink on closed rings (55 % opacity).
- NEXT EVENTS: next 7 open/close events (Tehran time, live countdown); first row large and framed.
- Overlaps line under the timeline; NOW line/pill use the text colour; design height 390×1105; NEXT EVENTS shows only the next 2 events (2.1.1).
- e2e: 99/99, unit: 12/12. SHA-256 of ForexClock-portable-2.1.1.exe: 8fafef61c585e146ffd6e1a35b6acb1759bf04240d442e9c0e4fb87cb78d90e0

# T1V-APP

A central dashboard app for the F1 content workflow. Replaces scattered windows, bat files, and manual steps with one unified tool.

---

## Tech Stack

- **Electron** — desktop app framework (Chromium-based, packages to .exe)
- **HTML / CSS / JS** — UI styling, familiar from overlay work
- **Node.js** — backend logic (API calls, file handling, launching apps)

---

## App Structure

### Tab 1 — Home / Command Center
- App launchers (OBS, Multiviewer, Figma)
- Bat file and shortcut tiles
- Pre-session setup button (launches and positions all apps on correct screens)
- OBS stream controls (start/stop via OBS WebSocket API)
- Session info widget (current/next session)

### Tab 2 — Media
- Session info auto-filled from Multiviewer API (caption template)
- Drop zone for video file
- Thumbnail preview
- Per-platform caption editor
- Platform selector (checkboxes)
- Upload button
- Live upload status feedback (success/fail per platform)
- Upload history log

### Tab 3 — Browser
- Embedded subtabs for different sites
- Each subtab has its own persistent login session (Chromium profiles)
- Supports multiple accounts (personal vs F1 content accounts)
- Locally hosted timing overlay can live here too

---

## Pre-Session Setup
One click launches and positions all apps across 3 monitors:
- OBS
- Multiviewer for F1
- Figma
- Browser with session tabs

Uses `child_process` to launch apps and `win32` APIs to move/resize windows.
3 monitors at 4K (150% DPI scale) — coordinate positioning needs to account for DPI scaling.

---

## Video Upload Platforms

| Platform | API | Notes |
|---|---|---|
| YouTube Shorts | YouTube Data API v3 | Free, well documented |
| TikTok | Content Posting API | Requires app approval process |
| Instagram Reels | Meta Graph API | Needs Business/Creator account |
| Facebook Reels | Meta Graph API | Same setup as Instagram |
| Bluesky | AT Protocol | Free, easy API |

### Not automated (stay on Fedica)
- Twitter/X — API costs $100/month, not worth it
- Facebook images, Instagram images, Threads images — Fedica handles these

---

## Caption Templates
- Auto-populated from Multiviewer GraphQL API (`localhost:10101`)
- Pulls session info: race name, session type, circuit, etc.
- Manually triggered — no auto-generation, user clicks when ready
- Editable before posting

---

## Multiviewer Integration
- MV stays as-is, no changes
- Dashboard queries `localhost:10101/api/graphql` for session info
- Used only for caption template population
- MV must be open and Live Timing connected for this to work
- MV launcher button in Tab 1 as quick access

---

## OBS Integration
- OBS WebSocket API for stream control
- Start / stop stream from dashboard
- Possible future: scene switching

---

## Packaging
- Built with Electron, packaged to standalone `.exe` via Electron Builder
- No terminal window, no dependencies to install
- Custom taskbar icon

---

## Future Ideas
- Session countdown / schedule view
- Bluesky automated image posting (free, easy)
- Notification when session ends
- More platforms (Snapchat, Pinterest — low priority)

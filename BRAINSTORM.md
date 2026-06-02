# T1V-APP — Brainstorm Session
_March 2026_

---

## Starting Point

The idea started from an existing automated process that generates F1 session result images and videos (shorts) right after a session ends. The question was whether it would be useful to also automate the upload process.

Current posting targets:
- **Images:** Twitter/X, Facebook, Threads, Instagram, Bluesky, Mastodon
- **Videos:** YouTube, TikTok

---

## Social Media API Research

### Twitter/X
API access is paid since Elon took over:
- Free tier: basically useless
- Basic tier: $100/month
- No revenue from the account → not worth it

### Image platforms overview
| Platform | Difficulty | Notes |
|---|---|---|
| Mastodon | Easy | Open API, free |
| Bluesky | Easy | AT Protocol, good SDK |
| Twitter/X | Medium | Paid API |
| Facebook | Medium | Graph API |
| Threads | Medium | Meta, launched late 2024 |
| Instagram | Medium | Graph API, needs Business account |

### Video platforms overview
| Platform | Difficulty | Notes |
|---|---|---|
| YouTube | Easy-Medium | Free, well documented |
| TikTok | Medium-Hard | Requires app approval |
| Instagram Reels | Medium | Meta Graph API |
| Facebook Reels | Medium | Same setup as Instagram |
| Bluesky | Easy | Video support added 2024 |

---

## Key Decisions on Social Media

**Images → stay on Fedica**
Already using Fedica for image posting. Since Twitter/X requires manual posting anyway (paid API), it makes sense to keep all images in one place via Fedica. No point rebuilding that.

**Videos → automate**
YouTube and TikTok are where the real automation win is. Extended to also include Instagram Reels, Facebook Reels and Bluesky.

**Meta Graph API — only for video**
Setting up Meta Graph API only for Reels (Instagram + Facebook). Fedica stays in charge of images on Meta platforms. No conflict or duplication.

---

## The Dashboard Idea

Instead of just a video uploader, the idea evolved into a **central dashboard / control panel** for the entire F1 workflow. One app to replace scattered windows, bat files, and manual steps.

---

## OBS & Streaming

Currently streaming timing data to Twitch and YouTube via OBS using a locally hosted browser source (React overlay fetching live F1 data).

**Could the app replace OBS?**
Technically yes, but not worth it. OBS is rock solid for encoding/streaming. The better approach is **OBS WebSocket API** — control OBS (start/stop stream, scene switching) from the dashboard without replacing it.

---

## Multiviewer for F1

Using Multiviewer's GraphQL API (`localhost:10101/api/graphql`) to fetch live timing data for:
- The stream timing overlay
- Session result image/video generation

MV requires two windows to be open: the main app + the Live Timing window. Explored bypassing this but decided against it — too much risk/work for something that's already working.

**MV stays as-is.** Dashboard will just include a launcher button for quick access.

MV API will be used for **caption template population** in the upload tab — auto-fetch session info (race name, session type, circuit) when post-session upload tab is opened.

---

## Pre-Session Setup

Currently manually opening: OBS, Multiviewer, Figma, browser with tabs.

Dashboard will have a **"Pre-Session Setup" button** that:
- Launches all apps automatically
- Positions each on the correct screen/region across 3 monitors
- Opens browser with the right tabs

Using `child_process` to launch + win32 APIs to position windows.
Note: 4K monitors at 150% DPI scale — coordinate math needs to account for DPI scaling.

Same layout every session → hardcoded, no need for profiles.

---

## Browser Inside the App

Since Electron runs Chromium, browser tabs can be embedded directly inside the app using `<webview>` or `BrowserView`. This means:
- No separate browser window needed
- Tabs live inside the dashboard
- Each tab has its own persistent login session
- Supports multiple accounts (personal vs F1 content) without interference
- Locally hosted timing overlay can also live here

Some sites block embedding via `X-Frame-Options` / CSP headers — needs checking per site. Own locally hosted pages work perfectly.

---

## App Structure

### Tab 1 — Home / Command Center
- App launchers (OBS, MV, Figma)
- Bat file and shortcut tiles (drag & drop to add)
- Pre-session setup button
- OBS stream controls
- Session info widget

### Tab 2 — Media
- Auto-filled caption template from MV API
- Video drop zone
- Thumbnail preview
- Per-platform caption editor
- Platform checkboxes
- Upload button
- Live status feedback per platform
- Upload history log

### Tab 3 — Browser
- Embedded subtabs for different sites
- Persistent login per tab
- Multiple account support
- Timing overlay panel

---

## Tech Stack Decision

- **Electron** — desktop framework, packages to .exe, no terminal window
- **HTML / CSS / JS** — familiar from overlay work, full styling control
- **Node.js** — backend logic

Considered alternatives:
- PyQt6 — powerful but Python only
- CustomTkinter — decent but limited styling
- PyWebView — Python + web but messier bridge

Electron wins because: familiar web stack, looks polished (VS Code / Discord / Slack are Electron), embedded browser is native to it, packages cleanly to .exe.

---

## Features Confirmed

- Caption templates — pre-generated from session data
- Session detection via MV API — for title/caption only, NOT for auto-generating images/videos (manual trigger)
- Upload status feedback — live per platform
- Thumbnail/video preview before posting
- Launcher for bat files and shortcuts
- Pre-session app launcher with window positioning
- OBS controls via WebSocket

---

## Future Ideas
- Session countdown / schedule view
- Bluesky image posting (free, easy — possible addition alongside Fedica)
- Notification when session ends
- More video platforms over time

# T1V App

A desktop dashboard built for the **TURN1VISUALS** F1 content workflow. It replaces a collection of scattered windows, batch files, and manual steps with one unified tool — stream, manage chat, upload media, and launch your tools all from one place.

Built with [Electron](https://www.electronjs.org/) — meaning it runs as a native Windows desktop app but is built with web technologies (HTML, CSS, JavaScript).

---

## What it does

### Home tab
- **Launcher sidebar** — icon tiles on the left side for quickly opening OBS, Multiviewer, Figma, or any other app/shortcut. Persistent across all tabs.
- **Stream setup bar** — set your stream title, YouTube description, Twitch category and tags before going live. All fields are saved automatically.
- **Go Live button** — one click that:
  1. Creates a YouTube live broadcast via the YouTube API
  2. Starts streaming in OBS via WebSocket
  3. Sets your Twitch stream title, category and tags via the Twitch API
- **End Stream button** — stops the OBS stream
- **YouTube Studio webview** — embedded YouTube Studio livestream management page, so you can monitor your YouTube stream without leaving the app
- **Twitch Stream Manager webview** — embedded Twitch dashboard for monitoring your Twitch stream
- **Multi-chat send bar** — type a message once and send it to YouTube chat, Twitch chat, or both at the same time

### Browser tab
- A full browser panel with a persistent sidebar of tabs
- Each tab has its own login session — logging into one site doesn't affect others
- Pinned tabs (set in Settings) and temporary tabs (added via the + button in the sidebar)

### Media tab
- **Video picker** — select a video file from your computer for upload
- **JSON picker** — load session metadata from a Multiviewer export to auto-fill title/description
- **Title, hashtags, description** fields — editable before posting
- **Platform selector** — choose YouTube and/or TikTok per upload
- **YouTube options** — visibility (public/unlisted/private) and category
- **TikTok options** — visibility setting
- **Upload button** — posts to all selected platforms in one click
- **Upload status** — live feedback per platform (success/fail)

### Settings tab
- Configure OBS WebSocket connection (host, port, password)
- Configure YouTube OAuth (Client ID, Secret, connect/disconnect)
- Configure Twitch OAuth (Client ID, Secret, channel, connect/disconnect)
- Manage browser pinned tabs

---

## Requirements

Before running or building the app, make sure you have:

- [Node.js](https://nodejs.org/) (v18 or higher recommended) — JavaScript runtime
- [npm](https://www.npmjs.com/) — comes with Node.js, used to install packages
- [OBS Studio](https://obsproject.com/) with the **WebSocket plugin** enabled (built into OBS 28+)

---

## Running the app (development)

1. **Clone or download** this repository to your computer
2. Open a terminal in the project folder
3. Install dependencies:
   ```
   npm install
   ```
4. Start the app:
   ```
   npm start
   ```

> **Note:** Do not run `electron .` directly from a VSCode terminal — it will fail due to a VSCode environment variable conflict. Always use `npm start`, which handles this automatically via `launch.js`.

---

## Building the app (portable .exe)

To create a standalone Windows executable that can be run without Node.js installed:

```
npm run build
```

The output will be in the `dist/` folder — a single portable `.exe` file you can run directly.

---

## First-time setup inside the app

After launching, go to **Settings** and configure:

### OBS
1. Open OBS → **Tools → WebSocket Server Settings**
2. Make sure **Enable WebSocket server** is checked
3. Copy the **Server Port** (default: `4455`) and **Server Password**
4. In the app Settings, enter these under **OBS** and click **Connect**

### YouTube
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create a project
2. Enable the **YouTube Data API v3**
3. Create **OAuth 2.0 credentials** (Desktop app type)
4. Copy the **Client ID** and **Client Secret** into Settings → YouTube
5. Click **Connect** — a browser tab will open asking you to authorize

### Twitch
1. Go to [Twitch Developer Console](https://dev.twitch.tv/console/apps)
2. Create or use an existing app — set the redirect URL to `http://localhost`
3. Copy the **Client ID** and **Client Secret** into Settings → Twitch
4. Enter your Twitch channel name (login name, lowercase)
5. Click **Connect** — a browser tab will open asking you to authorize

---

## Project structure

```
T1V-APP/
├── src/
│   ├── main.js          — Main process: window creation, IPC handlers, API calls
│   ├── preload.js       — Bridge between main process and UI (security layer)
│   └── renderer/
│       ├── index.html   — App UI structure
│       ├── style.css    — Dark theme styling (red accent, F1-inspired)
│       └── app.js       — All UI logic and tab behaviour
├── assets/
│   └── icon.png         — App icon
├── launch.js            — Dev launcher (fixes VSCode terminal compatibility)
├── package.json         — Project config and build settings
└── README.md            — This file
```

---

## Tech stack

| Technology | Purpose |
|---|---|
| [Electron](https://www.electronjs.org/) | Desktop app framework |
| HTML / CSS / JavaScript | UI — no framework, vanilla only |
| Node.js | Backend logic, API calls, file handling |
| [obs-websocket-js](https://github.com/obs-websocket-community-projects/obs-websocket-js) | OBS WebSocket client |
| [simple-icons](https://simpleicons.org/) | Brand icons for launcher tiles |
| [electron-builder](https://www.electron.build/) | Packages the app into a .exe |

---

## APIs used

| Service | What for |
|---|---|
| YouTube Data API v3 | Create live broadcasts, upload videos |
| Twitch Helix API | Set stream title, category, tags |
| OBS WebSocket | Start/stop stream, get stream status |

---

## Notes

- Config (credentials, settings, tabs) is stored in `%APPDATA%/t1v-app/config.json` — it persists across app updates and rebuilds
- The app is private / personal use — not intended for public distribution
- TikTok upload integration is built but pending platform approval

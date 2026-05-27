# Moodify
Moodify is a Chrome extension that works with Spotify Web Player.

It does three main jobs:

1. Reads facial mood from the webcam with multi-frame face analysis instead of one-frame guessing.
2. Builds a Spotify playlist from the user's real long-term listening history.
3. Adds a webcam hand-gesture controller on `open.spotify.com`.

This is not the old Python prototype anymore. The real product is the Chrome extension in `src/`, built into `dist/`.

## What It Actually Does

### 1. Mood detection

Moodify uses MediaPipe face landmarks and face blendshapes in the popup.

It does not trust a single frame. It scans across multiple frames, scores each frame, smooths the results over time, and then ranks these moods:

- `euphoric`
- `calm`
- `focused`
- `melancholic`
- `intense`

The scoring logic lives in `src/lib/emotion-engine.ts`.

### 2. Playlist generation

Moodify does not create dumb generic playlists from one keyword.

It builds a playlist from:

- your Spotify `long_term` top artists
- your Spotify `long_term` top tracks
- genres inferred from your top artists
- tracks found from artist search
- tracks found from genre + mood search
- tracks mined from public playlists related to your taste and selected mood
- selected tracks from top artist discographies

Then it ranks and filters tracks for:

- familiarity
- artist affinity
- genre affinity
- mood fit
- diversity

The playlist logic lives in `src/lib/playlist-engine.ts`.

### 3. Gesture control

On `https://open.spotify.com`, Moodify injects a floating HUD.

That HUD opens the webcam, tracks one hand, classifies simple gestures, and sends playback commands through Spotify's Web API.

Supported gestures:

- point right: next track
- point left: previous track
- point up: volume up
- point down: volume down
- open palm short hold: resume playback
- open palm long hold: replay current track

The gesture controller lives in `src/content/controller.ts`.

## Important Reality Checks

- There is no backend server. This is a browser extension only.
- Spotify playback control needs Spotify Premium.
- Playlist creation does not need Premium, but playback gestures do.
- Emotion detection is still heuristic. It is better than the original prototype, but it is not magic.
- Spotify API access changed after November 27, 2024, so Moodify does not rely on dead or restricted recommendation shortcuts.

## Project Structure

- `src/background/service-worker.ts`
  Handles Spotify auth, token refresh, playlist creation, and playback commands.
- `src/popup/`
  Popup UI for auth, mood scan, mood selection, and playlist launch.
- `src/options/`
  Settings UI for Spotify app setup and defaults.
- `src/content/controller.ts`
  Spotify page overlay for gesture control.
- `src/lib/emotion-engine.ts`
  Mood scoring logic.
- `src/lib/gesture-engine.ts`
  Hand gesture classification logic.
- `src/lib/playlist-engine.ts`
  Playlist building logic.
- `src/lib/spotify-api.ts`
  Spotify API wrapper.
- `src/manifest.json`
  Chrome extension manifest.
- `dist/`
  Built extension output that Chrome loads.

## Exact Setup

### Prerequisites

You need:

- Node.js
- npm
- Google Chrome
- a Spotify account
- a Spotify Developer app

If you want gesture playback control, you also need:

- Spotify Premium
- webcam access in Chrome

### 1. Install dependencies

Run this in the project root:

```bash
npm install
```

### 2. Build the extension

Run:

```bash
npm run build
```

This generates the unpacked extension in:

```bash
dist/
```

### 3. Load the extension in Chrome

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select the folder:

```text
/Users/arjunray/Desktop/Moodify/dist
```

Do not select the repo root. Select `dist`.

### 4. Create or configure a Spotify app

1. Go to the Spotify Developer Dashboard.
2. Create an app if you do not already have one.
3. Copy the Spotify app `Client ID`.
4. Open Moodify settings.
5. Copy the redirect URI shown in Moodify.
6. Add that exact URI to your Spotify app's redirect URI list.
7. Save the Spotify app settings on Spotify's side.

At the time of writing, the currently installed unpacked extension uses this redirect URI:

```text
https://ckafnampcjoddhdjdocdalagcpbhagjl.chromiumapp.org/spotify
```

If the extension ID changes on another machine or another install, use the URI shown inside Moodify settings instead of hardcoding this one.

### 5. Save the client ID inside Moodify

In the extension settings page:

1. Paste the Spotify client ID
2. Click `Save Settings`
3. Click `Connect Spotify`
4. Approve Spotify authorization

## Exact Run Flow

There is no `npm start`.

The actual run flow is:

1. `npm install`
2. `npm run build`
3. load `dist/` into Chrome
4. configure Spotify client ID
5. connect Spotify
6. use the popup and the Spotify web page

If you change code later, run:

```bash
npm run build
```

Then go back to `chrome://extensions` and click `Reload` on the Moodify extension card.

## Exact Usage

### A. Build a playlist from mood

1. Open the Moodify extension popup.
2. Make sure Spotify is connected.
3. If you want an automatic mood suggestion, click `Scan My Mood`.
4. Allow camera access if Chrome asks.
5. Hold your face in frame for a few seconds.
6. Wait for Moodify to rank the moods.
7. Click the mood you want to use.
8. Wait for playlist creation.
9. Click `Open Playlist on Spotify`.

What happens internally:

- Moodify reads your face.
- Moodify ranks the moods.
- Moodify pulls your long-term top Spotify taste profile.
- Moodify builds a mixed familiar/discovery playlist.
- Moodify creates a Spotify playlist in your account.

### B. Use hand gestures on Spotify Web Player

1. Open `https://open.spotify.com`
2. Start playback on a Spotify device
3. Open the Moodify popup
4. Click `Show Gesture HUD` if needed
5. In the floating HUD on Spotify, click `Enable camera`
6. Allow camera access if Chrome asks
7. Keep your hand inside the camera frame
8. Use gestures:

- point right: next
- point left: previous
- point up: volume up
- point down: volume down
- open palm short hold: resume
- open palm long hold: replay

### C. Use manual mood selection without scanning

If the camera read is wrong, ignore it.

Just open the popup and click the mood tile you actually want. The extension allows that on purpose.

## Development Commands

Type-check:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```

## Troubleshooting

### Spotify connect fails

Check these first:

1. the client ID is correct
2. the redirect URI in Spotify exactly matches the URI shown in Moodify
3. you saved the Spotify app settings after adding the URI

### Playlist creation fails

Check:

1. Spotify is connected
2. the account has enough listening history for top artists/tracks
3. Spotify did not reject the token

### Gesture control does nothing

Check:

1. Spotify Web Player is open on `open.spotify.com`
2. webcam permission is allowed
3. Spotify playback is already active on a real device
4. the account is Premium

### You changed code and nothing updated

You forgot one of these:

1. run `npm run build`
2. reload the extension in `chrome://extensions`

## Legacy Files

The old Python files like `Emotion.py` and `spotify_playlist.py` are still in the repo as leftovers from the original prototype.

They are not the main app anymore.


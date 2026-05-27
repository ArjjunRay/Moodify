import type { MoodDescriptor, UserSettings } from "./types";

export const APP_NAME = "Moodify";

export const DEFAULT_SETTINGS: UserSettings = {
  spotifyClientId: "",
  playlistVisibility: "private",
  playlistSize: 32,
  volumeStep: 8
};

export const STORAGE_KEYS = {
  auth: "moodify.auth",
  profile: "moodify.profile",
  settings: "moodify.settings"
} as const;

export const CONTENT_MESSAGE_TYPES = {
  focusGestureHud: "moodify:focus-gesture-hud",
  getGestureHudStatus: "moodify:get-gesture-hud-status"
} as const;

export const SPOTIFY_SCOPES = [
  "playlist-modify-private",
  "playlist-modify-public",
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-top-read"
];

export const SCAN_DURATION_MS = 5000;
export const GESTURE_COOLDOWN_MS = 1400;

export const MOODS: MoodDescriptor[] = [
  {
    key: "euphoric",
    label: "Euphoric",
    subtitle: "Glow mode",
    summary: "Bright, extroverted, high-reward picks that still sound like your history.",
    playlistTerms: ["feel good", "upbeat", "night out"],
    genreHints: ["dance", "pop", "house"]
  },
  {
    key: "calm",
    label: "Calm",
    subtitle: "Drift mode",
    summary: "Softer pacing, more space, and low-friction listening built from familiar corners.",
    playlistTerms: ["chill", "late night", "soft focus"],
    genreHints: ["ambient", "indie", "lofi"]
  },
  {
    key: "focused",
    label: "Focused",
    subtitle: "Tunnel mode",
    summary: "Lock-in tracks with steady motion and fewer chaotic jumps.",
    playlistTerms: ["deep focus", "study", "cinematic"],
    genreHints: ["instrumental", "electronica", "post-rock"]
  },
  {
    key: "melancholic",
    label: "Melancholic",
    subtitle: "Blue hour",
    summary: "Reflective cuts that lean emotional without becoming random or generic.",
    playlistTerms: ["heartbreak", "midnight", "sad"],
    genreHints: ["indie folk", "alt r&b", "singer-songwriter"]
  },
  {
    key: "intense",
    label: "Intense",
    subtitle: "Voltage",
    summary: "Sharper edges, bigger impact, and heavier momentum from your taste profile.",
    playlistTerms: ["adrenaline", "rage", "gym"],
    genreHints: ["trap", "metal", "punk"]
  }
];

export function getMoodDescriptor(key: MoodDescriptor["key"]): MoodDescriptor {
  const mood = MOODS.find((entry) => entry.key === key);

  if (!mood) {
    throw new Error(`Unknown mood: ${key}`);
  }

  return mood;
}

import { buildMoodPlaylist } from "../lib/playlist-engine";
import { SPOTIFY_SCOPES } from "../lib/constants";
import { SpotifyApiClient } from "../lib/spotify-api";
import {
  clearStoredAuth,
  getStoredAuth,
  getStoredProfile,
  getStoredSettings,
  saveSettings,
  saveStoredAuth,
  saveStoredProfile
} from "../lib/storage";
import type { BootstrapPayload, MessageMap, MessageType, RuntimeMessage, StoredSpotifyAuth } from "../lib/types";

const SPOTIFY_ACCOUNTS_BASE = "https://accounts.spotify.com";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

function createRandomString(length: number) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const randomValues = crypto.getRandomValues(new Uint8Array(length));

  return Array.from(randomValues, (value) => chars[value % chars.length]).join("");
}

async function createCodeChallenge(verifier: string) {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function toQueryString(query?: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  });

  return params.toString();
}

async function buildBootstrap(): Promise<BootstrapPayload> {
  const [settings, auth, profile] = await Promise.all([getStoredSettings(), getStoredAuth(), getStoredProfile()]);

  return {
    settings,
    auth: {
      redirectUri: chrome.identity.getRedirectURL("spotify"),
      hasClientId: Boolean(settings.spotifyClientId),
      isConnected: Boolean(auth?.accessToken),
      expiresAt: auth?.expiresAt,
      profile
    }
  };
}

async function refreshSpotifyToken(auth: StoredSpotifyAuth) {
  const settings = await getStoredSettings();

  if (!settings.spotifyClientId || !auth.refreshToken) {
    throw new Error("Moodify is missing a Spotify client ID or refresh token.");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: auth.refreshToken,
    client_id: settings.spotifyClientId
  });

  const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    await clearStoredAuth();
    throw new Error(`Spotify token refresh failed: ${response.status}`);
  }

  const payload = await response.json() as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
  };

  const nextAuth: StoredSpotifyAuth = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? auth.refreshToken,
    expiresAt: Date.now() + payload.expires_in * 1000,
    scope: payload.scope?.split(" ") ?? auth.scope
  };

  await saveStoredAuth(nextAuth);
  return nextAuth;
}

async function getValidAuth() {
  const auth = await getStoredAuth();

  if (!auth) {
    throw new Error("Connect Spotify before using Moodify.");
  }

  if (Date.now() >= auth.expiresAt - 60_000) {
    return refreshSpotifyToken(auth);
  }

  return auth;
}

async function spotifyRequest<T>(
  path: string,
  init?: RequestInit,
  query?: Record<string, string | number | boolean | undefined>,
  retry = true
): Promise<T> {
  const auth = await getValidAuth();
  const queryString = toQueryString(query);
  const url = `${SPOTIFY_API_BASE}${path}${queryString ? `?${queryString}` : ""}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      ...(init?.headers ?? {})
    }
  });

  if (response.status === 401 && retry) {
    await refreshSpotifyToken(auth);
    return spotifyRequest<T>(path, init, query, false);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Spotify API ${response.status}: ${message || "request failed"}`);
  }

  return response.json() as Promise<T>;
}

async function connectSpotify() {
  const settings = await getStoredSettings();

  if (!settings.spotifyClientId) {
    throw new Error("Save your Spotify client ID before trying to connect Spotify.");
  }

  const redirectUri = chrome.identity.getRedirectURL("spotify");
  const codeVerifier = createRandomString(64);
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = createRandomString(24);
  const authUrl = new URL(`${SPOTIFY_ACCOUNTS_BASE}/authorize`);

  authUrl.search = new URLSearchParams({
    client_id: settings.spotifyClientId,
    response_type: "code",
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    state,
    scope: SPOTIFY_SCOPES.join(" ")
  }).toString();

  const callbackUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true
  });

  if (!callbackUrl) {
    throw new Error("Spotify did not return a callback URL.");
  }

  const callback = new URL(callbackUrl);
  const error = callback.searchParams.get("error");

  if (error) {
    throw new Error(`Spotify authorization failed: ${error}`);
  }

  if (callback.searchParams.get("state") !== state) {
    throw new Error("Spotify auth state check failed.");
  }

  const code = callback.searchParams.get("code");

  if (!code) {
    throw new Error("Spotify authorization code missing in callback.");
  }

  const tokenResponse = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: settings.spotifyClientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    })
  });

  if (!tokenResponse.ok) {
    throw new Error(`Spotify token exchange failed: ${tokenResponse.status}`);
  }

  const tokenPayload = await tokenResponse.json() as {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    scope: string;
  };

  await saveStoredAuth({
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token,
    expiresAt: Date.now() + tokenPayload.expires_in * 1000,
    scope: tokenPayload.scope.split(" ")
  });

  const api = new SpotifyApiClient(spotifyRequest);
  const profile = await api.getProfile();
  await saveStoredProfile(profile);

  return buildBootstrap();
}

async function disconnectSpotify() {
  await clearStoredAuth();
  return buildBootstrap();
}

async function executePlaybackCommand(command: MessageMap["EXECUTE_PLAYBACK"]["request"]["command"]) {
  const bootstrap = await buildBootstrap();
  const product = bootstrap.auth.profile?.product?.toLowerCase();

  if (product !== "premium") {
    return {
      ok: false,
      reason: "Spotify playback controls need a Premium account and an active Spotify web player device."
    };
  }

  const api = new SpotifyApiClient(spotifyRequest);
  const playback = await api.getPlaybackState();

  if (!playback) {
    return {
      ok: false,
      reason: "No active Spotify device found. Start playback on open.spotify.com first."
    };
  }

  if (command === "next") {
    await api.skipNext();
    return { ok: true };
  }

  if (command === "previous") {
    await api.skipPrevious();
    return { ok: true };
  }

  if (command === "resume") {
    if (!playback.isPlaying) {
      await api.resumePlayback();
    }

    return { ok: true };
  }

  if (command === "replay") {
    await api.replayCurrentTrack();
    return { ok: true };
  }

  if (!playback.supportsVolume) {
    return {
      ok: false,
      reason: "The current Spotify device does not expose volume control."
    };
  }

  const settings = await getStoredSettings();
  const direction = command === "volume-up" ? 1 : -1;
  const nextVolume = Math.min(100, Math.max(0, playback.volumePercent + settings.volumeStep * direction));
  await api.setPlaybackVolume(nextVolume);
  return { ok: true };
}

async function buildPlaylistForMood(mood: MessageMap["BUILD_PLAYLIST"]["request"]["mood"]) {
  const settings = await getStoredSettings();
  const api = new SpotifyApiClient(spotifyRequest);
  const result = await buildMoodPlaylist(api, mood, settings.playlistSize, settings.playlistVisibility);

  return result;
}

async function handleMessage(message: RuntimeMessage) {
  switch (message.type) {
    case "BOOTSTRAP":
      return buildBootstrap();
    case "SAVE_SETTINGS":
      await saveSettings((message as RuntimeMessage<"SAVE_SETTINGS">).payload ?? {});
      return buildBootstrap();
    case "CONNECT_SPOTIFY":
      return connectSpotify();
    case "DISCONNECT_SPOTIFY":
      return disconnectSpotify();
    case "BUILD_PLAYLIST":
      return buildPlaylistForMood((message as RuntimeMessage<"BUILD_PLAYLIST">).payload.mood);
    case "EXECUTE_PLAYBACK":
      return executePlaybackCommand((message as RuntimeMessage<"EXECUTE_PLAYBACK">).payload.command);
    default:
      throw new Error(`Unhandled message type: ${String((message as RuntimeMessage<MessageType>).type)}`);
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  void handleMessage(message)
    .then((response) => sendResponse(response))
    .catch((error) => {
      sendResponse({
        __moodifyError: error instanceof Error ? error.message : "Moodify hit an unknown error."
      });
    });

  return true;
});

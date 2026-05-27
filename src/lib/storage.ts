import { DEFAULT_SETTINGS, STORAGE_KEYS } from "./constants";
import type { SpotifyProfile, StoredSpotifyAuth, UserSettings } from "./types";

function readSingle<T>(key: string): Promise<T | undefined> {
  return chrome.storage.local.get(key).then((result) => result[key] as T | undefined);
}

export async function getStoredSettings(): Promise<UserSettings> {
  const stored = await readSingle<Partial<UserSettings>>(STORAGE_KEYS.settings);

  return {
    ...DEFAULT_SETTINGS,
    ...stored
  };
}

export async function saveSettings(nextSettings: Partial<UserSettings>): Promise<UserSettings> {
  const merged = {
    ...(await getStoredSettings()),
    ...nextSettings
  };

  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: merged
  });

  return merged;
}

export async function getStoredAuth(): Promise<StoredSpotifyAuth | undefined> {
  return readSingle<StoredSpotifyAuth>(STORAGE_KEYS.auth);
}

export async function saveStoredAuth(auth: StoredSpotifyAuth): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.auth]: auth
  });
}

export async function clearStoredAuth(): Promise<void> {
  await chrome.storage.local.remove([STORAGE_KEYS.auth, STORAGE_KEYS.profile]);
}

export async function getStoredProfile(): Promise<SpotifyProfile | undefined> {
  return readSingle<SpotifyProfile>(STORAGE_KEYS.profile);
}

export async function saveStoredProfile(profile: SpotifyProfile): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.profile]: profile
  });
}

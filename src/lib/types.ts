export type MoodKey = "euphoric" | "calm" | "focused" | "melancholic" | "intense";

export type GestureLabel =
  | "point-right"
  | "point-left"
  | "point-up"
  | "point-down"
  | "open-palm"
  | "unknown";

export type PlaylistVisibility = "private" | "public";

export interface UserSettings {
  spotifyClientId: string;
  playlistVisibility: PlaylistVisibility;
  playlistSize: number;
  volumeStep: number;
}

export interface StoredSpotifyAuth {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string[];
}

export interface AuthSnapshot {
  redirectUri: string;
  hasClientId: boolean;
  isConnected: boolean;
  expiresAt?: number;
  profile?: SpotifyProfile;
}

export interface BootstrapPayload {
  auth: AuthSnapshot;
  settings: UserSettings;
}

export interface SpotifyProfile {
  id: string;
  display_name: string;
  product: string;
  external_urls?: {
    spotify?: string;
  };
}

export interface SpotifyImage {
  url: string;
  width: number | null;
  height: number | null;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  uri: string;
  genres?: string[];
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  release_date?: string;
  uri?: string;
  images?: SpotifyImage[];
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  popularity?: number;
  explicit?: boolean;
  album: SpotifyAlbum;
  artists: SpotifyArtist[];
  external_urls?: {
    spotify?: string;
  };
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  external_urls: {
    spotify: string;
  };
}

export interface MoodDescriptor {
  key: MoodKey;
  label: string;
  subtitle: string;
  summary: string;
  playlistTerms: string[];
  genreHints: string[];
}

export interface RankedMood {
  key: MoodKey;
  label: string;
  subtitle: string;
  score: number;
  confidence: number;
  reasons: string[];
}

export interface EmotionScanResult {
  recommendedMood: MoodKey;
  moods: RankedMood[];
  confidence: number;
  stability: number;
  totalFrames: number;
}

export interface PlaylistBuildResult {
  playlistId: string;
  playlistName: string;
  playlistUrl: string;
  playlistUri: string;
  mood: MoodKey;
  totalTracks: number;
  familiarTracks: number;
  discoveryTracks: number;
  topArtists: string[];
  topGenres: string[];
  note: string;
}

export interface PlaybackStateSnapshot {
  isPlaying: boolean;
  progressMs: number;
  volumePercent: number;
  deviceId?: string;
  supportsVolume: boolean;
}

export interface GestureHudStatus {
  ready: boolean;
  active: boolean;
  lastGesture: GestureLabel;
}

export interface MessageMap {
  BOOTSTRAP: {
    request: undefined;
    response: BootstrapPayload;
  };
  SAVE_SETTINGS: {
    request: Partial<UserSettings>;
    response: BootstrapPayload;
  };
  CONNECT_SPOTIFY: {
    request: undefined;
    response: BootstrapPayload;
  };
  DISCONNECT_SPOTIFY: {
    request: undefined;
    response: BootstrapPayload;
  };
  BUILD_PLAYLIST: {
    request: {
      mood: MoodKey;
    };
    response: PlaylistBuildResult;
  };
  EXECUTE_PLAYBACK: {
    request: {
      command: "next" | "previous" | "volume-up" | "volume-down" | "resume" | "replay";
    };
    response: {
      ok: boolean;
      reason?: string;
    };
  };
  GET_GESTURE_HUD_STATUS: {
    request: undefined;
    response: GestureHudStatus;
  };
  FOCUS_GESTURE_HUD: {
    request: undefined;
    response: GestureHudStatus;
  };
}

export type MessageType = keyof MessageMap;

export interface RuntimeMessage<K extends MessageType = MessageType> {
  type: K;
  payload: MessageMap[K]["request"];
}

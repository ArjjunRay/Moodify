import type {
  PlaybackStateSnapshot,
  PlaylistBuildResult,
  PlaylistVisibility,
  SpotifyArtist,
  SpotifyPlaylist,
  SpotifyProfile,
  SpotifyTrack
} from "./types";

type SearchType = "track" | "playlist";

type SpotifyRequest = <T>(
  path: string,
  init?: RequestInit,
  query?: Record<string, string | number | boolean | undefined>
) => Promise<T>;

interface PagedItems<T> {
  items: T[];
}

export interface SpotifyAlbumSummary {
  id: string;
  name: string;
  release_date?: string;
}

interface SpotifyPlaylistTrackItem {
  track: SpotifyTrack | null;
}

interface SpotifyDevice {
  id?: string;
  is_active: boolean;
  supports_volume: boolean;
  volume_percent?: number;
}

interface SpotifyPlaybackState {
  is_playing: boolean;
  progress_ms: number;
  device?: SpotifyDevice;
}

export class SpotifyApiClient {
  constructor(private readonly request: SpotifyRequest) {}

  async getProfile() {
    return this.request<SpotifyProfile>("/me");
  }

  async getTopArtists(limit = 20) {
    const result = await this.request<PagedItems<SpotifyArtist>>("/me/top/artists", undefined, {
      time_range: "long_term",
      limit
    });

    return result.items;
  }

  async getTopTracks(limit = 30) {
    const result = await this.request<PagedItems<SpotifyTrack>>("/me/top/tracks", undefined, {
      time_range: "long_term",
      limit
    });

    return result.items;
  }

  async searchTracks(query: string, limit = 12) {
    const result = await this.request<{ tracks: PagedItems<SpotifyTrack> }>("/search", undefined, {
      q: query,
      type: "track",
      limit
    });

    return result.tracks.items;
  }

  async searchPlaylists(query: string, limit = 3) {
    const result = await this.request<{ playlists: PagedItems<SpotifyPlaylist> }>("/search", undefined, {
      q: query,
      type: "playlist",
      limit
    });

    return result.playlists.items;
  }

  async getPlaylistTracks(playlistId: string, limit = 24) {
    const result = await this.request<PagedItems<SpotifyPlaylistTrackItem>>(`/playlists/${playlistId}/tracks`, undefined, {
      limit,
      fields: "items(track(id,name,uri,popularity,explicit,external_urls,album(id,name,release_date,images),artists(id,name,uri)))"
    });

    return result.items.map((item) => item.track).filter((track): track is SpotifyTrack => Boolean(track?.id));
  }

  async getArtists(ids: string[]) {
    if (ids.length === 0) {
      return [] as SpotifyArtist[];
    }

    const batches: SpotifyArtist[] = [];

    for (let index = 0; index < ids.length; index += 50) {
      const result = await this.request<{ artists: SpotifyArtist[] }>("/artists", undefined, {
        ids: ids.slice(index, index + 50).join(",")
      });

      batches.push(...result.artists);
    }

    return batches;
  }

  async getArtistAlbums(artistId: string, limit = 4) {
    const result = await this.request<PagedItems<SpotifyAlbumSummary>>(`/artists/${artistId}/albums`, undefined, {
      include_groups: "album,single",
      limit
    });

    return result.items;
  }

  async getAlbumTracks(album: SpotifyAlbumSummary, limit = 12) {
    const result = await this.request<
      PagedItems<
        Omit<SpotifyTrack, "album"> & {
          album?: never;
        }
      >
    >(`/albums/${album.id}/tracks`, undefined, {
      limit
    });

    return result.items.map((track) => ({
      ...track,
      album: {
        id: album.id,
        name: album.name,
        release_date: album.release_date
      }
    })) as SpotifyTrack[];
  }

  async createPlaylist(name: string, visibility: PlaylistVisibility, description: string) {
    return this.request<SpotifyPlaylist & { id: string }>(
      "/me/playlists",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name,
          public: visibility === "public",
          description
        })
      }
    );
  }

  async addTracksToPlaylist(playlistId: string, uris: string[]) {
    for (let index = 0; index < uris.length; index += 100) {
      await this.request(
        `/playlists/${playlistId}/items`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            uris: uris.slice(index, index + 100)
          })
        }
      );
    }
  }

  async getPlaybackState(): Promise<PlaybackStateSnapshot | undefined> {
    try {
      const state = await this.request<SpotifyPlaybackState>("/me/player");

      if (!state?.device) {
        return undefined;
      }

      return {
        isPlaying: state.is_playing,
        progressMs: state.progress_ms ?? 0,
        deviceId: state.device.id,
        volumePercent: state.device.volume_percent ?? 50,
        supportsVolume: state.device.supports_volume
      };
    } catch (error) {
      if (error instanceof Error && /404/.test(error.message)) {
        return undefined;
      }

      throw error;
    }
  }

  async skipNext() {
    await this.request("/me/player/next", { method: "POST" });
  }

  async skipPrevious() {
    await this.request("/me/player/previous", { method: "POST" });
  }

  async resumePlayback() {
    await this.request("/me/player/play", { method: "PUT" });
  }

  async replayCurrentTrack() {
    await this.request("/me/player/seek", { method: "PUT" }, { position_ms: 0 });
  }

  async setPlaybackVolume(volumePercent: number) {
    await this.request("/me/player/volume", { method: "PUT" }, { volume_percent: Math.round(volumePercent) });
  }
}

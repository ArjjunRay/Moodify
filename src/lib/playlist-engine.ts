import { getMoodDescriptor } from "./constants";
import { SpotifyApiClient } from "./spotify-api";
import type {
  MoodKey,
  PlaylistBuildResult,
  PlaylistVisibility,
  SpotifyArtist,
  SpotifyTrack
} from "./types";

interface CandidateTrack extends SpotifyTrack {
  artistGenres: string[];
  sourceWeight: number;
  sourceTags: string[];
  fromTopTrack: boolean;
}

interface RankedGenre {
  name: string;
  score: number;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function dedupeTracks(tracks: CandidateTrack[]) {
  const byId = new Map<string, CandidateTrack>();

  tracks.forEach((track) => {
    const existing = byId.get(track.id);

    if (!existing || track.sourceWeight > existing.sourceWeight) {
      byId.set(track.id, track);
      return;
    }

    existing.sourceWeight += track.sourceWeight * 0.18;
    existing.sourceTags = Array.from(new Set([...existing.sourceTags, ...track.sourceTags]));
    existing.artistGenres = Array.from(new Set([...existing.artistGenres, ...track.artistGenres]));
  });

  return [...byId.values()];
}

function scoreTopGenres(topArtists: SpotifyArtist[]) {
  const tally = new Map<string, number>();

  topArtists.forEach((artist, index) => {
    const rankWeight = (topArtists.length - index) / topArtists.length;

    (artist.genres ?? []).slice(0, 3).forEach((genre) => {
      const key = normalize(genre);
      tally.set(key, (tally.get(key) ?? 0) + rankWeight);
    });
  });

  return [...tally.entries()]
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function makeArtistRankMap(topArtists: SpotifyArtist[]) {
  const map = new Map<string, number>();

  topArtists.forEach((artist, index) => {
    map.set(artist.id, (topArtists.length - index) / topArtists.length);
  });

  return map;
}

function mapTrack(
  track: SpotifyTrack,
  artistGenreMap: Map<string, string[]>,
  sourceWeight: number,
  sourceTags: string[],
  topTrackIds: Set<string>
): CandidateTrack {
  const artistGenres = track.artists.flatMap((artist) => artistGenreMap.get(artist.id) ?? []);

  return {
    ...track,
    artistGenres,
    sourceWeight,
    sourceTags,
    fromTopTrack: topTrackIds.has(track.id)
  };
}

function getTrackYear(track: SpotifyTrack) {
  const releaseDate = track.album.release_date;
  const year = releaseDate ? Number.parseInt(releaseDate.slice(0, 4), 10) : Number.NaN;
  return Number.isFinite(year) ? year : 2016;
}

function scoreCandidate(
  track: CandidateTrack,
  mood: MoodKey,
  topGenres: RankedGenre[],
  artistRankMap: Map<string, number>
) {
  const moodProfile = getMoodDescriptor(mood);
  const normalizedTitle = normalize(`${track.name} ${track.album.name}`);
  const topGenreNames = new Set(topGenres.slice(0, 4).map((genre) => genre.name));
  const artistAffinity = Math.max(...track.artists.map((artist) => artistRankMap.get(artist.id) ?? 0), 0);
  const genreAffinity = Math.max(
    ...track.artistGenres.map((genre) => (topGenreNames.has(normalize(genre)) ? 1 : 0.25)),
    0
  );
  const moodKeywordHit = moodProfile.playlistTerms.some((term) => normalizedTitle.includes(normalize(term))) ? 1 : 0;
  const moodGenreHit = track.artistGenres.some((genre) =>
    moodProfile.genreHints.some((hint) => normalize(genre).includes(normalize(hint)))
  )
    ? 1
    : 0;
  const sourceMoodBoost = track.sourceTags.some((tag) => tag === mood) ? 1 : 0.45;
  const familiarity = track.fromTopTrack ? 1 : artistAffinity > 0.66 ? 0.74 : artistAffinity > 0.4 ? 0.48 : 0.22;
  const releaseYear = getTrackYear(track);
  const freshness = Math.max(0, Math.min(1, (releaseYear - 2012) / 14));
  const popularity = (track.popularity ?? 55) / 100;

  return (
    familiarity * 0.34 +
    artistAffinity * 0.18 +
    genreAffinity * 0.14 +
    (moodKeywordHit * 0.18 + moodGenreHit * 0.12 + sourceMoodBoost * 0.12) +
    freshness * 0.05 +
    popularity * 0.05 +
    track.sourceWeight * 0.1
  );
}

function selectDiverseTracks(
  rankedCandidates: Array<{ track: CandidateTrack; score: number }>,
  playlistSize: number
) {
  const familiarTarget = Math.ceil(playlistSize * 0.45);
  const familiar: SpotifyTrack[] = [];
  const discovery: SpotifyTrack[] = [];
  const artistCounts = new Map<string, number>();
  const albumCounts = new Map<string, number>();

  const canTake = (track: CandidateTrack) => {
    const primaryArtist = track.artists[0]?.id;
    const albumId = track.album.id;

    if (primaryArtist && (artistCounts.get(primaryArtist) ?? 0) >= 2) {
      return false;
    }

    if (albumId && (albumCounts.get(albumId) ?? 0) >= 2) {
      return false;
    }

    return true;
  };

  const markTaken = (track: CandidateTrack) => {
    const primaryArtist = track.artists[0]?.id;
    const albumId = track.album.id;

    if (primaryArtist) {
      artistCounts.set(primaryArtist, (artistCounts.get(primaryArtist) ?? 0) + 1);
    }

    if (albumId) {
      albumCounts.set(albumId, (albumCounts.get(albumId) ?? 0) + 1);
    }
  };

  rankedCandidates.forEach(({ track }) => {
    if (familiar.length + discovery.length >= playlistSize || !canTake(track)) {
      return;
    }

    if (track.fromTopTrack || familiar.length < familiarTarget) {
      familiar.push(track);
      markTaken(track);
      return;
    }

    discovery.push(track);
    markTaken(track);
  });

  const merged = [...familiar, ...discovery];
  return {
    tracks: merged.slice(0, playlistSize),
    familiarCount: familiar.length,
    discoveryCount: Math.max(0, merged.length - familiar.length)
  };
}

export async function buildMoodPlaylist(
  api: SpotifyApiClient,
  mood: MoodKey,
  playlistSize: number,
  playlistVisibility: PlaylistVisibility
): Promise<PlaylistBuildResult> {
  const [topArtists, topTracks] = await Promise.all([api.getTopArtists(18), api.getTopTracks(28)]);
  const topGenres = scoreTopGenres(topArtists);
  const artistRankMap = makeArtistRankMap(topArtists);
  const topTrackIds = new Set(topTracks.map((track) => track.id));
  const moodProfile = getMoodDescriptor(mood);

  const searchQueries = [
    ...topArtists.slice(0, 4).map((artist) => ({
      type: "track" as const,
      query: `artist:"${artist.name}"`,
      sourceWeight: 0.86
    })),
    ...topGenres.slice(0, 3).map((genre, index) => ({
      type: "track" as const,
      query: `genre:"${genre.name}" ${moodProfile.playlistTerms[index % moodProfile.playlistTerms.length]}`,
      sourceWeight: 0.74
    })),
    ...topGenres.slice(0, 2).map((genre, index) => ({
      type: "playlist" as const,
      query: `${genre.name} ${moodProfile.playlistTerms[index % moodProfile.playlistTerms.length]}`,
      sourceWeight: 0.64
    }))
  ];

  const initialArtistGenreMap = new Map<string, string[]>();
  topArtists.forEach((artist) => {
    initialArtistGenreMap.set(artist.id, artist.genres ?? []);
  });

  const candidateSeedTracks: CandidateTrack[] = topTracks.map((track) =>
    mapTrack(track, initialArtistGenreMap, 1, [mood], topTrackIds)
  );

  const trackSearches = searchQueries
    .filter((entry): entry is { type: "track"; query: string; sourceWeight: number } => entry.type === "track")
    .map(async (entry) => {
      const tracks = await api.searchTracks(entry.query, 10);
      return tracks.map((track) => mapTrack(track, initialArtistGenreMap, entry.sourceWeight, [mood], topTrackIds));
    });

  const playlistSearches = searchQueries
    .filter((entry): entry is { type: "playlist"; query: string; sourceWeight: number } => entry.type === "playlist")
    .map(async (entry) => {
      const playlists = await api.searchPlaylists(entry.query, 2);
      const playlistTracks = await Promise.all(playlists.map((playlist) => api.getPlaylistTracks(playlist.id, 20)));
      return playlistTracks
        .flat()
        .map((track) => mapTrack(track, initialArtistGenreMap, entry.sourceWeight, [mood], topTrackIds));
    });

  const discographySearches = topArtists.slice(0, 3).map(async (artist) => {
    const albums = await api.getArtistAlbums(artist.id, 2);
    const albumTracks = await Promise.all(albums.map((album) => api.getAlbumTracks(album, 8)));
    return albumTracks
      .flat()
      .map((track) => mapTrack(track, initialArtistGenreMap, 0.68, [mood], topTrackIds));
  });

  const sourcedTrackGroups = await Promise.all([...trackSearches, ...playlistSearches, ...discographySearches]);
  candidateSeedTracks.push(...sourcedTrackGroups.flat());

  const unknownArtistIds = Array.from(
    new Set(
      candidateSeedTracks
        .flatMap((track) => track.artists.map((artist) => artist.id))
        .filter((artistId) => !initialArtistGenreMap.has(artistId))
    )
  );

  const enrichedArtists = await api.getArtists(unknownArtistIds);
  const artistGenreMap = new Map(initialArtistGenreMap);

  enrichedArtists.forEach((artist) => {
    artistGenreMap.set(artist.id, artist.genres ?? []);
  });

  const rankedCandidates = dedupeTracks(
    candidateSeedTracks.map((track) => mapTrack(track, artistGenreMap, track.sourceWeight, track.sourceTags, topTrackIds))
  )
    .map((track) => ({
      track,
      score: scoreCandidate(track, mood, topGenres, artistRankMap)
    }))
    .sort((a, b) => b.score - a.score);

  const selection = selectDiverseTracks(rankedCandidates, playlistSize);
  const now = new Date();
  const stamp = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  const playlistName = `Moodify ${moodProfile.label} // ${stamp}`;
  const playlistDescription = `Built from your long-term Spotify taste: ${topGenres
    .slice(0, 3)
    .map((genre) => genre.name)
    .join(", ")}. No Spotify recommendations endpoint used.`;
  const playlist = await api.createPlaylist(playlistName, playlistVisibility, playlistDescription);

  await api.addTracksToPlaylist(
    playlist.id,
    selection.tracks.map((track) => track.uri)
  );

  return {
    playlistId: playlist.id,
    playlistName,
    playlistUrl: playlist.external_urls.spotify,
    playlistUri: playlist.uri,
    mood,
    totalTracks: selection.tracks.length,
    familiarTracks: selection.familiarCount,
    discoveryTracks: selection.discoveryCount,
    topArtists: topArtists.slice(0, 4).map((artist) => artist.name),
    topGenres: topGenres.slice(0, 4).map((genre) => genre.name),
    note: `${moodProfile.label} built from last-year affinity, then widened through artist search, genre search, and public playlist mining.`
  };
}

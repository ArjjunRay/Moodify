import spotipy
from spotipy.oauth2 import SpotifyOAuth
from config import SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI

# Initialize Spotify API
sp = spotipy.Spotify(auth_manager=SpotifyOAuth(
    client_id=SPOTIFY_CLIENT_ID,
    client_secret=SPOTIFY_CLIENT_SECRET,
    redirect_uri=SPOTIFY_REDIRECT_URI,
    scope="playlist-modify-public"
))

# Emotion to Playlist Genre Mapping
emotion_to_genre = {
    "happy": "pop",
    "sad": "acoustic",
    "angry": "rock",
    "fear": "dark classical",
    "surprise": "electronic",
    "neutral": "lo-fi"
}

def create_spotify_playlist(emotion):
    """Creates a Spotify playlist based on detected emotion."""
    try:
        user_id = sp.current_user()["id"]
        playlist_name = f"{emotion.capitalize()} Vibes Playlist"

        # Create a new playlist
        playlist = sp.user_playlist_create(user=user_id, name=playlist_name, public=True)
        playlist_id = playlist["id"]

        # Get top songs for the detected emotion genre
        results = sp.search(q=f"genre:{emotion_to_genre[emotion]}", type="track", limit=50)
        track_uris = [track["uri"] for track in results["tracks"]["items"]]

        # Add songs to the playlist
        if track_uris:
            sp.user_playlist_add_tracks(user=user_id, playlist_id=playlist_id, tracks=track_uris)
            print(f"✅ Playlist '{playlist_name}' created with {len(track_uris)} songs!")
        else:
            print("❌ No songs found for this emotion.")

        return playlist_name  # Return playlist name for confirmation

    except Exception as e:
        print(f"⚠️ Error creating playlist: {e}")
        return None
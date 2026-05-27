"""
Legacy prototype config.

Do not store real Spotify secrets in this repository.
The Chrome extension uses Spotify PKCE instead, so only a public client ID is needed.
"""

SPOTIFY_CLIENT_ID = "replace-me"
SPOTIFY_CLIENT_SECRET = "replace-me"
SPOTIFY_REDIRECT_URI = "http://localhost:8888/callback"

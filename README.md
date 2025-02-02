# Moodify
Mood based playlist creation
## Inspiration
Music and emotions go hand in hand. Whether you're feeling upbeat, relaxed, or a little down, the right playlist makes all the difference. I wanted to build something that reads emotions and instantly curates a Spotify playlist to match your mood—so you never have to search for the perfect song again.
## What it does
uses AI-powered facial recognition to detect your emotion in real-time. Based on your mood, it pulls from Spotify's massive library to create a fresh, randomized playlist every time. No more repetitive songs, just music that feels right.
## How we built it
Emotion Detection – Used OpenCV & DeepFace to analyze facial expressions in real-time.
Spotify Integration – Leveraged Spotipy to create and curate playlists dynamically.
Randomization & Variety – Solved repetitive playlists by shuffling songs and using random API offsets.
## Challenges we ran into
Getting Emotion Detection Right – The AI sometimes struggled with subtle expressions or poor lighting, requiring fine-tuning.
Avoiding Repetitive Playlists – Spotify’s API returned the same songs unless we adjusted search queries. We fixed this by increasing song limits and randomizing results.
## Accomplishments that we're proud of
Seamlessly integrating AI & music—a real-world use case for emotion recognition.
 Building a working prototype—code that actually creates Spotify playlists based on mood!
## What we learned
How to combine AI with everyday applications
Deep dive into Spotify’s API and how music recommendations work
The importance of user experience—nobody wants repetitive playlists
How to deploy & manage a real-world API
## What's next for Moodify
A Chrome Extension – Let users create playlists directly from their browser.

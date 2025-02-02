import cv2
import os
import time
import numpy as np
from deepface import DeepFace
from collections import Counter
from spotify_playlist import create_spotify_playlist  # Import the function

# Define the correct paths to the model files
MODEL_PATH = "/Users/arjunray/Desktop/DeepEMotion/models/"
PROTOTXT_PATH = os.path.join(MODEL_PATH, "deploy.prototxt")
MODEL_WEIGHTS_PATH = os.path.join(MODEL_PATH, "res10_300x300_ssd_iter_140000.caffemodel")

# Load the deep-learning face detection model with the correct paths
face_net = cv2.dnn.readNetFromCaffe(PROTOTXT_PATH, MODEL_WEIGHTS_PATH)

# Open webcam
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)  # Higher resolution for better accuracy
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

if not cap.isOpened():
    print("❌ Error: Could not open webcam")
    exit()

# Scan emotions for this many seconds before confirming
SCAN_DURATION = 5 # Adjust as needed
emotion_records = []  # Store detected emotions

start_time = time.time()
while True:
    ret, frame = cap.read()
    if not ret:
        print("❌ Error: Could not read frame")
        break

    # Convert to grayscale for face detection (improves speed)
    h, w = frame.shape[:2]
    resized_frame = cv2.resize(frame, (300, 300))  # Downscale for faster processing
    blob = cv2.dnn.blobFromImage(resized_frame, scalefactor=1.0, size=(300, 300), mean=(104.0, 177.0, 123.0))

    # Perform face detection
    face_net.setInput(blob)
    detections = face_net.forward()

    detected_faces = []
    for i in range(detections.shape[2]):
        confidence = detections[0, 0, i, 2]
        if confidence > 0.6:  # Consider only high-confidence detections
            box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
            x, y, x_max, y_max = box.astype("int")
            detected_faces.append((x, y, x_max - x, y_max - y, confidence))

    if detected_faces:
        # Sort faces by size (largest first)
        detected_faces.sort(key=lambda f: f[2] * f[3], reverse=True)
        x, y, w, h, confidence = detected_faces[0]  # Select the largest face

        # Ensure bounding box stays within frame bounds
        x, y, w, h = max(0, x), max(0, y), min(w, frame.shape[1] - x), min(h, frame.shape[0] - y)

        # Extract and resize the detected face
        face_roi = frame[y:y + h, x:x + w]
        face_roi = cv2.resize(face_roi, (224, 224))

        # Convert to RGB for DeepFace
        face_roi_rgb = cv2.cvtColor(face_roi, cv2.COLOR_BGR2RGB)

        try:
            # Detect emotions using DeepFace
            analysis = DeepFace.analyze(face_roi_rgb, actions=["emotion"], enforce_detection=False)

            if isinstance(analysis, list) and len(analysis) > 0:
                detected_emotion = analysis[0]["dominant_emotion"]
                confidence = analysis[0].get("emotion", {}).get(detected_emotion, 0)

                if confidence > 30:  # Only record high-confidence detections
                    emotion_records.append(detected_emotion)

                # Draw face bounding box with confidence level
                cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 3)
                cv2.putText(frame, f"{detected_emotion} ({confidence:.1f}%)", (x, y - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

        except Exception as e:
            print("Emotion detection error:", e)

    # Show webcam feed
    cv2.imshow("Emotion-Based Playlist Generator", frame)

    # Stop scanning after SCAN_DURATION seconds
    if time.time() - start_time > SCAN_DURATION:
        break

    # Exit on 'q' key press
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()

# Determine the most frequent emotion
if emotion_records:
    emotion_counts = Counter(emotion_records)
    total_detections = sum(emotion_counts.values())

    # Get the top two emotions
    sorted_emotions = emotion_counts.most_common(2)
    primary_emotion, primary_count = sorted_emotions[0]  # Most frequent emotion
    primary_percentage = (primary_count / total_detections) * 100

    # If a second most common emotion exists, get its percentage
    if len(sorted_emotions) > 1:
        secondary_emotion, secondary_count = sorted_emotions[1]
        secondary_percentage = (secondary_count / total_detections) * 100
    else:
        secondary_emotion, secondary_percentage = None, 0

    # Emotion Selection Logic
    if primary_emotion == "neutral" and primary_percentage > 80:
        selected_emotion = "neutral"
    elif primary_percentage > 60:  # Ensure dominant emotion is at least 60% of total
        selected_emotion = primary_emotion
    elif secondary_percentage > 30:  # Only use secondary emotion if it's significant
        selected_emotion = secondary_emotion
    else:
        selected_emotion = primary_emotion  # Default to primary emotion

    print(f"🎭 Confirmed Emotion: {selected_emotion}")

    # Create playlist based on the selected emotion
    playlist_name = create_spotify_playlist(selected_emotion)
    if playlist_name:
        print(f"🎵 Playlist '{playlist_name}' has been created!")

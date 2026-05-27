import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  type FaceLandmarkerResult,
  type HandLandmarkerResult
} from "@mediapipe/tasks-vision";

let visionResolverPromise: Promise<Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>> | undefined;

function getWasmRoot() {
  return chrome.runtime.getURL("wasm");
}

async function getVisionResolver() {
  if (!visionResolverPromise) {
    visionResolverPromise = FilesetResolver.forVisionTasks(getWasmRoot());
  }

  return visionResolverPromise;
}

export async function createFaceScanner() {
  const vision = await getVisionResolver();

  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: chrome.runtime.getURL("models/face_landmarker.task")
    },
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.55,
    minFacePresenceConfidence: 0.55,
    minTrackingConfidence: 0.55
  });
}

export async function createHandScanner() {
  const vision = await getVisionResolver();

  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: chrome.runtime.getURL("models/hand_landmarker.task")
    },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.55,
    minTrackingConfidence: 0.55
  });
}

export type FaceScanFrame = FaceLandmarkerResult;
export type HandScanFrame = HandLandmarkerResult;

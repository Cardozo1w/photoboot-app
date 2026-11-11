import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision'

// Bundled locally (public/mediapipe) rather than fetched from Google's CDN
// at runtime: this app has to keep working at a venue with no internet.
const WASM_BASE_PATH = '/mediapipe/wasm'
const MODEL_ASSET_PATH = '/mediapipe/face_landmarker.task'

let landmarkerPromise: Promise<FaceLandmarker> | null = null

function loadLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks(WASM_BASE_PATH).then((fileset) =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_ASSET_PATH },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      }),
    )
  }
  return landmarkerPromise
}

export interface FaceLandmarkerHandle {
  /** Normalized (0..1) landmarks for the first detected face, or null. */
  detect: (video: HTMLVideoElement, timestampMs: number) => NormalizedLandmark[] | null
}

// Module-level singleton: the model is ~3.7MB and slow-ish to init, so we
// only ever load it once for the app's lifetime, not once per screen visit.
export async function getFaceLandmarker(): Promise<FaceLandmarkerHandle> {
  const landmarker = await loadLandmarker()
  let lastTimestamp = -1

  return {
    detect(video, timestampMs) {
      if (video.readyState < 2) return null
      // detectForVideo requires a strictly increasing timestamp.
      const ts = timestampMs > lastTimestamp ? timestampMs : lastTimestamp + 1
      lastTimestamp = ts
      const result = landmarker.detectForVideo(video, ts)
      return result.faceLandmarks[0] ?? null
    },
  }
}

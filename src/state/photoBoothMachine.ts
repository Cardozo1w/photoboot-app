import { setup, assign } from 'xstate'

export type PrinterMode = 'pdf' | 'physical'

export interface PhotoBoothContext {
  sessionId: string | null
  shotsTaken: number
  /** How many candidate shots to capture before the guest picks favorites. */
  candidateShotsNeeded: number
  /** How many shots the guest must pick to make up the final strip. */
  finalShotsNeeded: number
  capturedShots: string[]
  cameraError: boolean
  printerMode: PrinterMode
  lastError: string | null
}

// Inactivity timeout for screens where a guest could walk away mid-session
// (section 9: "ningún estado debe quedar atorado"). Countdown/capturing/
// processing are excluded because they are short and machine-driven, not
// waiting on a guest.
const INACTIVITY_TIMEOUT_MS = 90_000
// How long the "done" delivery screen lingers before resetting to idle.
const DELIVERY_DONE_MS = 6_000

// Only one product for now: a 4-cut strip. Guests shoot 6 candidates and
// pick their favorite 4 on the Selecting screen.
const CANDIDATE_SHOTS = 6
const FINAL_SHOTS = 4

export type PhotoBoothEvent =
  | { type: 'TOUCH' }
  | { type: 'BACK' }
  | { type: 'CAPTURE_PRESSED' }
  | { type: 'COUNTDOWN_COMPLETE' }
  | { type: 'SHOT_CAPTURED'; dataUrl: string }
  | { type: 'SELECTION_CONFIRMED'; dataUrls: string[] }
  | { type: 'PROCESSING_COMPLETE' }
  | { type: 'REPEAT' }
  | { type: 'PRINT_SUCCESS' }
  | { type: 'PRINT_ERROR'; message: string }
  | { type: 'RETRY_PRINT' }
  | { type: 'FALLBACK_TO_PDF' }
  | { type: 'PDF_SAVED' }
  | { type: 'PDF_ERROR'; message: string }
  | { type: 'DELIVERY_DONE' }
  | { type: 'ADMIN_REQUESTED' }
  | { type: 'ADMIN_EXIT' }
  | { type: 'RESET_TO_IDLE' }
  | { type: 'CAMERA_ERROR' }
  | { type: 'CAMERA_RECOVERED' }
  | { type: 'SET_PRINTER_MODE'; mode: PrinterMode }

export const photoBoothMachine = setup({
  types: {
    context: {} as PhotoBoothContext,
    events: {} as PhotoBoothEvent,
  },
  actions: {
    resetSession: assign({
      sessionId: null,
      shotsTaken: 0,
      candidateShotsNeeded: 0,
      finalShotsNeeded: 0,
      capturedShots: [],
      lastError: null,
    }),
    startSession: assign({
      sessionId: () => crypto.randomUUID(),
      candidateShotsNeeded: CANDIDATE_SHOTS,
      finalShotsNeeded: FINAL_SHOTS,
      shotsTaken: 0,
      capturedShots: [],
    }),
    addShot: assign({
      capturedShots: ({ context, event }) =>
        event.type === 'SHOT_CAPTURED' ? [...context.capturedShots, event.dataUrl] : context.capturedShots,
      shotsTaken: ({ context }) => context.shotsTaken + 1,
    }),
    setSelectedShots: assign({
      capturedShots: ({ context, event }) =>
        event.type === 'SELECTION_CONFIRMED' ? event.dataUrls : context.capturedShots,
    }),
    setCameraError: assign({ cameraError: true }),
    clearCameraError: assign({ cameraError: false }),
    setPrintError: assign({
      lastError: ({ event }) => (event.type === 'PRINT_ERROR' ? event.message : null),
    }),
    setPdfError: assign({
      lastError: ({ event }) => (event.type === 'PDF_ERROR' ? event.message : null),
    }),
    setPrinterMode: assign({
      printerMode: ({ event }) => (event.type === 'SET_PRINTER_MODE' ? event.mode : 'pdf'),
    }),
  },
  guards: {
    hasMoreShots: ({ context }) => context.shotsTaken + 1 < context.candidateShotsNeeded,
    isPhysicalPrinter: ({ context }) => context.printerMode === 'physical',
  },
}).createMachine({
  id: 'photoBooth',
  initial: 'idle',
  context: {
    sessionId: null,
    shotsTaken: 0,
    candidateShotsNeeded: 0,
    finalShotsNeeded: 0,
    capturedShots: [],
    cameraError: false,
    printerMode: 'pdf',
    lastError: null,
  },
  on: {
    // Available from any screen: the 5-tap admin gesture, a global "give
    // up, go back to idle" escape hatch, and camera status — the camera
    // feed stays mounted across livePreview/countdown/capturing, so it can
    // report a disconnect from any of those states.
    ADMIN_REQUESTED: '.admin',
    RESET_TO_IDLE: { target: '.idle', actions: 'resetSession' },
    SET_PRINTER_MODE: { actions: 'setPrinterMode' },
    CAMERA_ERROR: { actions: 'setCameraError' },
    CAMERA_RECOVERED: { actions: 'clearCameraError' },
  },
  states: {
    idle: {
      entry: 'resetSession',
      on: {
        TOUCH: { target: 'livePreview', actions: 'startSession' },
      },
    },
    livePreview: {
      after: { [INACTIVITY_TIMEOUT_MS]: 'idle' },
      on: {
        CAPTURE_PRESSED: 'countdown',
        BACK: 'idle',
      },
    },
    countdown: {
      on: {
        COUNTDOWN_COMPLETE: 'capturing',
      },
    },
    capturing: {
      on: {
        SHOT_CAPTURED: [
          { target: 'countdown', guard: 'hasMoreShots', actions: 'addShot' },
          { target: 'selecting', actions: 'addShot' },
        ],
      },
    },
    selecting: {
      after: { [INACTIVITY_TIMEOUT_MS]: 'idle' },
      on: {
        SELECTION_CONFIRMED: { target: 'processing', actions: 'setSelectedShots' },
        REPEAT: { target: 'livePreview', actions: 'resetSession' },
      },
    },
    processing: {
      on: {
        PROCESSING_COMPLETE: 'delivery',
      },
    },
    delivery: {
      initial: 'deciding',
      states: {
        deciding: {
          always: [
            { target: 'printing', guard: 'isPhysicalPrinter' },
            { target: 'savingPdf' },
          ],
        },
        printing: {
          on: {
            PRINT_SUCCESS: 'done',
            PRINT_ERROR: { target: 'printError', actions: 'setPrintError' },
          },
        },
        printError: {
          on: {
            RETRY_PRINT: 'printing',
            FALLBACK_TO_PDF: 'savingPdf',
          },
        },
        savingPdf: {
          on: {
            PDF_SAVED: 'done',
            PDF_ERROR: { target: 'pdfError', actions: 'setPdfError' },
          },
        },
        pdfError: {
          on: {
            RETRY_PRINT: 'savingPdf',
          },
        },
        done: {
          after: { [DELIVERY_DONE_MS]: '#photoBooth.idle' },
          on: {
            DELIVERY_DONE: '#photoBooth.idle',
          },
        },
      },
    },
    admin: {
      on: {
        ADMIN_EXIT: 'idle',
      },
    },
  },
})

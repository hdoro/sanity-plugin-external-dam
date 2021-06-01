import firebase from 'firebase/app'
import { createMachine, assign } from 'xstate'

import {
  AudioMetadata,
  FileMetadata,
  SanityUpload,
  VendorUpload,
} from '../../types'
import getWaveformData from '../../scripts/getWaveformData'

interface Context {
  retries: number
  vendorUploadProgress: number
  file?: File
  fileMetadata?: FileMetadata
  vendorUpload?: VendorUpload
  sanityUpload?: SanityUpload
  /**
   * Comes from canvas.toDataURL()
   */
  videoScreenshot?: Blob
  audioWaveform?: any
  error?: {
    error?: Error
    title?: string
    subtitle?: string
  }
}

export type UploadEvent =
  | { type: 'SELECT_FILE'; file?: File }
  | { type: 'RETRY' }
  | { type: 'RESET_UPLOAD' }
  | { type: 'CANCEL_INPUT' }
  | { type: 'VENDOR_ERROR'; error: firebase.storage.FirebaseStorageError }
  | { type: 'VENDOR_PROGRESS'; data: number }
  | { type: 'VENDOR_DONE'; data: VendorUpload }
  | { type: 'SANITY_DONE'; data: SanityUpload }

const INITIAL_CONTEXT: Context = {
  retries: 0,
  vendorUploadProgress: 0,
}

const uploadMachine = createMachine<Context, UploadEvent>(
  {
    id: 'upload',
    initial: 'idle',
    context: INITIAL_CONTEXT,
    states: {
      idle: {},
      extractingVideoMetadata: {
        invoke: {
          id: 'ExtractVideoMetadata',
          src: async (context) => {
            return new Promise((resolve) => {
              const videoEl = document.createElement('video')
              videoEl.setAttribute('src', URL.createObjectURL(context.file))

              const canvasEl = document.createElement('canvas')
              const canvasCtx = canvasEl.getContext('2d')

              videoEl.addEventListener('loadedmetadata', () => {
                canvasEl.width = videoEl.videoWidth
                canvasEl.height = videoEl.videoHeight
              })

              videoEl.addEventListener('timeupdate', () => {
                canvasCtx?.drawImage(
                  videoEl,
                  0,
                  0,
                  videoEl.videoWidth,
                  videoEl.videoHeight,
                )
                canvasEl.toBlob((blob) => {
                  // Clean up once we have the image
                  canvasEl.remove()
                  videoEl.remove()

                  resolve({
                    screenshot: blob,
                    metadata: {
                      duration: videoEl.duration,
                      dimensions: {
                        width: videoEl.videoWidth,
                        height: videoEl.videoHeight,
                      },
                    },
                  })
                }, 'image/png')
              })

              // Go to frame at 1 second
              videoEl.fastSeek(1)
            })
          },
          onDone: {
            target: 'uploadingToVendor',
            actions: [
              assign({
                videoScreenshot: (_context, event) => event.data.screenshot,
                fileMetadata: (_context, event) => event.data.metadata,
              }),
            ],
          },
          onError: {
            // If we can't generate a screenshot, that's okay - proceed to uploadingToVendor
            target: 'uploadingToVendor',
          },
        },
      },
      extractingAudioMetadata: {
        invoke: {
          id: 'ExtractAudioMetadata',
          src: async (context) => {
            return new Promise(async (resolve, reject) => {
              if (!context.file || !context.file.type.includes('audio')) {
                reject()
                return
              }
              const originalAudioEl = document.createElement('audio')
              originalAudioEl.setAttribute(
                'src',
                URL.createObjectURL(context.file),
              )

              let metadata: Partial<AudioMetadata> = {}
              originalAudioEl.addEventListener('loadedmetadata', () => {
                metadata = {
                  duration: originalAudioEl.duration,
                }
              })

              try {
                console.time('Getting waveform data')
                const waveformData = await getWaveformData(context.file)
                console.timeEnd('Getting waveform data')

                resolve({
                  metadata: {
                    ...metadata,
                    waveformData,
                  },
                })
              } catch (error) {
                resolve({ metadata })
              }
            })
          },
          onDone: {
            target: 'uploadingToVendor',
            actions: [
              assign({
                fileMetadata: (_context, event) => event.data.metadata,
              }),
            ],
          },
          onError: {
            // If we can't generate a waveform, that's okay - proceed to uploadingToVendor
            target: 'uploadingToVendor',
          },
        },
      },
      uploadingToVendor: {
        invoke: {
          id: 'FirebaseUpload',
          src: 'uploadToFirebase',
        },
        on: {
          VENDOR_PROGRESS: {
            actions: [
              assign({
                vendorUploadProgress: (_context, event) => event.data,
              }),
            ],
          },
          VENDOR_DONE: [
            {
              target: 'uploadingToSanity',
              actions: [
                assign({
                  vendorUpload: (_context, event) => event.data,
                }),
              ],
            },
          ],
          VENDOR_ERROR: {
            target: 'failure',
            actions: assign({
              error: (context, event) => ({
                error: event.error,
                title: 'Failed to upload',
                subtitle:
                  context.retries > 1
                    ? "Make sure the right credentials are set in the plugins' settings."
                    : event.error.message,
              }),
            }),
          },
        },
      },
      uploadingToSanity: {
        invoke: {
          id: 'SanityUpload',
          src: 'uploadToSanity',
          onDone: {
            target: 'success',
            actions: [
              assign({
                sanityUpload: (_context, event) => event.data,
              }),
            ],
          },
          onError: {
            target: 'failure',
            actions: assign({
              error: (context, event) => ({
                error: event.data,
                title: 'Failed to save to library',
                subtitle:
                  context.retries > 0
                    ? "Try again in a few minutes, and if this still doesn't work reach a developer for help."
                    : 'This is probably due to a network error, please try again.',
              }),
            }),
          },
        },
      },
      success: {
        on: {
          RESET_UPLOAD: {
            target: 'idle',
            actions: assign((_ctx) => ({
              ...INITIAL_CONTEXT,
            })),
          },
        },
      },
      failure: {
        on: {
          RETRY: [
            {
              target: 'uploadingToSanity',
              actions: assign({
                retries: (context, event) => context.retries + 1,
              }),
              cond: 'hasUploadedToVendor',
            },
            {
              target: 'uploadingToVendor',
              actions: assign({
                retries: (context, event) => context.retries + 1,
              }),
            },
          ],
        },
      },
    },
    on: {
      CANCEL_INPUT: {
        target: 'idle',
      },
      SELECT_FILE: [
        {
          target: 'extractingVideoMetadata',
          cond: (_context, event, { state }) =>
            (['idle', 'failure'].some(state.matches) &&
              event.file?.type?.includes('video')) ||
            false,
          actions: [
            assign({
              file: (_context, event) => event.file,
            }),
          ],
        },
        {
          target: 'extractingAudioMetadata',
          cond: (_context, event, { state }) =>
            (['idle', 'failure'].some(state.matches) &&
              event.file?.type?.includes('audio')) ||
            false,
          actions: [
            assign({
              file: (_context, event) => event.file,
            }),
          ],
        },
        {
          // Else, show a toast
          actions: 'invalidFileToast',
        },
      ],
    },
  },
  {
    guards: {
      canRetry: (context) => context.retries <= 3,
      hasUploadedToVendor: (context) => !!context.vendorUpload,
    },
  },
)

export default uploadMachine

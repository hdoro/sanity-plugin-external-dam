import { createMachine, assign } from 'xstate'

import {
  AudioMetadata,
  FileMetadata,
  SanityUpload,
  VendorUpload,
} from '../../types'
import getWaveformData from '../../scripts/getWaveformData'
import parseAccept from '../../scripts/parseAccept'

interface Context {
  retries: number
  vendorUploadProgress: number
  file?: File
  formatMetadata?: FileMetadata
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
  | { type: 'VENDOR_ERROR'; error?: Error }
  | { type: 'VENDOR_PROGRESS'; data: number }
  | { type: 'VENDOR_DONE'; data: VendorUpload }
  | { type: 'SANITY_DONE'; data: SanityUpload }

const INITIAL_CONTEXT: Context = {
  retries: 0,
  vendorUploadProgress: 0,
}

function getBasicFileMetadata(file: File) {
  return {
    fileSize: file.size,
    contentType: parseAccept(file.type),
  }
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
            return new Promise((resolve, reject) => {
              if (!context.file) {
                reject('Missing file')
                return
              }
              const videoEl = document.createElement('video')
              videoEl.setAttribute('src', URL.createObjectURL(context.file))

              const canvasEl = document.createElement('canvas')
              const canvasCtx = canvasEl.getContext('2d')

              videoEl.addEventListener('loadedmetadata', () => {
                canvasEl.width = videoEl.videoWidth
                canvasEl.height = videoEl.videoHeight
                // Go to frame at 1 second
                videoEl.currentTime = 1
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
                      ...getBasicFileMetadata(context.file as File),
                    },
                  })
                }, 'image/png')
              })
            })
          },
          onDone: {
            target: 'uploadingToVendor',
            actions: [
              assign({
                videoScreenshot: (_context, event) => event.data.screenshot,
                formatMetadata: (_context, event) => event.data.metadata,
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
                    ...getBasicFileMetadata(context.file),
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
                formatMetadata: (_context, event) => event.data.metadata,
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
          id: 'VendorUpload',
          src: 'uploadToVendor',
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
                    : event.error?.message || 'Error',
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
          target: 'uploadingToVendor',
          cond: (_context, event, { state }) =>
            (['idle', 'failure'].some(state.matches) &&
              event.file?.type != null) ||
            false,
          actions: [
            assign({
              file: (_context, event) => {
                return event.file
              },
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

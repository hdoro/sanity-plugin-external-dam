import { SanityDocument } from '@sanity/client'
import { BaseSchemaType } from '@sanity/types'

type StrictSanityDocument = Pick<
  SanityDocument,
  '_id' | '_rev' | '_type' | '_createdAt' | '_updatedAt'
>

export interface VendorCredentials extends Partial<SanityDocument> {
  [credentialKey: string]: any
}

/**
 * Use this return to cancel your upload, clean observables, etc.
 */
type CleanUpUpload = () => void

export interface AcceptedCredentialField extends Omit<BaseSchemaType, 'type'> {
  type: 'string' | 'number' | 'url'
}

/**
 * Necessary to initialize the input & tool on different vendors
 */
export interface VendorConfiguration {
  id: string
  customDataFieldName?: string
  defaultAccept: string | string[]
  toolTitle?: string
  supportsProgress?: boolean
  /**
   * This plugin currently treats all fields as required
   */
  credentialsFields: AcceptedCredentialField[]
  /**
   * Should return true if file successfully deleted or string with error code / name if failed to delete.
   */
  deleteFile: (props: {
    storedFile: SanityUpload
    credentials: VendorCredentials
  }) => Promise<true | string>
  /**
   * Function to upload file to
   */
  uploadFile: (props: {
    file: File
    /**
     * File name you should use for storage.
     * Use this instead of file.name as it respects users' storeOriginalFilename options.
     */
    fileName: string
    /**
     * Whether or not to include the file URL in the Sanity document. This is useful if file URLs needs to be validated before fetched. This defaults to true.
     */
    includeFileURL: boolean
    /**
     * Credentials as configured by your plugin.
     */
    credentials: VendorCredentials
    /**
     * Inform users about the progress of the upload
     */
    updateProgress: (progress: number) => void
    /**
     * Call this function if upload fails to update the UI
     */
    onError: (error?: Error) => void
    /**
     * Should return a VendorUpload object with data we can populate the SanityUpload document with
     */
    onSuccess: (uploadedFile: VendorUpload) => void
  }) => CleanUpUpload | undefined
}

export interface VendorUpload {
  fileURL?: string
  [vendorId: string]: any
}

export interface SanityUpload
  extends StrictSanityDocument,
    Partial<AudioMetadata>,
    Partial<VideoMetadata>,
    VendorUpload {
  _type: string
  fileName?: string
  contentType?: string
  fileSize?: number
  /**
   * Exclusive to videos
   */
  screenshot?: {
    _type: 'image'
    asset: {
      _type: 'reference'
      _ref: string
    }
  }
  title?: string
  description?: string
}

export interface AssetReference {
  asset: {
    _type: 'reference'
    _ref: string
  }
}

export type MediaFile = SanityUpload | AssetReference

export interface AudioMetadata {
  /**
   * Duration in seconds
   */
  duration: number
  waveformData?: number[]
}

interface VideoMetadata {
  /**
   * Duration in seconds
   */
  duration: number
  /**
   * Dimensions in pixels
   */
  dimensions: {
    width: number
    height: number
  }
}

export type FileMetadata = AudioMetadata | VideoMetadata

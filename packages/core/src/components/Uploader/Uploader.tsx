import React from 'react'
import { Button, Container, Stack } from '@sanity/ui'
import { SanityClient } from '@sanity/client'
import { SearchIcon, UploadIcon, TrashIcon } from '@sanity/icons'

import useUpload from './useUpload'
import { MediaFile, SanityUpload, VendorConfiguration } from '../../types'
import UploadBox from './UploadBox'
import MediaPreview from '../MediaPreview'

export interface UploaderProps {
  vendorConfig: VendorConfiguration
  sanityClient: SanityClient
  onSuccess: (document: SanityUpload) => void

  // CONFIGURATION
  /**
   * MIME file type
   */
  accept?: 'audio/*' | 'video/*' | string | string[]
  /**
   * Whether or not we should use the file's name when uploading
   */
  storeOriginalFilename?: boolean
  /**
   * Whether or not to include the file URL in the Sanity document. This is useful if file URLs needs to be validated before fetched. This defaults to true.
   */
  includeFileURL?: boolean

  // FIELD INPUT CONTEXT
  /**
   * Opens the media browser / library
   */
  openBrowser?: () => void
  /**
   * File already uploaded in this instance
   */
  chosenFile?: MediaFile
  /**
   * Used to clear the field via the remove button
   */
  removeFile?: () => void
}

const Uploader: React.FC<UploaderProps> = (props) => {
  const uploadProps = useUpload(props)
  const {
    dropzone: { inputRef },
  } = uploadProps

  const onUploadClick = React.useCallback(() => {
    if (inputRef?.current) {
      inputRef.current.click()
    }
  }, [inputRef])

  return (
    <Container width={2}>
      <Stack space={3}>
        {props.chosenFile ? (
          <MediaPreview file={props.chosenFile} context="input" />
        ) : (
          <UploadBox {...uploadProps} vendorConfig={props.vendorConfig} onUploadClick={onUploadClick} />
        )}
        <div
          style={{
            display: 'flex',
            width: '100%',
            alignItems: 'flex-end',
            justifyContent: 'flex-start',
            gap: '.5rem',
          }}
        >
          <Button
            icon={UploadIcon}
            fontSize={2}
            padding={3}
            mode="ghost"
            text="Upload"
            style={{ flex: 1 }}
            onClick={onUploadClick}
          />
          {props.openBrowser && (
            <Button
              icon={SearchIcon}
              fontSize={2}
              padding={3}
              mode="ghost"
              text="Select"
              style={{ flex: 1 }}
              onClick={props.openBrowser}
            />
          )}
          {props.removeFile && props.chosenFile && (
            <Button
              icon={TrashIcon}
              fontSize={2}
              padding={3}
              mode="ghost"
              tone="critical"
              text="Remove"
              style={{ flex: 1 }}
              onClick={props.removeFile}
            />
          )}
        </div>
      </Stack>
    </Container>
  )
}

export default Uploader

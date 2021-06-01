import React from 'react'
import { Text, Stack, Inline } from '@sanity/ui'
import { DownloadIcon, CalendarIcon, ClockIcon } from '@sanity/icons'

import { SanityUpload } from '../types'
import formatSeconds from '../scripts/formatSeconds'
import formatBytes from '../scripts/formatBytes'
import IconInfo from './IconInfo'

interface FileMetadataProps {
  file: SanityUpload
}

const FileMetadata: React.FC<FileMetadataProps> = ({ file }) => {
  if (!file) {
    return null
  }
  return (
    <Stack space={2}>
      <Stack space={2}>
        <Text
          size={1}
          weight="bold"
          muted
          style={{
            wordWrap: 'break-word',
          }}
        >
          {file.title || file.externalFile?.name}
        </Text>
        {file.description && (
          <p
            style={
              {
                fontFamily: 'inherit',
                margin: 0,
                fontSize: '0.8125rem',
                lineHeight: '1.0625rem',
                color: 'var(--card-muted-fg-color)',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
                overflow: 'hidden',
              } as React.CSSProperties
            }
          >
            {file.description}
          </p>
        )}
      </Stack>
      <Inline space={3}>
        {file.metadata?.duration && (
          <IconInfo
            text={formatSeconds(file.metadata.duration)}
            icon={ClockIcon}
          />
        )}
        {file.externalFile?.size && (
          <IconInfo
            text={formatBytes(file.externalFile.size)}
            icon={DownloadIcon}
          />
        )}
        <IconInfo
          text={new Date(file._createdAt).toISOString().split('T')[0]}
          icon={CalendarIcon}
        />
      </Inline>
    </Stack>
  )
}

export default FileMetadata

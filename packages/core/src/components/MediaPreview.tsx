import { blue } from '@sanity/color'
import { PlayIcon } from '@sanity/icons'
import { Box, Card, Spinner } from '@sanity/ui'
import React from 'react'
import sanityClient, { imageBuilder } from '../scripts/sanityClient'
import { MediaFile, SanityUpload } from '../types'
import AudioIcon from './AudioIcon'
import FileMetadata from './FileMetadata'
import VideoIcon from './VideoIcon'
import WaveformDisplay from './WaveformDisplay'
import { ImageIcon, DocumentIcon } from '@sanity/icons'

export interface MediaPreview {
  file: MediaFile
  context: 'browser' | 'input' | 'detailsDialog'
}

const Player: React.FC<SanityUpload> = (props) => {
  if (!props.fileURL) {
    return null
  }
  if (props.contentType?.includes('audio')) {
    return (
      <audio
        src={props.fileURL}
        controls={true}
        autoPlay={true}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
    )
  }
  return (
    <video
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'contain',
      }}
      src={props.fileURL}
      controls={true}
      autoPlay={true}
    />
  )
}

const WrappingCard: React.FC<
  Pick<MediaPreview, 'context'> & {
    paddingBottom?: string
  }
> = ({
  children,
  context,
  // 16:9 aspect ratio
  paddingBottom = '56.25%',
}) => {
    return (
      <Card
        padding={context === 'input' ? 4 : 0}
        border={context === 'input'}
        display="flex"
        style={{
          textAlign: 'center',
          width: '100%',
          position: 'relative',
          paddingBottom,
        }}
        sizing="border"
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%,-50%)',
            width: '100%',
            height: '100%',
          }}
        >
          {children}
        </div>
      </Card>
    )
  }

const MediaPreview: React.FC<MediaPreview> = (props) => {
  const [playing, setPlaying] = React.useState(false)
  const [fullFile, setFullFile] = React.useState<SanityUpload>()

  const expandReference = React.useCallback(async (_ref) => {
    const doc = await sanityClient.fetch<SanityUpload>(`*[_id == $id][0]`, {
      id: _ref,
    })
    setFullFile(doc)
  }, [])

  React.useEffect(() => {
    if ((props.file as SanityUpload)?.fileURL) {
      setFullFile(props.file as SanityUpload)
    } else if (props.file && 'asset' in props.file && props.file?.asset?._ref) {
      expandReference(props.file.asset._ref)
    }
  }, [props.file])

  if (!props.file || (fullFile && !fullFile.fileURL)) {
    return null
  }

  if (!fullFile) {
    return (
      <WrappingCard context={props.context}>
        <Box
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%,-50%)',
          }}
        >
          <Spinner />
        </Box>
      </WrappingCard>
    )
  }

  let mediaType: 'audio' | 'video' | 'image' | 'other';
  let imgUrl: string | undefined;
  let allowPlayback = props.context !== 'browser';
  let icon;
  switch (true) {
    case fullFile.contentType?.includes('audio/'):
      mediaType = 'audio';
      allowPlayback &&= true;
      icon = <>
        <AudioIcon
          style={{
            width: '50%',
            maxHeight: '70%',
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%,-50%)',
            zIndex: 0,
            color:
              fullFile && 'waveformData' in fullFile
                ? blue[100].hex
                : blue[800].hex,
          }}
        />
        {fullFile.waveformData && (
          <WaveformDisplay
            waveformData={fullFile.waveformData}
            style={{
              zIndex: 1,
              position: 'relative',
              height: '100%',
            }}
            colorHue="blue"
          />
        )}
      </>
      break;

    case fullFile.contentType?.includes('video/'):
      mediaType = 'video';
      imgUrl = fullFile.screenshot &&
        imageBuilder
          .image(fullFile.screenshot)
          .width(props.context === 'browser' ? 300 : 600)
          .url();
      allowPlayback &&= true;
      icon = <VideoIcon style={{ width: '50%', maxHeight: '70%' }} />;
      break;

    case fullFile.contentType?.includes('image/'):
      mediaType = 'image';
      allowPlayback &&= false;
      icon = <ImageIcon />;
      break;

    default:
      mediaType = 'other';
      allowPlayback &&= false;
      icon = <DocumentIcon />
      break;
  }

  return (
    <WrappingCard
      context={props.context}
      paddingBottom={
        fullFile.dimensions
          ? `${(fullFile.dimensions.height / fullFile.dimensions.width) * 100}%`
          : undefined
      }
    >
      {playing ? (
        <Player {...fullFile} />
      ) : (
        <>
          {imgUrl ? (
            <img
              style={{
                width: '100%',
                borderRadius: '.3rem',
                height: '100%',
                objectFit: 'contain',
                color: 'transparent',
              }}
              src={imgUrl}
              alt={`Video's thumbnail`}
            />
          ) : (
            <Card
              padding={0}
              sizing="border"
              style={{
                position: 'relative',
                height: '100%',
              }}
              tone="primary"
            >
              <Box
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%,-50%)',
                  color: blue[800].hex,
                  height: mediaType === 'audio' && '60%',
                  width: mediaType === 'audio' && '90%',
                }}
              >
                {icon}
              </Box>
            </Card>
          )}
          {allowPlayback && (
            <button
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%,-50%)',
                fontSize: '3rem',
                width: '1.5em',
                height: '1.5em',
                display: 'flex',
                borderRadius: '50%',
                justifyContent: 'center',
                alignItems: 'center',
                background: 'white',
                border: '1px solid #ced2d9',
                boxShadow: '1px 1px 6px rgba(134,144,160,0.2)',
                cursor: 'pointer',
              }}
              onClick={() => setPlaying(true)}
              aria-label={`Play ${mediaType}`}
            >
              <PlayIcon />
            </button>
          )}
          {props.context === 'input' && (
            <Card
              padding={4}
              style={{
                position: 'absolute',
                left: 0,
                bottom: 0,
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              <FileMetadata file={fullFile} />
            </Card>
          )}
        </>
      )}
    </WrappingCard>
  )
}

export default MediaPreview

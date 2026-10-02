'use client'

// React Imports
import { useCallback, useEffect, useRef, useState } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import LinearProgress from '@mui/material/LinearProgress'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import CopyButton from '@/components/CopyButton'

/**
 * Bucket File card — upload an arbitrary file to the S3 bucket and get its
 * link back, or remove a file from the bucket by pasting its full URL.
 *
 * Both halves go through /api/storage/bucket-file, which proxies to the BE's
 * sysadmin-gated /system-admin/bucket-file. Nothing here talks to S3 directly:
 * the Monitor holds no AWS credentials, by design.
 *
 * This is the RAW bucket, not the tenant file path — an upload here creates no
 * `File` document and a delete here refunds no credits. It exists for operator
 * assets (a release binary, a screenshot for a ticket, a one-off CSV).
 *
 * Upload uses XMLHttpRequest rather than fetch purely for the progress
 * readout; fetch still has no upload-progress signal, and a 100 MB drop with
 * no feedback reads as a hung page.
 */

type Feedback = { severity: 'success' | 'error' | 'warning' | 'info'; message: string } | null

type Uploaded = {
  url: string
  key: string
  bucket?: string
  size?: number
  contentType?: string
  originalName?: string
}

// Matches the BE's multer cap — checked here too so an oversized pick is
// rejected before it spends minutes on the wire.
const MAX_UPLOAD_BYTES = 1000 * 1024 * 1024

const formatBytes = (bytes?: number) => {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const BucketFileCard = () => {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  // Upload half
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploaded, setUploaded] = useState<Uploaded | null>(null)
  const [uploadFeedback, setUploadFeedback] = useState<Feedback>(null)

  // Remove half
  const [removeUrl, setRemoveUrl] = useState('')
  const [removing, setRemoving] = useState(false)
  const [removeFeedback, setRemoveFeedback] = useState<Feedback>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // An in-flight upload has to be dropped if the operator navigates away —
  // otherwise the xhr keeps running and its handlers setState on a dead tree.
  useEffect(
    () => () => {
      xhrRef.current?.abort()
      xhrRef.current = null
    },
    []
  )

  const pickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null

    setUploadFeedback(null)
    setUploaded(null)
    setProgress(0)

    if (next && next.size > MAX_UPLOAD_BYTES) {
      setFile(null)
      setUploadFeedback({
        severity: 'error',
        message: `"${next.name}" is ${formatBytes(next.size)} — the limit is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`
      })
    } else {
      setFile(next)
    }

    // Reset the input so re-picking the same file still fires onChange.
    event.target.value = ''
  }

  const upload = useCallback(() => {
    if (!file || uploading) return

    setUploading(true)
    setProgress(0)
    setUploadFeedback(null)
    setUploaded(null)

    const form = new FormData()

    form.append('file', file, file.name)

    const xhr = new XMLHttpRequest()

    xhrRef.current = xhr

    xhr.open('POST', '/api/storage/bucket-file')
    xhr.responseType = 'json'

    xhr.upload.onprogress = event => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100))
    }

    xhr.onload = () => {
      xhrRef.current = null
      setUploading(false)

      // responseType 'json' gives null on a non-JSON body (an HTML error page
      // from a proxy, say) — fall back to the raw text so the operator sees
      // something other than "undefined".
      const json = xhr.response ?? null

      if (xhr.status < 200 || xhr.status >= 300 || !json?.isSuccess) {
        setUploadFeedback({
          severity: 'error',
          message: json?.displayMessage || json?.message || `Upload failed (${xhr.status})`
        })

        return
      }

      setUploaded(json.data as Uploaded)
      setFile(null)
      setUploadFeedback({ severity: 'success', message: json?.displayMessage || 'File uploaded to the bucket.' })
    }

    xhr.onerror = () => {
      xhrRef.current = null
      setUploading(false)
      setUploadFeedback({ severity: 'error', message: 'Network error while uploading.' })
    }

    xhr.onabort = () => {
      xhrRef.current = null
      setUploading(false)
      setUploadFeedback({ severity: 'info', message: 'Upload cancelled.' })
    }

    xhr.send(form)
  }, [file, uploading])

  const cancelUpload = () => xhrRef.current?.abort()

  const remove = useCallback(async () => {
    const target = removeUrl.trim()

    if (!target || removing) return

    setConfirmOpen(false)
    setRemoving(true)
    setRemoveFeedback(null)

    try {
      const res = await fetch('/api/storage/bucket-file', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
        cache: 'no-store'
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.isSuccess) {
        setRemoveFeedback({
          severity: 'error',
          message: json?.displayMessage || json?.message || `Request failed (${res.status})`
        })

        return
      }

      setRemoveFeedback({
        severity: 'success',
        message: `${json?.displayMessage || 'File removed from the bucket.'} (${json?.data?.key ?? target})`
      })
      setRemoveUrl('')

      // The link just deleted is the one the card is still showing — clear it
      // so nobody copies a URL that now 404s.
      if (uploaded?.url === target || uploaded?.key === json?.data?.key) setUploaded(null)
    } catch (err: any) {
      setRemoveFeedback({ severity: 'error', message: err?.message || 'Failed to remove the file' })
    } finally {
      setRemoving(false)
    }
  }, [removeUrl, removing, uploaded])

  return (
    <Card>
      <CardHeader
        title='Bucket File'
        subheader='Upload a file to the storage bucket and get its link, or remove one by URL.'
      />
      <CardContent className='flex flex-col gap-6'>
        {/* ---------------------------------------------------------- upload */}
        <div className='flex flex-col gap-4'>
          <Typography className='uppercase' variant='body2' color='text.disabled'>
            Upload
          </Typography>

          <input ref={inputRef} type='file' hidden onChange={pickFile} />

          <div className='flex flex-wrap items-center gap-4'>
            <Button
              variant='tonal'
              color='secondary'
              startIcon={<i className='tabler-paperclip' />}
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              Choose file
            </Button>
            <Button
              variant='contained'
              startIcon={<i className='tabler-cloud-upload' />}
              disabled={!file || uploading}
              onClick={upload}
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
            {uploading && (
              <Button variant='tonal' color='error' onClick={cancelUpload}>
                Cancel
              </Button>
            )}
            <Typography variant='body2' color='text.secondary' className='break-all'>
              {file ? `${file.name} · ${formatBytes(file.size)}` : 'No file selected'}
            </Typography>
          </div>

          {uploading && (
            <Box className='flex items-center gap-3'>
              <LinearProgress variant='determinate' value={progress} className='grow' />
              <Typography variant='body2' color='text.secondary'>{`${progress}%`}</Typography>
            </Box>
          )}

          {uploadFeedback && (
            <Alert severity={uploadFeedback.severity} onClose={() => setUploadFeedback(null)}>
              {uploadFeedback.message}
            </Alert>
          )}

          {uploaded?.url && (
            <div className='flex flex-col gap-2'>
              <CustomTextField
                fullWidth
                label='File URL'
                value={uploaded.url}
                slotProps={{
                  input: {
                    readOnly: true,
                    endAdornment: (
                      <InputAdornment position='end'>
                        <CopyButton value={uploaded.url} label='file URL' />
                        <Tooltip title='Open in a new tab'>
                          <IconButton
                            size='small'
                            className='p-1'
                            component='a'
                            href={uploaded.url}
                            target='_blank'
                            rel='noopener noreferrer'
                          >
                            <i className='tabler-external-link text-sm' />
                          </IconButton>
                        </Tooltip>
                      </InputAdornment>
                    )
                  }
                }}
              />
              <Typography variant='body2' color='text.disabled' className='break-all'>
                {`Key: ${uploaded.key}`}
                {uploaded.size !== undefined ? ` · ${formatBytes(uploaded.size)}` : ''}
                {uploaded.contentType ? ` · ${uploaded.contentType}` : ''}
              </Typography>
              <div>
                <Button size='small' variant='text' onClick={() => setRemoveUrl(uploaded.url)}>
                  Use this URL below
                </Button>
              </div>
            </div>
          )}
        </div>

        <Divider />

        {/* ---------------------------------------------------------- remove */}
        <div className='flex flex-col gap-4'>
          <Typography className='uppercase' variant='body2' color='text.disabled'>
            Remove from bucket
          </Typography>

          <CustomTextField
            fullWidth
            label='File URL'
            placeholder='https://s3.<region>.amazonaws.com/<bucket>/<key>'
            value={removeUrl}
            disabled={removing}
            onChange={event => setRemoveUrl(event.target.value)}
            helperText='Paste the full file URL (an object key also works). Deleting is permanent.'
          />

          <div>
            <Button
              variant='contained'
              color='error'
              startIcon={<i className='tabler-trash' />}
              disabled={!removeUrl.trim() || removing}
              onClick={() => setConfirmOpen(true)}
            >
              {removing ? 'Removing…' : 'Remove file'}
            </Button>
          </div>

          {removeFeedback && (
            <Alert severity={removeFeedback.severity} onClose={() => setRemoveFeedback(null)} className='break-all'>
              {removeFeedback.message}
            </Alert>
          )}
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth='xs'>
        <DialogTitle>Remove this file?</DialogTitle>
        <DialogContent>
          <DialogContentText className='break-all'>{removeUrl.trim()}</DialogContentText>
          <DialogContentText className='mbs-3'>
            The object is deleted from the bucket. This cannot be undone, and any link already shared will stop working.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button variant='tonal' color='secondary' onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button variant='contained' color='error' onClick={remove}>
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  )
}

export default BucketFileCard

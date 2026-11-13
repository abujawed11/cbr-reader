import { useEffect, useMemo, useRef, useState } from 'react'
import { uploadBook } from '../api'
import { CloseIcon, FileIcon, UploadIcon } from './icons'

const ACCEPT = '.cbr,.cbz,.zip,.rar,.pdf,image/*'
const ALLOWED = /\.(cbr|cbz|zip|rar|pdf|jpe?g|png|webp|gif|bmp|avif|tiff?)$/i
const ARCHIVE = /\.(cbr|cbz|zip|rar|pdf)$/i // "document" files (not loose page images)

const formatSize = (bytes) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

const naturalSort = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })

const fieldClass =
  'w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30'

export default function UploadModal({ initialFiles = [], onClose, onUploaded }) {
  const inputRef = useRef(null)
  const uploadRef = useRef(null)
  const [files, setFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [paid, setPaid] = useState(false)
  const [price, setPrice] = useState('4.99')
  const [freePages, setFreePages] = useState('10')
  const [progress, setProgress] = useState(null) // null = idle, 0..1 = uploading
  const [error, setError] = useState('')

  const uploading = progress !== null

  const addFiles = (incoming) => {
    const list = Array.from(incoming)
    const valid = list.filter((f) => ALLOWED.test(f.name))
    if (valid.length < list.length) setError('Some files were skipped: only .cbr, .cbz, .pdf and image files are supported.')
    else setError('')
    setFiles((prev) => [...prev, ...valid].sort(naturalSort))
  }

  // Files dropped onto the page before the modal opened
  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    if (initialFiles.length) addFiles(initialFiles)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !uploading && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, uploading])

  const summary = useMemo(() => {
    const archives = files.filter((f) => ARCHIVE.test(f.name)).length
    const images = files.length - archives
    const parts = []
    if (archives) parts.push(`${archives} archive${archives > 1 ? 's' : ''}`)
    if (images) parts.push(`${images} image${images > 1 ? 's' : ''}`)
    return parts.join(' + ')
  }, [files])

  const placeholderTitle = files[0] ? files[0].name.replace(/\.[^.]+$/, '') : 'Book title'

  const submit = async (e) => {
    e.preventDefault()
    if (!files.length || uploading) return
    setError('')
    setProgress(0)
    const upload = uploadBook(
      { files, title, author, price: paid ? price : 0, freePages: paid ? freePages : undefined },
      setProgress
    )
    uploadRef.current = upload
    try {
      await upload.promise
      onUploaded()
      onClose()
    } catch (err) {
      setProgress(null)
      if (err.name !== 'AbortError') setError(err.message)
    }
  }

  const cancel = () => {
    if (uploading) uploadRef.current?.abort()
    else onClose()
  }

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && !uploading && onClose()}>
      <form
        onSubmit={submit}
        className="animate-pop-in flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-800 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-ink-700 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Add a book</h2>
            <p className="text-sm text-slate-400">Upload a comic archive, a PDF, or a set of page images.</p>
          </div>
          <button type="button" onClick={cancel} className="rounded-lg p-2 text-slate-400 hover:bg-ink-700 hover:text-white" aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              addFiles(e.dataTransfer.files)
            }}
            onClick={() => !uploading && inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
              dragging ? 'border-accent-500 bg-accent-500/10' : 'border-ink-600 hover:border-accent-500/60 hover:bg-ink-700/40'
            }`}
          >
            <span className="rounded-full bg-accent-500/15 p-3 text-accent-400">
              <UploadIcon className="h-6 w-6" />
            </span>
            <p className="text-sm font-medium text-slate-100">Drag &amp; drop files here, or click to browse</p>
            <p className="text-xs text-slate-400">.cbr · .cbz · .zip · .rar · .pdf · JPG · PNG · WebP</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              hidden
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>

          {files.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                <span>{summary} selected</span>
                {!uploading && (
                  <button type="button" onClick={() => setFiles([])} className="hover:text-white">
                    Clear all
                  </button>
                )}
              </div>
              <ul className="max-h-40 divide-y divide-ink-700 overflow-y-auto rounded-lg border border-ink-700 bg-ink-900">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <FileIcon className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="min-w-0 flex-1 truncate text-slate-200">{f.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">{formatSize(f.size)}</span>
                    {!uploading && (
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                        className="shrink-0 text-slate-500 hover:text-red-400"
                        aria-label={`Remove ${f.name}`}
                      >
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Details */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-300">
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholderTitle} className={fieldClass} disabled={uploading} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-300">
              Author
              <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Optional" className={fieldClass} disabled={uploading} />
            </label>
          </div>

          {/* Pricing */}
          <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-200">Charge for this book</p>
                <p className="text-xs text-slate-400">Readers see a free preview, then must purchase to continue.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={paid}
                onClick={() => setPaid((v) => !v)}
                disabled={uploading}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${paid ? 'bg-accent-600' : 'bg-ink-600'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${paid ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
            {paid && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-300">
                  Price (₹ INR)
                  <input type="number" min="1" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={fieldClass} disabled={uploading} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-300">
                  Free preview pages
                  <input type="number" min="1" step="1" value={freePages} onChange={(e) => setFreePages(e.target.value)} className={fieldClass} disabled={uploading} />
                </label>
              </div>
            )}
          </div>

          {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        </div>

        <div className="flex items-center gap-4 border-t border-ink-700 bg-ink-800 px-6 py-4">
          {uploading ? (
            <div className="flex-1">
              <div className="h-2 overflow-hidden rounded-full bg-ink-700">
                <div className="h-full rounded-full bg-accent-500 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                {progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : 'Upload complete — preparing your book…'}
              </p>
            </div>
          ) : (
            <span className="flex-1" />
          )}
          <button type="button" onClick={cancel} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-ink-700">
            {uploading ? 'Cancel upload' : 'Close'}
          </button>
          <button
            type="submit"
            disabled={!files.length || uploading}
            className="rounded-lg bg-accent-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-accent-600/20 transition hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add to library
          </button>
        </div>
      </form>
    </div>
  )
}

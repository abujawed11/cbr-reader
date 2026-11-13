import { useRef, useState } from 'react'
import { updateBook, uploadCover } from '../api'
import { Field, fieldClass } from './form'
import { BookIcon, CloseIcon, EditIcon } from './icons'

export default function EditBookModal({ book, onClose, onSaved }) {
  const [title, setTitle] = useState(book.title)
  const [author, setAuthor] = useState(book.author || '')
  const [description, setDescription] = useState(book.description || '')
  const [paid, setPaid] = useState(book.priceCents > 0)
  const [price, setPrice] = useState(book.priceCents > 0 ? (book.priceCents / 100).toFixed(2) : '4.99')
  const [freePages, setFreePages] = useState(String(book.freePages))
  const [cover, setCover] = useState(book.coverUrl)
  const [coverBusy, setCoverBusy] = useState(false)
  const [coverError, setCoverError] = useState('')
  const [errors, setErrors] = useState({}) // { field: message, form: message }
  const [busy, setBusy] = useState(false)
  const coverInputRef = useRef(null)

  const pickCover = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCoverBusy(true)
    setCoverError('')
    try {
      const updated = await uploadCover(book.id, file)
      setCover(updated.coverUrl)
      onSaved(updated)
    } catch (err) {
      setCoverError(err.message)
    } finally {
      setCoverBusy(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    const found = {}
    if (!title.trim()) found.title = 'Title is required'
    setErrors(found)
    if (Object.keys(found).length) return

    setBusy(true)
    try {
      const updated = await updateBook(book.id, {
        title,
        author,
        description,
        priceCents: Math.round((paid ? Number(price) || 0 : 0) * 100),
        freePages: paid ? freePages : book.pageCount,
      })
      onSaved(updated)
      onClose()
    } catch (err) {
      setErrors(err.field ? { [err.field]: err.message } : { form: err.message })
      setBusy(false)
    }
  }

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form
        onSubmit={submit}
        className="animate-pop-in flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-800 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-ink-700 px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Edit book</h2>
            <p className="text-sm text-slate-400">Pages stay the same; the cover and details below can change.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-ink-700 hover:text-white" aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-6 py-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              disabled={coverBusy}
              title="Change cover"
              className="group relative h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-ink-900 ring-1 ring-ink-600"
            >
              {cover ? (
                <img src={cover} alt="" className="h-full w-full object-cover" />
              ) : (
                <BookIcon className="absolute inset-0 m-auto h-6 w-6 text-slate-500" />
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition group-hover:opacity-100">
                <EditIcon className="h-5 w-5 text-white" />
              </span>
              {coverBusy && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                </span>
              )}
            </button>
            <div className="text-sm">
              <p className="font-medium text-slate-200">Cover</p>
              <p className="text-xs text-slate-400">Click the thumbnail to upload a custom cover (JPG, PNG or WebP).</p>
              {coverError && <p className="mt-1 text-xs text-red-400">{coverError}</p>}
            </div>
            <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={pickCover} />
          </div>

          <Field label="Title" error={errors.title}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass(errors.title)} disabled={busy} />
          </Field>
          <Field label="Author">
            <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Optional" className={fieldClass()} disabled={busy} />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={3}
              className={`${fieldClass()} resize-none`}
              disabled={busy}
            />
          </Field>

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
                disabled={busy}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${paid ? 'bg-accent-600' : 'bg-ink-600'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${paid ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
            {paid && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Price (₹ INR)">
                  <input type="number" min="1" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={fieldClass()} disabled={busy} />
                </Field>
                <Field label="Free preview pages">
                  <input type="number" min="1" step="1" value={freePages} onChange={(e) => setFreePages(e.target.value)} className={fieldClass()} disabled={busy} />
                </Field>
              </div>
            )}
          </div>

          {errors.form && (
            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {errors.form}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-ink-700 bg-ink-800 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-ink-700">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-accent-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-accent-600/20 transition hover:bg-accent-500 disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

import { useRef, useState } from 'react'
import { deletePage, reorderPages, replacePage, thumbUrl } from '../api'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, TrashIcon, UploadIcon } from './icons'

function PageTile({ bookId, n, position, total, dirty, busy, cacheBust, onMoveLeft, onMoveRight, onReplace, onDelete }) {
  const fileRef = useRef(null)
  return (
    <div className="group relative aspect-[2/3] overflow-hidden rounded-md bg-ink-900 ring-1 ring-ink-700">
      <img src={`${thumbUrl(bookId, n)}?v=${cacheBust}`} alt="" loading="lazy" className="h-full w-full object-cover" />
      <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] font-medium text-slate-200">{position + 1}</span>

      <div className="absolute inset-0 flex flex-col justify-between bg-black/0 opacity-0 transition group-hover:bg-black/50 group-hover:opacity-100">
        <div className="flex items-center justify-between px-1 pt-1">
          <button
            type="button"
            title="Move earlier"
            disabled={busy || position === 0}
            onClick={onMoveLeft}
            className="rounded bg-black/60 p-1 text-white hover:bg-black/80 disabled:opacity-30"
          >
            <ChevronLeftIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Move later"
            disabled={busy || position === total - 1}
            onClick={onMoveRight}
            className="rounded bg-black/60 p-1 text-white hover:bg-black/80 disabled:opacity-30"
          >
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center justify-center gap-2 pb-1.5">
          <button
            type="button"
            title="Replace this page"
            disabled={busy || dirty}
            onClick={() => fileRef.current?.click()}
            className="rounded-full bg-black/60 p-1.5 text-white hover:bg-accent-600 disabled:opacity-30"
          >
            <UploadIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Delete this page"
            disabled={busy || dirty}
            onClick={onDelete}
            className="rounded-full bg-black/60 p-1.5 text-white hover:bg-red-600 disabled:opacity-30"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onReplace(e.target.files?.[0])} />
    </div>
  )
}

export default function ManagePagesModal({ book, onClose, onSaved }) {
  const [order, setOrder] = useState(() => Array.from({ length: book.pageCount }, (_, i) => i + 1))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cacheBust, setCacheBust] = useState(0) // bumped after a replace so the browser re-fetches that thumbnail

  const dirty = order.some((n, i) => n !== i + 1)

  const swap = (i, j) =>
    setOrder((prev) => {
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const saveOrder = async () => {
    setBusy(true)
    setError('')
    try {
      const updated = await reorderPages(book.id, order)
      onSaved(updated)
      setOrder(Array.from({ length: updated.pageCount }, (_, i) => i + 1))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const discardOrder = () => setOrder(Array.from({ length: book.pageCount }, (_, i) => i + 1))

  const handleDelete = async (n) => {
    if (!window.confirm(`Delete page ${n}? This cannot be undone.`)) return
    setBusy(true)
    setError('')
    try {
      const updated = await deletePage(book.id, n)
      onSaved(updated)
      setOrder(Array.from({ length: updated.pageCount }, (_, i) => i + 1))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleReplace = async (n, file) => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const updated = await replacePage(book.id, n, file)
      onSaved(updated)
      setCacheBust((v) => v + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    if (dirty && !window.confirm('You have an unsaved page order. Discard it and close?')) return
    onClose()
  }

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="animate-pop-in flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-700 px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Manage pages</h2>
            <p className="text-sm text-slate-400">Reorder with the arrows, or replace/delete a page. Reordering needs Save.</p>
          </div>
          <button type="button" onClick={close} className="rounded-lg p-2 text-slate-400 hover:bg-ink-700 hover:text-white" aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          {error && (
            <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
          )}
          <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5">
            {order.map((n, i) => (
              <PageTile
                key={n}
                bookId={book.id}
                n={n}
                position={i}
                total={order.length}
                dirty={dirty}
                busy={busy}
                cacheBust={cacheBust}
                onMoveLeft={() => swap(i, i - 1)}
                onMoveRight={() => swap(i, i + 1)}
                onReplace={(file) => handleReplace(n, file)}
                onDelete={() => handleDelete(n)}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-ink-700 bg-ink-800 px-6 py-4">
          {dirty ? (
            <>
              <button type="button" onClick={discardOrder} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-ink-700">
                Discard order
              </button>
              <button
                type="button"
                onClick={saveOrder}
                disabled={busy}
                className="rounded-lg bg-accent-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-accent-600/20 transition hover:bg-accent-500 disabled:cursor-wait disabled:opacity-60"
              >
                {busy ? 'Saving…' : 'Save order'}
              </button>
            </>
          ) : (
            <button type="button" onClick={close} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-ink-700">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

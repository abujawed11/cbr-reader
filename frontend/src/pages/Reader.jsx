import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getBook, pageUrl } from '../api'

const FIT_MODES = ['width', 'height']
const ZOOM_STEP = 0.25

const progressKey = (id) => `reader-progress-${id}`

function loadProgress(id) {
  try {
    return parseInt(localStorage.getItem(progressKey(id)), 10) || 1
  } catch {
    return 1
  }
}

function saveProgress(id, page) {
  try {
    localStorage.setItem(progressKey(id), String(page))
  } catch {
    // storage unavailable: progress simply isn't remembered
  }
}

export default function Reader() {
  const { id } = useParams()
  const [book, setBook] = useState(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [fit, setFit] = useState('width')
  const [zoom, setZoom] = useState(1)
  const [rtl, setRtl] = useState(false)
  const containerRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    getBook(id)
      .then((b) => {
        if (cancelled) return
        if (b.status !== 'ready') return setError('This book is not ready yet.')
        setBook(b)
        setPage(Math.min(loadProgress(id), b.pageCount))
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [id])

  const total = book?.pageCount ?? 0
  const readable = book?.readablePages ?? 0
  const locked = book ? page > readable : false

  const goTo = useCallback(
    (n) => {
      if (!total) return
      const next = Math.min(Math.max(n, 1), total)
      setPage(next)
      saveProgress(id, next)
      scrollRef.current?.scrollTo({ top: 0 })
    },
    [id, total]
  )

  // Direction-aware navigation: in right-to-left mode the arrows swap.
  const forward = useCallback(() => goTo(page + 1), [goTo, page])
  const back = useCallback(() => goTo(page - 1), [goTo, page])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen()
    else containerRef.current?.requestFullscreen?.()
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement) return
      switch (e.key) {
        case 'ArrowRight':
          return rtl ? back() : forward()
        case 'ArrowLeft':
          return rtl ? forward() : back()
        case ' ':
        case 'PageDown':
          e.preventDefault()
          return forward()
        case 'PageUp':
          return back()
        case 'Home':
          return goTo(1)
        case 'End':
          return goTo(total)
        case '+':
        case '=':
          return setZoom((z) => Math.min(z + ZOOM_STEP, 4))
        case '-':
          return setZoom((z) => Math.max(z - ZOOM_STEP, 0.5))
        case '0':
          return setZoom(1)
        case 'f':
          return toggleFullscreen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rtl, forward, back, goTo, total, toggleFullscreen])

  // Warm the browser cache with the next pages the user is allowed to read.
  useEffect(() => {
    if (!book) return
    for (let n = page + 1; n <= Math.min(page + 2, readable); n++) {
      new Image().src = pageUrl(book.id, n)
    }
  }, [book, page, readable])

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-900 text-slate-200">
        <p>{error}</p>
        <Link to="/" className="text-indigo-300 underline">
          Back to library
        </Link>
      </div>
    )
  }
  if (!book) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-300">Loading…</div>
  }

  const btn =
    'rounded-md bg-slate-700 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-600 disabled:opacity-40'
  const imgClass = fit === 'width' ? 'w-full' : 'max-h-full'
  const imgStyle = fit === 'width' ? { width: `${zoom * 100}%`, maxWidth: 'none' } : { height: `${zoom * 100}%`, maxWidth: 'none' }

  return (
    <div ref={containerRef} className="flex h-screen flex-col bg-slate-900 text-slate-100">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-700 bg-slate-800 px-3 py-2">
        <Link to="/" className={btn}>
          ← Library
        </Link>
        <h1 className="mr-auto line-clamp-1 text-sm font-semibold">{book.title}</h1>

        <button className={btn} onClick={() => goTo(page - 1)} disabled={page <= 1}>
          ‹ Prev
        </button>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="number"
            min={1}
            max={total}
            value={page}
            onChange={(e) => goTo(parseInt(e.target.value, 10) || 1)}
            className="w-16 rounded-md bg-slate-700 px-2 py-1 text-center"
          />
          / {total}
        </label>
        <button className={btn} onClick={() => goTo(page + 1)} disabled={page >= total}>
          Next ›
        </button>

        <button className={btn} onClick={() => setFit(FIT_MODES[(FIT_MODES.indexOf(fit) + 1) % FIT_MODES.length])}>
          Fit {fit}
        </button>
        <button className={btn} onClick={() => setZoom((z) => Math.max(z - ZOOM_STEP, 0.5))}>
          −
        </button>
        <span className="w-12 text-center text-sm">{Math.round(zoom * 100)}%</span>
        <button className={btn} onClick={() => setZoom((z) => Math.min(z + ZOOM_STEP, 4))}>
          +
        </button>
        <button className={btn} onClick={() => setRtl((v) => !v)} title="Swap arrow-key direction for manga">
          {rtl ? 'RTL' : 'LTR'}
        </button>
        <button className={btn} onClick={toggleFullscreen}>
          Fullscreen
        </button>
      </header>

      <div ref={scrollRef} className="relative flex-1 overflow-auto">
        {locked ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-lg font-semibold">You've reached the end of the free preview</p>
            <p className="max-w-md text-sm text-slate-300">
              Pages 1–{readable} are free. Purchase this book to read all {total} pages.
            </p>
            <button className="rounded-md bg-indigo-600 px-5 py-2 font-semibold hover:bg-indigo-500" disabled>
              Buy ${(book.priceCents / 100).toFixed(2)} (coming soon)
            </button>
            <button className={btn} onClick={() => goTo(readable)}>
              Back to last free page
            </button>
          </div>
        ) : (
          <div className="flex min-h-full justify-center">
            <img
              key={page}
              src={pageUrl(book.id, page)}
              alt={`Page ${page}`}
              className={`${imgClass} select-none`}
              style={imgStyle}
              draggable={false}
            />
            {/* Click zones: outer thirds turn the page, the middle is left free for scrolling/zooming */}
            <button
              aria-label="Previous side"
              onClick={rtl ? forward : back}
              className="fixed bottom-0 left-0 top-12 w-1/5 cursor-w-resize opacity-0"
            />
            <button
              aria-label="Next side"
              onClick={rtl ? back : forward}
              className="fixed bottom-0 right-0 top-12 w-1/5 cursor-e-resize opacity-0"
            />
          </div>
        )}
      </div>
    </div>
  )
}

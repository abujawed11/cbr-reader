import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getBook, pageUrl, saveProgress, thumbUrl } from '../api'
import { useAuth } from '../auth/AuthContext'
import { formatPrice } from '../lib/format'
import { payForBook } from '../lib/razorpay'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DirectionIcon,
  DoublePageIcon,
  ExpandIcon,
  FitHeightIcon,
  FitWidthIcon,
  GridIcon,
  KeyboardIcon,
  LockIcon,
  ScrollIcon,
  SinglePageIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../components/icons'

const ZOOM_MIN = 0.5
const ZOOM_MAX = 4
const ZOOM_STEP = 0.25
const HIDE_UI_AFTER_MS = 3000

// ---- persisted preferences (best effort: storage may be unavailable) ----
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key)
      return v === null ? fallback : JSON.parse(v)
    } catch {
      return fallback
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // ignore
    }
  },
}

// ---- spread maths: in double-page mode the cover stands alone, then pages pair up (2-3, 4-5, ...) —
// except a page that is wider than it is tall (a double-spread scanned as one image), which always stands alone. ----
function buildSpreads(total, wideSet) {
  const spreads = []
  let n = 1
  while (n <= total) {
    const alone = n === 1 || n === total || wideSet.has(n) || wideSet.has(n + 1)
    spreads.push(alone ? [n] : [n, n + 1])
    n += alone ? 1 : 2
  }
  return spreads
}
const spreadOf = (spreads, n) => spreads.find((s) => s.includes(n))

function IconButton({ label, active, className = '', children, ...rest }) {
  return (
    <button
      title={label}
      aria-label={label}
      className={`rounded-lg p-2 transition hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent ${
        active ? 'bg-white/15 text-accent-400' : 'text-slate-200'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

function PageImage({ bookId, n, fit, zoom, slots }) {
  const [state, setState] = useState('loading') // loading | loaded | error
  const byWidth = fit === 'width'
  // Reserve space while loading so the placeholder is visible and the layout doesn't jump.
  const box = byWidth
    ? { width: `${(zoom * 100) / slots}vw`, minHeight: state === 'loaded' ? undefined : '70vh' }
    : { height: `${zoom * 100}vh`, aspectRatio: state === 'loaded' ? undefined : '2 / 3' }

  return (
    <div className="relative shrink-0" style={box}>
      {state === 'loading' && (
        <div className="skeleton absolute inset-0 flex items-center justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-600 border-t-accent-400" />
        </div>
      )}
      {state === 'error' ? (
        <div className="flex h-full min-h-[50vh] items-center justify-center px-6 text-sm text-slate-400">
          Could not load page {n}
        </div>
      ) : (
        <img
          src={pageUrl(bookId, n)}
          alt={`Page ${n}`}
          draggable={false}
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
          className={`block select-none ${byWidth ? 'h-auto w-full' : 'h-full w-auto max-w-none'} ${
            state === 'loaded' ? 'animate-fade-in' : 'opacity-0'
          }`}
        />
      )}
    </div>
  )
}

function LockedTile({ n, readable, total, price, fullScreen, signedIn, returnTo, buying, onBuy, onBackToPreview }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 text-center ${
        fullScreen ? 'min-h-screen w-full px-6' : 'aspect-[2/3] h-[70vh] rounded-lg bg-ink-800 px-4'
      }`}
    >
      <span className="rounded-full bg-accent-500/15 p-4 text-accent-400">
        <LockIcon className="h-8 w-8" />
      </span>
      <h2 className="text-xl font-semibold text-white">{fullScreen ? 'Enjoying the story?' : `Page ${n} is locked`}</h2>
      <p className="max-w-sm text-sm text-slate-400">
        You&apos;ve read the free preview (pages 1–{readable}). Purchase this book to unlock all {total} pages.
      </p>
      {fullScreen && (
        <>
          {signedIn ? (
            <button
              onClick={onBuy}
              disabled={buying}
              className="rounded-full bg-accent-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-600/25 transition hover:bg-accent-500 disabled:cursor-wait disabled:opacity-70"
            >
              {buying ? 'Opening payment…' : `Buy for ${price}`}
            </button>
          ) : (
            <Link
              to="/login"
              state={{ from: returnTo }}
              className="rounded-full bg-accent-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-500"
            >
              Sign in to purchase · {price}
            </Link>
          )}
          <button onClick={onBackToPreview} className="text-sm text-slate-400 underline-offset-4 hover:text-white hover:underline">
            Back to the last free page
          </button>
        </>
      )}
    </div>
  )
}

function Thumbnails({ book, current, slots, readable, onSelect, onClose }) {
  const currentRef = useRef(null)
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center' })
  }, [])

  return (
    <aside className="animate-fade-in absolute inset-y-0 right-0 z-30 flex w-72 max-w-[85vw] flex-col border-l border-white/10 bg-ink-900/95 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Pages</h2>
        <IconButton label="Close pages" onClick={onClose}>
          <CloseIcon className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-3">
        {Array.from({ length: book.pageCount }, (_, i) => i + 1).map((n) => {
          const locked = n > readable
          const active = slots.includes(n)
          return (
            <button
              key={n}
              ref={n === current ? currentRef : undefined}
              onClick={() => onSelect(n)}
              className={`group relative aspect-[2/3] overflow-hidden rounded-md bg-ink-800 ring-2 transition ${
                active ? 'ring-accent-500' : 'ring-transparent hover:ring-white/30'
              }`}
            >
              {locked ? (
                <span className="flex h-full items-center justify-center text-slate-500">
                  <LockIcon className="h-6 w-6" />
                </span>
              ) : (
                <img src={thumbUrl(book.id, n)} alt="" loading="lazy" className="h-full w-full object-cover" />
              )}
              <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 text-[10px] font-medium text-slate-200">{n}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

const SHORTCUTS = [
  ['← / →', 'Previous / next page'],
  ['Space, PageDown', 'Next page'],
  ['Home / End', 'First / last page'],
  ['+ / − / 0', 'Zoom in / out / reset'],
  ['D', 'Toggle single / double page'],
  ['W', 'Toggle continuous scroll'],
  ['T', 'Page thumbnails'],
  ['F', 'Fullscreen'],
  ['?', 'This help'],
]

export default function Reader() {
  const { id } = useParams()
  const { user } = useAuth()
  const [book, setBook] = useState(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [double, setDouble] = useState(() => store.get('reader-double', false))
  const [fit, setFit] = useState(() => store.get('reader-fit', 'width'))
  const [rtl, setRtl] = useState(() => store.get('reader-rtl', false))
  const [webtoon, setWebtoon] = useState(() => store.get('reader-webtoon', false))
  const [zoom, setZoom] = useState(1)
  const [uiVisible, setUiVisible] = useState(true)
  const [panel, setPanel] = useState(null) // null | 'thumbs' | 'help'
  const [buying, setBuying] = useState(false)
  const [notice, setNotice] = useState(null) // { type: 'success' | 'error', text }
  const scrollRef = useRef(null)
  const rootRef = useRef(null)
  const hideTimer = useRef(null)
  const touch = useRef(null)
  const progressTimer = useRef(null)
  const pageRefs = useRef(new Map()) // webtoon mode: page number -> its DOM node, for scroll-to and visibility tracking

  useEffect(() => store.set('reader-double', double), [double])
  useEffect(() => store.set('reader-fit', fit), [fit])
  useEffect(() => store.set('reader-rtl', rtl), [rtl])
  useEffect(() => store.set('reader-webtoon', webtoon), [webtoon])

  useEffect(() => {
    let cancelled = false
    getBook(id)
      .then((b) => {
        if (cancelled) return
        if (b.status !== 'ready') return setError('This book is still being prepared. Try again in a moment.')
        setBook(b)
        // Signed-in readers resume from the server (follows them across devices); guests fall back to this browser's copy.
        const saved = b.lastPage ?? store.get(`reader-progress-${id}`, 1)
        setPage(Math.min(Math.max(saved, 1), b.pageCount))
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [id])

  // Buying: open Razorpay, then reload the book so the server's updated access (readablePages) takes effect.
  const buy = useCallback(async () => {
    if (!book || buying) return
    setBuying(true)
    setNotice(null)
    try {
      await payForBook(book)
      setNotice({ type: 'success', text: 'Purchase complete. Enjoy the book!' })
    } catch (err) {
      if (err.name !== 'PaymentCancelled') setNotice({ type: 'error', text: err.message })
    } finally {
      // Refresh even after an error: the webhook may have unlocked the book in the meantime.
      try {
        setBook(await getBook(book.id))
      } catch {
        // keep the current view; the next navigation will refetch
      }
      setBuying(false)
    }
  }, [book, buying])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), notice.type === 'error' ? 10000 : 5000)
    return () => clearTimeout(timer)
  }, [notice])

  const total = book?.pageCount ?? 0
  const readable = book?.readablePages ?? 0
  const wideSet = useMemo(() => new Set(book?.widePages ?? []), [book])
  const spreads = useMemo(() => (double && total ? buildSpreads(total, wideSet) : null), [double, total, wideSet])
  // Normalizes any page number to the first page of the spread it belongs to (identity outside double-page mode).
  const normalizeStart = useCallback((n) => (spreads ? (spreadOf(spreads, n)?.[0] ?? n) : n), [spreads])

  const start = normalizeStart(page)
  const slots = useMemo(() => (spreads ? (spreadOf(spreads, start) ?? [start]) : [start]), [spreads, start])
  const fullyLocked = book ? slots[0] > readable : false
  const atFirst = start <= 1
  const atLast = slots[slots.length - 1] >= total

  // Persists where the reader is, without touching scroll position (used by goTo and by the webtoon visibility tracker).
  const reportProgress = useCallback(
    (n) => {
      store.set(`reader-progress-${id}`, n)
      if (user) {
        clearTimeout(progressTimer.current)
        progressTimer.current = setTimeout(() => saveProgress(id, n).catch(() => {}), 1000)
      }
    },
    [id, user]
  )
  useEffect(() => () => clearTimeout(progressTimer.current), [])

  const goTo = useCallback(
    (n) => {
      if (!total) return
      const next = normalizeStart(Math.min(Math.max(n, 1), total))
      setPage(next)
      reportProgress(next)
      if (webtoon) pageRefs.current.get(next)?.scrollIntoView({ block: 'start' })
      else scrollRef.current?.scrollTo({ top: 0, left: 0 })
    },
    [total, webtoon, reportProgress, normalizeStart]
  )
  const forward = useCallback(() => {
    if (atLast) return
    const idx = spreads ? spreads.findIndex((s) => s.includes(start)) : -1
    goTo(spreads ? (spreads[idx + 1]?.[0] ?? start) : start + 1)
  }, [atLast, goTo, spreads, start])
  const back = useCallback(() => {
    if (atFirst) return
    const idx = spreads ? spreads.findIndex((s) => s.includes(start)) : -1
    goTo(spreads ? (spreads[idx - 1]?.[0] ?? start) : start - 1)
  }, [atFirst, goTo, spreads, start])
  const left = rtl ? forward : back
  const right = rtl ? back : forward

  // Switching modes keeps the reader on the same page (spreads are re-aligned).
  const toggleDouble = useCallback(() => {
    const next = !double
    setDouble(next)
    setPage((p) => (next && total ? (spreadOf(buildSpreads(total, wideSet), p)?.[0] ?? p) : p))
  }, [double, total, wideSet])

  // Webtoon and double-page spreads don't mix; turning one on turns the other off.
  const toggleWebtoon = useCallback(() => {
    setWebtoon((w) => !w)
    setDouble(false)
  }, [])

  // While scrolling continuously, track whichever page is most visible so the slider/progress follow along.
  useEffect(() => {
    if (!webtoon || !book) return
    const root = scrollRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (!best) return
        const n = Number(best.target.dataset.page)
        setPage(n)
        reportProgress(n)
      },
      { root, threshold: [0.5] }
    )
    pageRefs.current.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [webtoon, book, readable, reportProgress])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen()
    else rootRef.current?.requestFullscreen?.()
  }, [])
  const zoomBy = useCallback((delta) => setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2)))), [])

  // Auto-hiding chrome: reveal on activity, hide after a pause (never while a panel is open).
  const poke = useCallback(() => {
    setUiVisible(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setUiVisible(false), HIDE_UI_AFTER_MS)
  }, [])
  useEffect(() => {
    poke()
    return () => clearTimeout(hideTimer.current)
  }, [poke])
  const chromeShown = uiVisible || panel !== null || fullyLocked

  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return
      poke()
      // Page-turning keys don't apply to a continuous scroll; let the browser's own scrolling handle them instead.
      if (!webtoon) {
        switch (e.key) {
          case 'ArrowLeft':
            return left()
          case 'ArrowRight':
            return right()
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
        }
      }
      switch (e.key) {
        case '+':
        case '=':
          return zoomBy(ZOOM_STEP)
        case '-':
          return zoomBy(-ZOOM_STEP)
        case '0':
          return setZoom(1)
        case 'd':
          return !webtoon && toggleDouble()
        case 'w':
          return toggleWebtoon()
        case 't':
          return setPanel((p) => (p === 'thumbs' ? null : 'thumbs'))
        case 'f':
          return toggleFullscreen()
        case '?':
          return setPanel((p) => (p === 'help' ? null : 'help'))
        case 'Escape':
          return setPanel(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [webtoon, left, right, forward, back, goTo, total, zoomBy, toggleDouble, toggleWebtoon, toggleFullscreen, poke])

  // Warm the cache with the next couple of readable pages.
  useEffect(() => {
    if (!book) return
    const last = slots[slots.length - 1]
    for (let n = last + 1; n <= Math.min(last + 3, readable); n++) new Image().src = pageUrl(book.id, n)
  }, [book, slots, readable])

  const onViewerClick = (e) => {
    if (fullyLocked || e.target.closest('button, a')) return
    // Continuous scroll has no left/right pages to tap toward; any tap just shows/hides the chrome.
    if (webtoon) return setUiVisible((v) => !v)
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    if (x < 0.25) left()
    else if (x > 0.75) right()
    else setUiVisible((v) => !v)
  }
  const pinch = useRef(null) // { startDist, startZoom } while two fingers are down
  const pinchDist = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)

  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      touch.current = null
      pinch.current = { startDist: pinchDist(e.touches), startZoom: zoom }
      return
    }
    pinch.current = null
    const t = e.touches[0]
    touch.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null
  }
  const onTouchMove = (e) => {
    if (!pinch.current || e.touches.length !== 2) return
    e.preventDefault()
    const scale = pinchDist(e.touches) / pinch.current.startDist
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(pinch.current.startZoom * scale).toFixed(2))))
  }
  const onTouchEnd = (e) => {
    if (e.touches.length < 2) pinch.current = null
    // A vertical scroll swipe isn't a page-turn gesture.
    if (webtoon || !touch.current || zoom > 1) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touch.current.x
    const dy = t.clientY - touch.current.y
    touch.current = null
    if (Math.abs(dx) > 60 && Math.abs(dy) < 60) (dx < 0 ? right : left)()
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-slate-300">
        <p>{error}</p>
        <Link to="/" className="rounded-full bg-accent-600 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-500">
          Back to library
        </Link>
      </div>
    )
  }
  if (!book) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="h-10 w-10 animate-spin rounded-full border-2 border-ink-600 border-t-accent-400" />
      </div>
    )
  }

  const label = slots.length > 1 ? `${slots[0]}–${slots[slots.length - 1]}` : `${slots[0]}`
  const visualSlots = rtl ? [...slots].reverse() : slots
  const previewEndsAt = readable < total ? ((readable - 1) / Math.max(total - 1, 1)) * 100 : null
  const barBase = 'absolute inset-x-0 z-20 transition duration-300'
  const price = formatPrice(book.priceCents, book.currency)

  return (
    <div ref={rootRef} className="relative h-screen overflow-hidden bg-black" onMouseMove={poke}>
      {notice && (
        <div
          role="status"
          className={`animate-pop-in absolute left-1/2 top-4 z-50 flex max-w-[90vw] -translate-x-1/2 items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${
            notice.type === 'success'
              ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-200'
              : 'border-red-500/40 bg-red-950/90 text-red-200'
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Viewer */}
      <div
        ref={scrollRef}
        className="h-full overflow-auto"
        onClick={onViewerClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {webtoon ? (
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-1 py-4">
            {Array.from({ length: readable }, (_, i) => i + 1).map((n) => (
              <div
                key={n}
                ref={(el) => (el ? pageRefs.current.set(n, el) : pageRefs.current.delete(n))}
                data-page={n}
                style={{ width: `${zoom * 100}%` }}
                className="shrink-0"
              >
                <img
                  src={pageUrl(book.id, n)}
                  alt={`Page ${n}`}
                  loading="lazy"
                  draggable={false}
                  className="block w-full select-none"
                />
              </div>
            ))}
            {readable < total && (
              <LockedTile
                n={readable + 1}
                readable={readable}
                total={total}
                price={price}
                fullScreen
                signedIn={!!user}
                returnTo={`/read/${book.id}`}
                buying={buying}
                onBuy={buy}
                onBackToPreview={() => goTo(readable)}
              />
            )}
          </div>
        ) : (
          <div className="flex min-h-screen w-max min-w-full items-center justify-center">
            {fullyLocked ? (
              <LockedTile
                n={slots[0]}
                readable={readable}
                total={total}
                price={price}
                fullScreen
                signedIn={!!user}
                returnTo={`/read/${book.id}`}
                buying={buying}
                onBuy={buy}
                onBackToPreview={() => goTo(readable)}
              />
            ) : (
              visualSlots.map((n) =>
                n > readable ? (
                  <LockedTile key={n} n={n} readable={readable} total={total} price={price} />
                ) : (
                  <PageImage key={`${book.id}-${n}`} bookId={book.id} n={n} fit={fit} zoom={zoom} slots={slots.length} />
                )
              )
            )}
          </div>
        )}
      </div>

      {/* Edge arrows (desktop hint) */}
      {!fullyLocked && !webtoon && (
        <>
          <button
            onClick={left}
            aria-label="Turn page left"
            className={`absolute left-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-black/50 p-3 text-white backdrop-blur transition hover:bg-black/80 md:block ${
              chromeShown ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
          <button
            onClick={right}
            aria-label="Turn page right"
            className={`absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-black/50 p-3 text-white backdrop-blur transition hover:bg-black/80 md:block ${
              chromeShown ? 'opacity-100' : 'pointer-events-none opacity-0'
            } ${panel === 'thumbs' ? 'md:hidden' : ''}`}
          >
            <ChevronRightIcon className="h-6 w-6" />
          </button>
        </>
      )}

      {/* Top bar */}
      <header
        className={`${barBase} top-0 flex items-center gap-1 bg-gradient-to-b from-black/85 to-transparent px-3 pb-6 pt-3 ${
          chromeShown ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-full opacity-0'
        }`}
      >
        <Link to="/" className="rounded-lg p-2 text-slate-200 hover:bg-white/10" title="Back to library" aria-label="Back to library">
          <ChevronLeftIcon />
        </Link>
        <div className="mr-auto min-w-0 px-1">
          <h1 className="truncate text-sm font-semibold text-white">{book.title}</h1>
          {book.author && <p className="truncate text-xs text-slate-400">{book.author}</p>}
        </div>
        <IconButton label="Pages (T)" active={panel === 'thumbs'} onClick={() => setPanel((p) => (p === 'thumbs' ? null : 'thumbs'))}>
          <GridIcon />
        </IconButton>
        {!webtoon && (
          <IconButton label={double ? 'Single page (D)' : 'Double page (D)'} active={double} onClick={toggleDouble} className="hidden sm:block">
            {double ? <DoublePageIcon /> : <SinglePageIcon />}
          </IconButton>
        )}
        <IconButton label={webtoon ? 'Paged view (W)' : 'Continuous scroll (W)'} active={webtoon} onClick={toggleWebtoon}>
          <ScrollIcon />
        </IconButton>
        {!webtoon && (
          <IconButton label={fit === 'width' ? 'Fit to height' : 'Fit to width'} onClick={() => setFit((f) => (f === 'width' ? 'height' : 'width'))}>
            {fit === 'width' ? <FitWidthIcon /> : <FitHeightIcon />}
          </IconButton>
        )}
        <IconButton label="Zoom out (−)" onClick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} className="hidden sm:block">
          <ZoomOutIcon />
        </IconButton>
        <button
          onClick={() => setZoom(1)}
          title="Reset zoom (0)"
          className="hidden w-12 rounded-lg py-1 text-center text-xs font-medium text-slate-200 hover:bg-white/10 sm:block"
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton label="Zoom in (+)" onClick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} className="hidden sm:block">
          <ZoomInIcon />
        </IconButton>
        {!webtoon && (
          <IconButton label={rtl ? 'Right-to-left (manga)' : 'Left-to-right'} active={rtl} onClick={() => setRtl((v) => !v)}>
            <DirectionIcon />
          </IconButton>
        )}
        <IconButton label="Fullscreen (F)" onClick={toggleFullscreen}>
          <ExpandIcon />
        </IconButton>
        <IconButton label="Keyboard shortcuts (?)" onClick={() => setPanel((p) => (p === 'help' ? null : 'help'))} className="hidden md:block">
          <KeyboardIcon />
        </IconButton>
      </header>

      {/* Bottom bar */}
      <footer
        className={`${barBase} bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/85 to-transparent px-4 pb-4 pt-8 ${
          chromeShown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'
        }`}
      >
        <IconButton label="Previous page" onClick={back} disabled={atFirst}>
          <ChevronLeftIcon />
        </IconButton>
        <div className="relative flex-1">
          <input
            type="range"
            className="reader-slider w-full"
            min={1}
            max={total}
            value={Math.min(page, total)}
            dir={rtl ? 'rtl' : 'ltr'}
            onChange={(e) => goTo(parseInt(e.target.value, 10))}
            aria-label="Page"
          />
          {previewEndsAt !== null && (
            <span
              title={`Free preview ends after page ${readable}`}
              className="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded bg-amber-400"
              style={rtl ? { right: `${previewEndsAt}%` } : { left: `${previewEndsAt}%` }}
            />
          )}
        </div>
        <span className="w-24 text-center text-sm tabular-nums text-slate-200">
          {label} <span className="text-slate-500">/ {total}</span>
        </span>
        <IconButton label="Next page" onClick={forward} disabled={atLast}>
          <ChevronRightIcon />
        </IconButton>
      </footer>

      {panel === 'thumbs' && (
        <Thumbnails
          book={book}
          current={page}
          slots={slots}
          readable={readable}
          onSelect={(n) => goTo(n)}
          onClose={() => setPanel(null)}
        />
      )}

      {panel === 'help' && (
        <div
          className="animate-fade-in absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setPanel(null)}
        >
          <div className="animate-pop-in w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-800 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Keyboard shortcuts</h2>
              <IconButton label="Close" onClick={() => setPanel(null)}>
                <CloseIcon className="h-4 w-4" />
              </IconButton>
            </div>
            <dl className="flex flex-col gap-2.5 text-sm">
              {SHORTCUTS.map(([keys, desc]) => (
                <div key={keys} className="flex items-center justify-between gap-4">
                  <dt className="text-slate-400">{desc}</dt>
                  <dd className="rounded-md bg-ink-700 px-2 py-0.5 font-mono text-xs text-slate-200">{keys}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-slate-500">Tap the screen edges to turn pages, or the centre to show/hide controls. On touch screens, swipe.</p>
          </div>
        </div>
      )}
    </div>
  )
}

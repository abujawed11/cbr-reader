import { Link } from 'react-router-dom'
import { BookIcon, LockIcon, TrashIcon } from './icons'

import { formatPrice } from '../lib/format'

export default function BookCard({ book, onDelete }) {
  const ready = book.status === 'ready'
  const free = book.priceCents === 0
  const owned = book.purchased
  // Free, bought, or admin: the server already worked out how many pages this viewer can read.
  const fullAccess = ready && book.readablePages >= book.pageCount

  const cover = book.coverUrl ? (
    <img
      src={book.coverUrl}
      alt={book.title}
      loading="lazy"
      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
    />
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-sm text-slate-400">
      {book.status === 'processing' && (
        <>
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-ink-600 border-t-accent-400" />
          <span>Converting pages…</span>
        </>
      )}
      {book.status === 'failed' && (
        <>
          <BookIcon className="h-7 w-7 text-red-400" />
          <span className="text-red-300">Conversion failed</span>
          <span className="line-clamp-3 text-xs text-slate-500">{book.error}</span>
        </>
      )}
    </div>
  )

  const coverBox = (
    <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-ink-800 shadow-lg shadow-black/40 ring-1 ring-white/5 transition duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-accent-600/10 group-hover:ring-accent-500/40">
      {cover}
      {ready && (
        <div className="absolute inset-x-0 bottom-0 flex translate-y-2 items-end justify-center bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-10 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <span className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-ink-950">
            {fullAccess ? 'Read now' : !owned && !free ? `Unlock · ${formatPrice(book.priceCents, book.currency)}` : `Read ${book.freePages}-page preview`}
          </span>
        </div>
      )}
    </div>
  )

  return (
    <article className="group relative flex flex-col gap-3">
      {ready ? <Link to={`/read/${book.id}`}>{coverBox}</Link> : coverBox}
      {onDelete && (
        <button
          onClick={() => onDelete(book)}
          title="Delete book"
          aria-label={`Delete ${book.title}`}
          className="absolute right-2 top-2 hidden rounded-full bg-black/70 p-1.5 text-slate-200 backdrop-blur hover:bg-red-600 hover:text-white group-hover:block"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      )}
      <div className="px-0.5">
        <h3 className="font-display line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-slate-100">
          {book.title}
        </h3>
        <p className="mt-1 truncate text-xs text-slate-500">
          {book.author ? `${book.author} · ` : ''}
          {ready ? `${book.pageCount} pages` : book.status}
        </p>
        {ready && (
          <span
            className={`font-display mt-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide ring-1 ${
              owned
                ? 'bg-accent-500/10 text-accent-400 ring-accent-500/30'
                : free
                  ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-400 ring-amber-500/30'
            }`}
          >
            {!free && !owned && <LockIcon className="h-3 w-3 shrink-0" />}
            {owned ? 'Owned' : free ? 'Free' : formatPrice(book.priceCents, book.currency)}
          </span>
        )}
      </div>
    </article>
  )
}

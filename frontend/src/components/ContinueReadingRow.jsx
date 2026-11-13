import { Link } from 'react-router-dom'
import { BookIcon } from './icons'

function ContinueCard({ book }) {
  const pct = Math.min(100, Math.round((book.lastPage / book.pageCount) * 100))
  return (
    <Link
      to={`/read/${book.id}`}
      className="group flex w-64 shrink-0 items-center gap-3 rounded-xl bg-ink-800 p-2 pr-3 ring-1 ring-white/5 transition hover:-translate-y-0.5 hover:ring-accent-500/40"
    >
      <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-ink-700">
        {book.coverUrl ? (
          <img src={book.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <BookIcon className="absolute inset-0 m-auto h-5 w-5 text-slate-500" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-1 text-xs font-semibold text-slate-200">{book.title}</h3>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Page {book.lastPage} of {book.pageCount}
        </p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-600">
          <div className="h-full rounded-full bg-accent-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </Link>
  )
}

export default function ContinueReadingRow({ books }) {
  if (!books.length) return null
  return (
    <section className="mb-8">
      <h2 className="font-display mb-3 text-sm font-semibold tracking-wide text-slate-300">Continue reading</h2>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
        {books.map((book) => (
          <ContinueCard key={book.id} book={book} />
        ))}
      </div>
    </section>
  )
}

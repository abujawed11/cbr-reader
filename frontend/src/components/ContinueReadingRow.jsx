import { Link } from 'react-router-dom'

function ContinueCard({ book }) {
  const pct = Math.min(100, Math.round((book.lastPage / book.pageCount) * 100))
  return (
    <Link to={`/read/${book.id}`} className="group w-32 shrink-0 sm:w-36">
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-ink-800 shadow-lg shadow-black/40 ring-1 ring-white/5 transition duration-300 group-hover:-translate-y-1 group-hover:ring-accent-500/40">
        {book.coverUrl && (
          <img
            src={book.coverUrl}
            alt={book.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/60">
          <div className="h-full bg-accent-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <h3 className="mt-2 line-clamp-1 text-xs font-semibold text-slate-200">{book.title}</h3>
      <p className="text-[11px] text-slate-500">Page {book.lastPage} of {book.pageCount}</p>
    </Link>
  )
}

export default function ContinueReadingRow({ books }) {
  if (!books.length) return null
  return (
    <section className="mb-8">
      <h2 className="font-display mb-3 text-sm font-semibold tracking-wide text-slate-300">Continue reading</h2>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
        {books.map((book) => (
          <ContinueCard key={book.id} book={book} />
        ))}
      </div>
    </section>
  )
}

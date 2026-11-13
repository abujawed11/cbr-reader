const price = (cents) => (cents === 0 ? 'Free' : `$${(cents / 100).toFixed(2)}`)

export default function BookCard({ book, onDelete }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-[2/3] bg-slate-100">
        {book.coverUrl ? (
          <img src={book.coverUrl} alt={book.title} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-slate-500">
            {book.status === 'processing' && 'Converting…'}
            {book.status === 'failed' && <span className="text-red-600">Failed: {book.error}</span>}
          </div>
        )}
        <button
          onClick={() => onDelete(book)}
          title="Delete"
          className="absolute right-2 top-2 hidden rounded-full bg-black/60 px-2 py-0.5 text-xs text-white group-hover:block"
        >
          ✕
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{book.title}</h3>
        <p className="text-xs text-slate-500">
          {book.status === 'ready' ? `${book.pageCount} pages` : book.status}
        </p>
        <p className="mt-auto text-sm font-medium text-indigo-600">{price(book.priceCents)}</p>
      </div>
    </article>
  )
}

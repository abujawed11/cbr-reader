import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listBooks } from '../api'
import BookCard from '../components/BookCard'
import { ChevronLeftIcon, HeartIcon } from '../components/icons'

export default function Favorites() {
  const [books, setBooks] = useState(null) // null = loading
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    listBooks()
      .then((rows) => !cancelled && setBooks(rows.filter((b) => b.favorited)))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [])

  const handleFavoriteChange = (id, favorited) => {
    if (!favorited) setBooks((prev) => prev.filter((b) => b.id !== id))
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink-700/70 bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="rounded-lg p-2 text-slate-300 hover:bg-ink-700 hover:text-white" title="Back to library" aria-label="Back to library">
            <ChevronLeftIcon className="h-5 w-5" />
          </Link>
          <h1 className="font-display text-lg font-bold tracking-tight text-white">Favourites</h1>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {error && (
          <p className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Could not reach the server: {error}
          </p>
        )}

        {books === null ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex flex-col gap-3">
                <div className="skeleton aspect-[2/3] rounded-xl" />
                <div className="skeleton h-3 w-3/4 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
              </div>
            ))}
          </div>
        ) : books.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-ink-600 px-6 py-20 text-center">
            <span className="rounded-full bg-accent-500/15 p-4 text-accent-400">
              <HeartIcon className="h-8 w-8" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-white">No favourites yet</h2>
              <p className="mt-1 max-w-sm text-sm text-slate-400">Tap the heart on a book's cover to save it here.</p>
            </div>
            <Link to="/" className="rounded-full bg-accent-600 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-500">
              Browse the library
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {books.map((book) => (
              <BookCard key={book.id} book={book} onFavoriteChange={handleFavoriteChange} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

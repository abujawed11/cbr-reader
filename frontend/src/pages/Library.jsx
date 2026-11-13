import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteBook, listBooks } from '../api'
import { useAuth } from '../auth/AuthContext'
import BookCard from '../components/BookCard'
import UploadModal from '../components/UploadModal'
import UserMenu from '../components/UserMenu'
import { BookIcon, PlusIcon, SearchIcon, UploadIcon } from '../components/icons'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'free', label: 'Free' },
  { id: 'premium', label: 'Premium' },
]

export default function Library() {
  const { user, loading: authLoading } = useAuth()
  // Only admins can add or delete books. This just hides the controls: the server enforces it.
  const isAdmin = user?.role === 'admin'
  const [books, setBooks] = useState(null) // null = first load in progress
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [modalFiles, setModalFiles] = useState(null) // null = closed, array = open (maybe prefilled)
  const [dragOver, setDragOver] = useState(false)
  const dragDepth = useRef(0)

  const refresh = useCallback(async () => {
    try {
      setBooks(await listBooks())
      setError('')
    } catch (err) {
      setError(err.message)
      setBooks((prev) => prev ?? [])
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Poll while any book is still being converted.
  const hasProcessing = books?.some((b) => b.status === 'processing')
  useEffect(() => {
    if (!hasProcessing) return
    const timer = setInterval(refresh, 2000)
    return () => clearInterval(timer)
  }, [hasProcessing, refresh])

  // Admins can drop files anywhere on the page to start an upload. For everyone else a stray drop is
  // swallowed so the browser doesn't navigate away to the dropped file.
  useEffect(() => {
    const hasFiles = (e) => e.dataTransfer?.types?.includes('Files')
    const enter = (e) => {
      if (!hasFiles(e) || !isAdmin) return
      dragDepth.current++
      setDragOver(true)
    }
    const leave = (e) => {
      if (!hasFiles(e) || !isAdmin) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragOver(false)
    }
    const over = (e) => hasFiles(e) && e.preventDefault()
    const drop = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (!isAdmin) return
      dragDepth.current = 0
      setDragOver(false)
      setModalFiles((open) => (open ? open : Array.from(e.dataTransfer.files)))
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [isAdmin])

  const handleDelete = async (book) => {
    if (!window.confirm(`Delete "${book.title}"? This cannot be undone.`)) return
    try {
      await deleteBook(book.id)
      refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (books ?? []).filter((b) => {
      if (filter === 'free' && b.priceCents !== 0) return false
      if (filter === 'premium' && b.priceCents === 0) return false
      return !q || b.title.toLowerCase().includes(q) || (b.author || '').toLowerCase().includes(q)
    })
  }, [books, query, filter])

  const openUpload = () => setModalFiles([])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink-700/70 bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="rounded-xl bg-accent-600 p-2 text-white shadow-lg shadow-accent-600/30">
              <BookIcon className="h-5 w-5" />
            </span>
            <span className="font-display hidden text-lg font-bold tracking-tight text-white sm:block">Bookshelf</span>
          </div>

          <div className="relative ml-auto w-full max-w-sm">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title or author"
              className="w-full rounded-full border border-ink-700 bg-ink-800 py-2 pl-9 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
            />
          </div>

          {isAdmin && (
            <button
              onClick={openUpload}
              className="flex shrink-0 items-center gap-2 rounded-full bg-accent-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent-600/25 transition hover:bg-accent-500"
            >
              <PlusIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Add book</span>
            </button>
          )}

          {authLoading ? (
            <span className="h-9 w-9 shrink-0" />
          ) : user ? (
            <UserMenu />
          ) : (
            <Link to="/login" state={{ from: '/' }} className="shrink-0 rounded-full border border-ink-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-ink-700">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white">Library</h1>
            <p className="text-sm text-slate-400">
              {books === null ? 'Loading…' : `${books.length} ${books.length === 1 ? 'book' : 'books'}`}
            </p>
          </div>
          <div className="flex rounded-full border border-ink-700 bg-ink-800 p-1 text-sm">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-4 py-1 font-medium transition ${
                  filter === f.id ? 'bg-ink-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Could not reach the server: {error}
          </p>
        )}

        {books === null ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="flex flex-col gap-3">
                <div className="skeleton aspect-[2/3] rounded-xl" />
                <div className="skeleton h-3 w-3/4 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
              </div>
            ))}
          </div>
        ) : books.length === 0 && !error ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-ink-600 px-6 py-20 text-center">
            <span className="rounded-full bg-accent-500/15 p-4 text-accent-400">
              <UploadIcon className="h-8 w-8" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-white">{isAdmin ? 'Your shelf is empty' : 'No books yet'}</h2>
              <p className="mt-1 max-w-sm text-sm text-slate-400">
                {isAdmin
                  ? 'Drop a .cbr, .cbz or .pdf file anywhere on this page, or add your first book.'
                  : 'The library is empty right now. Check back soon for new books.'}
              </p>
            </div>
            {isAdmin && (
              <button onClick={openUpload} className="rounded-full bg-accent-600 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-500">
                Add your first book
              </button>
            )}
          </div>
        ) : visible.length === 0 ? (
          <p className="py-16 text-center text-slate-400">No books match your search.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {visible.map((book) => (
              <BookCard key={book.id} book={book} onDelete={isAdmin ? handleDelete : undefined} />
            ))}
          </div>
        )}
      </main>

      {modalFiles && isAdmin && <UploadModal initialFiles={modalFiles} onClose={() => setModalFiles(null)} onUploaded={refresh} />}

      {dragOver && !modalFiles && (
        <div className="animate-fade-in pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-ink-950/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-accent-500 bg-accent-500/10 px-16 py-12">
            <UploadIcon className="h-10 w-10 text-accent-400" />
            <p className="text-lg font-semibold text-white">Drop to add to your library</p>
          </div>
        </div>
      )}
    </div>
  )
}

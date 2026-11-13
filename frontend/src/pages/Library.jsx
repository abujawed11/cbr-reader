import { useCallback, useEffect, useState } from 'react'
import { deleteBook, listBooks } from '../api'
import BookCard from '../components/BookCard'
import UploadForm from '../components/UploadForm'

export default function Library() {
  const [books, setBooks] = useState([])
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setBooks(await listBooks())
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Poll while any book is still being converted.
  const hasProcessing = books.some((b) => b.status === 'processing')
  useEffect(() => {
    if (!hasProcessing) return
    const timer = setInterval(refresh, 2000)
    return () => clearInterval(timer)
  }, [hasProcessing, refresh])

  const handleDelete = async (book) => {
    if (!window.confirm(`Delete "${book.title}"?`)) return
    await deleteBook(book.id)
    refresh()
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <h1 className="text-xl font-bold text-slate-900">Book Library</h1>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
        <UploadForm onUploaded={refresh} />
        {error && <p className="text-sm text-red-600">Could not reach the server: {error}</p>}
        {books.length === 0 && !error ? (
          <p className="text-slate-500">No books yet. Upload a .cbr or .cbz file to get started.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {books.map((book) => (
              <BookCard key={book.id} book={book} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

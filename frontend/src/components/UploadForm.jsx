import { useRef, useState } from 'react'
import { uploadBook } from '../api'

export default function UploadForm({ onUploaded }) {
  const inputRef = useRef(null)
  const [files, setFiles] = useState([])
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setFiles([])
    setTitle('')
    setPrice('0')
    if (inputRef.current) inputRef.current.value = ''
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!files.length) return
    setBusy(true)
    setError('')
    try {
      await uploadBook({ files, title, price })
      reset()
      onUploaded()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        File(s): .cbr, .cbz or images
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".cbr,.cbz,.zip,.rar,image/*"
          onChange={(e) => setFiles(Array.from(e.target.files))}
          className="text-sm font-normal file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-indigo-700"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Title (optional)
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Price
        <input
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-24 rounded-md border border-slate-300 px-2 py-1.5 font-normal"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !files.length}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {busy ? 'Uploading…' : 'Add book'}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  )
}

async function request(url, options) {
  const res = await fetch(url, options)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${res.status})`)
  }
  return res.status === 204 ? null : res.json()
}

export const listBooks = () => request('/api/books')

export const getBook = (id) => request(`/api/books/${id}`)

export const pageUrl = (bookId, n) => `/api/books/${bookId}/pages/${n}`
export const thumbUrl = (bookId, n) => `/api/books/${bookId}/pages/${n}/thumb`

export const deleteBook = (id) => request(`/api/books/${id}`, { method: 'DELETE' })

// Uses XMLHttpRequest (not fetch) because fetch can't report upload progress.
// Returns { promise, abort }.
export function uploadBook({ files, title, author, price, freePages }, onProgress) {
  const form = new FormData()
  if (title) form.append('title', title)
  if (author) form.append('author', author)
  form.append('priceCents', String(Math.round((Number(price) || 0) * 100)))
  if (freePages) form.append('freePages', String(freePages))
  for (const file of files) form.append('files', file)

  const xhr = new XMLHttpRequest()
  const promise = new Promise((resolve, reject) => {
    xhr.open('POST', '/api/books')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
    xhr.onload = () => {
      let body = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // non-JSON response
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body)
      else reject(new Error(body.error || `Upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Network error: could not reach the server'))
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
    xhr.send(form)
  })
  return { promise, abort: () => xhr.abort() }
}

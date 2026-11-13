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

export const uploadBook = ({ files, title, price }) => {
  const form = new FormData()
  if (title) form.append('title', title)
  form.append('priceCents', String(Math.round((Number(price) || 0) * 100)))
  // Natural order matters when several loose images are uploaded.
  for (const file of files) form.append('files', file)
  return request('/api/books', { method: 'POST', body: form })
}

export const deleteBook = (id) => request(`/api/books/${id}`, { method: 'DELETE' })

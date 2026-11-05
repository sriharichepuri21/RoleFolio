async function call(path: string, init?: RequestInit) {
  const r = await fetch(path, init)
  if (!r.ok) throw new Error((await r.text()) || r.statusText)
  return r
}
const json = (body: unknown) => (typeof body === 'string' || body instanceof Blob ? body : JSON.stringify(body))

export const api = {
  get: <T>(path: string) => call(path).then(r => r.json() as Promise<T>),
  post: <T>(path: string, body: unknown) => call(path, { method: 'POST', body: json(body) }).then(r => r.json() as Promise<T>),
  blob: (path: string, body: unknown) => call(path, { method: 'POST', body: json(body) }).then(r => r.blob()),
  put: (kind: string, rec: { id: string }) => call(`/api/${kind}/${encodeURIComponent(rec.id)}`, { method: 'PUT', body: JSON.stringify(rec) }),
  del: (kind: string, id: string) => call(`/api/${kind}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  parseResume: (body: Blob | string, name: string) =>
    call('/api/parse-resume', { method: 'POST', body, headers: { 'X-File-Name': name } }).then(r => r.json()),
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10000)
}

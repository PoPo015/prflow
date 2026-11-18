// 로컬 API(server/api.ts) 호출

export interface Thread {
  id: string
  file: string
  start: number
  end: number
  messages: { role: 'user' | 'ai'; text: string; at: string; costUsd?: number }[]
}
export interface DefHit { path: string; line: number; text: string; kind: 'type' | 'method' | 'file' }
export interface Usage { path: string; line: number; text: string; inPr: boolean; test: boolean }
export interface Job { id: string; url: string; slug: string; status: 'running' | 'done' | 'failed'; log: string[]; startedAt: number; endedAt?: number }
export interface Note { key: string; name: string; stack: string; short: string; body: string; seenIn: { slug: string; conceptId: string; title: string; at: string }[] }

const get = async <T,>(path: string): Promise<T> => {
  const r = await fetch(path)
  const body = await r.json()
  if (!r.ok) throw new Error(body.error ?? r.statusText)
  return body
}

export const api = (f: string) => ({
  tree: () => get<string[]>(`/api/tree?f=${f}`),
  file: (path: string) => get<{ content: string }>(`/api/file?f=${f}&path=${encodeURIComponent(path)}`).then((r) => r.content),
  def: (sym: string, from: string) => get<DefHit[]>(`/api/def?f=${f}&sym=${encodeURIComponent(sym)}&from=${encodeURIComponent(from)}`),
  refs: (sym: string) => get<{ total: number; hits: Usage[] }>(`/api/refs?f=${f}&sym=${encodeURIComponent(sym)}`),
  threads: () => get<Thread[]>(`/api/threads?f=${f}`),
  ask: async (body: { threadId?: string; file: string; start: number; end: number; question: string }) => {
    const r = await fetch(`/api/ask?f=${f}`, { method: 'POST', body: JSON.stringify(body) })
    const t = await r.json()
    if (!r.ok) throw new Error(t.error ?? r.statusText)
    return t as Thread
  },
})
export type Api = ReturnType<typeof api>

const post = async <T,>(path: string, body: unknown = {}): Promise<T> => {
  const r = await fetch(path, { method: 'POST', body: JSON.stringify(body) })
  const t = await r.json()
  if (!r.ok) throw new Error(t.error ?? r.statusText)
  return t
}

// 레포와 상관없는 API
export const globalApi = {
  analyze: (url: string) => post<Job>('/api/analyze', { url }),
  job: (id: string) => get<Job | null>(`/api/job?id=${id}`),
  notes: () => get<Note[]>('/api/notes'),
  exportNotes: () => post<{ dir: string; count: number }>('/api/notes/export'),
}

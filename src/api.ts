// 로컬 API(server/api.ts) 호출

export interface Thread {
  id: string
  file: string
  start: number
  end: number
  messages: { role: 'user' | 'ai'; text: string; at: string; costUsd?: number }[]
}
export interface DefHit { path: string; line: number; text: string; kind: 'type' | 'method' | 'file' }

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
  threads: () => get<Thread[]>(`/api/threads?f=${f}`),
  ask: async (body: { threadId?: string; file: string; start: number; end: number; question: string }) => {
    const r = await fetch(`/api/ask?f=${f}`, { method: 'POST', body: JSON.stringify(body) })
    const t = await r.json()
    if (!r.ok) throw new Error(t.error ?? r.statusText)
    return t as Thread
  },
})
export type Api = ReturnType<typeof api>

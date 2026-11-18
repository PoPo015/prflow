import { useEffect, useMemo, useState } from 'react'
import { globalApi, type Note } from './api'

// 지금까지 분석한 모든 PR 의 개념을 모은 학습 노트
export function Notes() {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [q, setQ] = useState('')
  const [stack, setStack] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => { globalApi.notes().then(setNotes, (e) => setMsg(e.message)) }, [])

  const stacks = useMemo(() => {
    const c = new Map<string, number>()
    notes?.forEach((n) => c.set(n.stack, (c.get(n.stack) ?? 0) + 1))
    return [...c.entries()].sort((a, b) => b[1] - a[1])
  }, [notes])
  const shown = (notes ?? []).filter((n) =>
    (!stack || n.stack === stack) &&
    (!q || `${n.name} ${n.short} ${n.body}`.toLowerCase().includes(q.toLowerCase())))

  const exportMd = async () => {
    try {
      const r = await globalApi.exportNotes()
      setMsg(`${r.count}개 노트를 ${r.dir} 에 마크다운으로 저장했어요`)
    } catch (e) { setMsg((e as Error).message) }
  }

  return (
    <div className="notes">
      <div className="notes-bar">
        <input placeholder="개념 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="stacks">
          <button className={`chip ${!stack ? 'on' : ''}`} onClick={() => setStack(null)}>전체 {notes?.length ?? 0}</button>
          {stacks.map(([s, c]) => <button key={s} className={`chip ${stack === s ? 'on' : ''}`} onClick={() => setStack(s)}>{s} {c}</button>)}
        </div>
        <button className="ghost export" onClick={exportMd} title="PRFLOW_NOTES_DIR 를 옵시디언 볼트 폴더로 지정하면 바로 노트가 돼요">마크다운으로 내보내기</button>
      </div>
      {msg && <p className="hint notes-msg">{msg}</p>}
      <div className="notes-grid">
        {shown.map((n) => (
          <article key={n.key} className="concept">
            <div className="concept-head"><h3>{n.name}</h3><span className="chip">{n.stack}</span></div>
            <p className="concept-short">{n.short}</p>
            <p>{n.body}</p>
            <div className="used-in">
              {n.seenIn.map((s) => (
                <a key={s.slug} className="link" href={`?f=${s.slug}`}>{s.title} →</a>
              ))}
            </div>
          </article>
        ))}
        {notes && shown.length === 0 && <div className="empty">아직 노트가 없어요. PR 을 분석하면 나온 개념이 여기 쌓여요.</div>}
      </div>
    </div>
  )
}

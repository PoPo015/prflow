import { useEffect, useRef, useState } from 'react'
import { Graph } from './Graph'
import { CodeView } from './CodeView'
import { sample } from './sample'

const flow = sample

export function App() {
  const order = flow.readingOrder
  const [selected, setSelected] = useState(order[0].node)
  const [tab, setTab] = useState<'code' | 'concepts'>('code')
  const [focusConcept, setFocusConcept] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const node = flow.nodes.find((n) => n.id === selected)!
  const step = order.findIndex((r) => r.node === selected)

  const select = (id: string) => {
    setSelected(id)
    setTab('code')
    panelRef.current?.scrollTo({ top: 0 })
  }
  const go = (d: number) => {
    const next = order[Math.min(order.length - 1, Math.max(0, step + d))]
    if (next) select(next.node)
  }
  const openConcept = (id: string) => {
    setFocusConcept(id)
    setTab('concepts')
  }

  // ← → 키로 읽는 순서 이동
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (tab === 'concepts' && focusConcept) {
      document.getElementById(`concept-${focusConcept}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [tab, focusConcept])

  return (
    <div className="app">
      <header className="top">
        <div className="top-title">
          <span className="repo">{flow.meta.repo} #{flow.meta.pr}</span>
          <h1>{flow.meta.title}</h1>
          <div className="stacks">{flow.meta.stacks.map((s) => <span key={s} className="chip">{s}</span>)}</div>
        </div>
        <div className="top-summary">
          <div><b>왜</b>{flow.summary.why}</div>
          <div><b>무엇을</b>{flow.summary.what}</div>
        </div>
      </header>

      <main className="main">
        <section className="graph">
          <Graph flow={flow} selected={selected} onSelect={select} />
          <div className="legend">
            <span><i className="lg-line solid" />코드로 확인</span>
            <span><i className="lg-line dashed" />추정</span>
            <span><i className="lg-dot added" />추가</span>
            <span><i className="lg-dot modified" />수정</span>
          </div>
        </section>

        <section className="panel" ref={panelRef}>
          <div className="tabs">
            <button className={tab === 'code' ? 'on' : ''} onClick={() => setTab('code')}>코드 설명</button>
            <button className={tab === 'concepts' ? 'on' : ''} onClick={() => setTab('concepts')}>개념 사전 <span className="count">{flow.concepts.length}</span></button>
          </div>

          {tab === 'code' ? (
            <div className="detail">
              <div className="detail-head">
                <h2>{node.label}</h2>
                {node.sub && <span className="muted">{node.sub}</span>}
              </div>
              {step >= 0 && <div className="why-here"><span>{step + 1}단계</span>{order[step].why}</div>}
              <p className="summary">{node.summary}</p>
              {node.code
                ? <CodeView node={node} onConcept={openConcept} />
                : <div className="empty">코드 없음 — 이번 PR 범위 밖의 구성 요소예요.</div>}
            </div>
          ) : (
            <div className="concepts">
              {flow.concepts.map((c) => (
                <article key={c.id} id={`concept-${c.id}`} className={`concept ${focusConcept === c.id ? 'is-focus' : ''}`}>
                  <div className="concept-head"><h3>{c.name}</h3><span className="chip">{c.stack}</span></div>
                  <p className="concept-short">{c.short}</p>
                  <p>{c.body}</p>
                  <div className="used-in">
                    {flow.nodes.filter((n) => n.annotations?.some((a) => a.concept === c.id)).map((n) => (
                      <button key={n.id} className="link" onClick={() => select(n.id)}>{n.label}에서 사용 →</button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="steps">
        <button className="nav" onClick={() => go(-1)} disabled={step <= 0}>←</button>
        <ol>
          {order.map((r, i) => {
            const n = flow.nodes.find((x) => x.id === r.node)!
            return (
              <li key={r.node} className={i === step ? 'on' : i < step ? 'done' : ''} onClick={() => select(r.node)}>
                <span className="num">{i + 1}</span>{n.label}
              </li>
            )
          })}
        </ol>
        <button className="nav" onClick={() => go(1)} disabled={step < 0 || step >= order.length - 1}>→</button>
      </footer>
    </div>
  )
}

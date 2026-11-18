import { useEffect, useMemo, useRef, useState } from 'react'
import { Graph } from './Graph'
import { CodeLines } from './CodeLines'
import { Explorer, type Loc } from './Explorer'
import { api as makeApi, type Thread } from './api'
import type { Flow } from './types'

export function App({ flow, flows, current }: { flow: Flow; flows: { id: string; title: string }[]; current: string }) {
  const order = flow.readingOrder
  const [selected, setSelected] = useState(order[0]?.node ?? flow.nodes[0].id)
  const [tab, setTab] = useState<'code' | 'concepts'>('code')
  const [focusConcept, setFocusConcept] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // 코드 탐색: 분석한 레포가 로컬에 있을 때만 (샘플은 없음)
  const api = useMemo(() => makeApi(current), [current])
  const [hasRepo, setHasRepo] = useState(false)
  const [mode, setMode] = useState<'flow' | 'code'>('flow')
  const [loc, setLoc] = useState<Loc | null>(null)
  const [history, setHistory] = useState<Loc[]>([])
  const [threads, setThreads] = useState<Thread[]>([])
  useEffect(() => {
    if (current === 'sample') return
    api.tree().then(() => setHasRepo(true), () => setHasRepo(false))
    api.threads().then(setThreads, () => {})
  }, [api])

  const openCode = (l: Loc) => {
    if (loc) setHistory((h) => [...h, loc])
    setLoc(l)
    setMode('code')
  }
  const back = () => {
    const prev = history[history.length - 1]
    if (!prev) return
    setHistory((h) => h.slice(0, -1))
    setLoc(prev)
  }
  const ask = async (file: string, start: number, end: number, question: string, threadId?: string) => {
    const t = await api.ask({ file, start, end, question, threadId })
    setThreads((ts) => [...ts.filter((x) => x.id !== t.id), t])
  }
  const goDefFromFlow = async (file: string, sym: string) => {
    const hits = await api.def(sym, file)
    if (hits[0]) openCode({ path: hits[0].path, line: hits[0].line })
  }

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
      if ((e.target as HTMLElement).closest('textarea, input')) return
      if (mode === 'code') {
        if ((e.metaKey || e.ctrlKey) && e.key === '[') { e.preventDefault(); back() }
        return
      }
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
          <div className="top-row">
            <span className="repo">{flow.meta.repo} #{flow.meta.pr}</span>
            {flows.length > 0 && (
              <select value={current} onChange={(e) => (location.search = `?f=${e.target.value}`)}>
                <option value="sample">샘플</option>
                {flows.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
              </select>
            )}
          </div>
          <h1>{flow.meta.title}</h1>
          <div className="modes">
            <button className={mode === 'flow' ? 'on' : ''} onClick={() => setMode('flow')}>흐름</button>
            <button className={mode === 'code' ? 'on' : ''} onClick={() => setMode('code')} disabled={!hasRepo} title={hasRepo ? '' : '분석한 PR 에서만 쓸 수 있어요'}>코드</button>
          </div>
          <div className="stacks">{flow.meta.stacks.map((s) => <span key={s} className="chip">{s}</span>)}</div>
        </div>
        <div className="top-summary">
          <div><b>왜</b>{flow.summary.why}</div>
          <div><b>무엇을</b>{flow.summary.what}</div>
        </div>
      </header>

      {mode === 'code' && hasRepo ? (
        <main className="main-code">
          <Explorer api={api} flow={flow} loc={loc} onOpen={openCode} onBack={back} canBack={history.length > 0} threads={threads} onAsk={ask} />
        </main>
      ) : (
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
              {node.code ? (
                <div className="code">
                  <div className="code-file">
                    {hasRepo
                      ? <button className="file-link" onClick={() => openCode({ path: node.code!.file, line: node.code!.startLine })}>{node.code.file} <span>전체 파일 보기 →</span></button>
                      : node.code.file}
                  </div>
                  <CodeLines
                    file={node.code.file}
                    source={node.code.source}
                    startLine={node.code.startLine}
                    changedLines={node.code.changedLines}
                    annotations={node.annotations}
                    threads={threads.filter((t) => t.file === node.code!.file && t.start >= node.code!.startLine && t.end < node.code!.startLine + node.code!.source.split('\n').length)}
                    onConcept={openConcept}
                    onDefinition={hasRepo ? (sym) => goDefFromFlow(node.code!.file, sym) : undefined}
                    onAsk={hasRepo ? (s, e, q, id) => ask(node.code!.file, s, e, q, id) : undefined}
                  />
                </div>
              ) : <div className="empty">코드 없음 — 이번 PR 범위 밖의 구성 요소예요.</div>}
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
      )}

      {mode === 'flow' && <footer className="steps">
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
      </footer>}
    </div>
  )
}

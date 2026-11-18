import { useEffect, useMemo, useState } from 'react'
import { CodeLines } from './CodeLines'
import { Usages } from './Usages'
import type { Api, DefHit, Thread, Usage } from './api'
import type { Flow } from './types'

interface Dir { name: string; path: string; dirs: Dir[]; files: string[] }

// 경로 목록 → 폴더 트리. 하위 폴더가 하나뿐인 폴더는 IntelliJ 처럼 한 줄로 합친다 (src/main/java/kr/co/...)
function buildTree(paths: string[]): Dir {
  const root: Dir = { name: '', path: '', dirs: [], files: [] }
  for (const p of paths) {
    const parts = p.split('/')
    let d = root
    for (const part of parts.slice(0, -1)) {
      let next = d.dirs.find((x) => x.name === part)
      if (!next) d.dirs.push((next = { name: part, path: d.path ? `${d.path}/${part}` : part, dirs: [], files: [] }))
      d = next
    }
    d.files.push(p)
  }
  const compact = (d: Dir): Dir => {
    d.dirs = d.dirs.map(compact).sort((a, b) => a.name.localeCompare(b.name))
    d.files.sort()
    if (d.name && d.dirs.length === 1 && d.files.length === 0) {
      const c = d.dirs[0]
      return { ...c, name: `${d.name}/${c.name}` }
    }
    return d
  }
  return compact(root)
}

export interface Loc { path: string; line?: number }

export function Explorer({ api, flow, loc, onOpen, onBack, canBack, threads, onAsk, usages, onUsages, onCloseUsages }: {
  api: Api
  flow: Flow
  loc: Loc | null
  onOpen: (l: Loc) => void
  onBack: () => void
  canBack: boolean
  threads: Thread[]
  onAsk: (file: string, start: number, end: number, q: string, threadId?: string) => Promise<void>
  usages: { sym: string; total: number; hits: Usage[] } | null
  onUsages: (sym: string) => void
  onCloseUsages: () => void
}) {
  const [files, setFiles] = useState<string[]>([])
  const [onlyChanged, setOnlyChanged] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [content, setContent] = useState<{ path: string; text: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [picker, setPicker] = useState<{ sym: string; hits: DefHit[] } | null>(null)
  const [filter, setFilter] = useState('')

  const changes = flow.changes ?? {}
  useEffect(() => { api.tree().then(setFiles, (e) => setErr(e.message)) }, [api])

  const shown = useMemo(() => {
    let list = onlyChanged ? files.filter((f) => changes[f]) : files
    if (filter) list = list.filter((f) => f.toLowerCase().includes(filter.toLowerCase()))
    return list
  }, [files, onlyChanged, filter, changes])
  const tree = useMemo(() => buildTree(shown), [shown])

  // 처음엔 변경 파일 폴더를 모두 펼친다
  useEffect(() => {
    if (onlyChanged || filter) {
      const all = new Set<string>()
      const walk = (d: Dir) => { all.add(d.path); d.dirs.forEach(walk) }
      walk(tree)
      setExpanded(all)
    }
  }, [tree])

  // 파일 열기
  useEffect(() => {
    if (!loc) return
    setErr(null)
    if (content?.path === loc.path) return
    api.file(loc.path).then((text) => setContent({ path: loc.path, text }), (e) => setErr(e.message))
    // 열린 파일의 상위 폴더 펼치기
    setExpanded((s) => {
      const next = new Set(s)
      const parts = loc.path.split('/')
      for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join('/'))
      return next
    })
  }, [loc?.path, loc?.line])

  const goDef = async (sym: string) => {
    if (!loc) return
    const hits = await api.def(sym, loc.path)
    // 후보가 하나이거나, 같은 파일 안에 정의가 하나뿐이면 바로 이동
    const sameFile = hits.filter((h) => h.path === loc.path)
    const target = hits.length === 1 ? hits[0] : sameFile.length === 1 ? sameFile[0] : null
    if (target) onOpen({ path: target.path, line: target.line })
    else setPicker({ sym, hits })
  }

  const isOpen = (p: string) => expanded.has(p)
  const renderDir = (d: Dir, depth: number) => (
    <div key={d.path || 'root'}>
      {d.name && (
        <div className="tree-row dir" style={{ paddingLeft: 8 + depth * 12 }} onClick={() => setExpanded((s) => { const n = new Set(s); n.has(d.path) ? n.delete(d.path) : n.add(d.path); return n })}>
          <span className="caret">{isOpen(d.path) ? '▾' : '▸'}</span>{d.name}
        </div>
      )}
      {(!d.name || isOpen(d.path)) && (
        <>
          {d.dirs.map((c) => renderDir(c, d.name ? depth + 1 : depth))}
          {d.files.map((f) => {
            const c = changes[f]
            return (
              <div key={f} className={`tree-row file ${loc?.path === f ? 'on' : ''}`} style={{ paddingLeft: 20 + (d.name ? depth + 1 : depth) * 12 }} onClick={() => onOpen({ path: f })}>
                <span className="fname">{f.split('/').pop()}</span>
                {c && <span className="delta">+{c.additions}{c.deletions ? ` −${c.deletions}` : ''}</span>}
              </div>
            )
          })}
        </>
      )}
    </div>
  )

  // 이 파일과 연결된 흐름 노드의 설명 주석
  const annotations = flow.nodes.filter((n) => n.code?.file === content?.path).flatMap((n) => n.annotations ?? [])

  return (
    <div className={`explorer ${usages ? 'with-usages' : ''}`}>
      <aside className="tree">
        <div className="tree-tools">
          <input placeholder="파일 찾기" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <label><input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />변경 파일만 ({Object.keys(changes).length})</label>
        </div>
        <div className="tree-list">{renderDir(tree, 0)}</div>
      </aside>

      <section className="viewer">
        <div className="viewer-bar">
          <button className="nav sm" onClick={onBack} disabled={!canBack} title="뒤로 (⌘[)">←</button>
          <span className="crumb">{loc?.path ?? '왼쪽에서 파일을 고르세요'}</span>
          <span className="hint">⌘+클릭 정의 · ⌥+클릭 사용처 · 줄 번호 클릭 AI 에게 묻기</span>
        </div>
        {err && <div className="empty">{err}</div>}
        {content && loc && content.path === loc.path && (
          <div className="viewer-body">
            <CodeLines
              file={content.path}
              source={content.text}
              changedLines={changes[content.path]?.added}
              annotations={annotations}
              threads={threads.filter((t) => t.file === content.path)}
              focusLine={loc.line}
              onDefinition={goDef}
              onUsages={onUsages}
              onAsk={(s, e, q, id) => onAsk(content.path, s, e, q, id)}
            />
          </div>
        )}
        {picker && (
          <div className="picker-backdrop" onClick={() => setPicker(null)}>
            <div className="picker" onClick={(e) => e.stopPropagation()}>
              <div className="picker-head"><code>{picker.sym}</code> {picker.hits.length ? `정의 후보 ${picker.hits.length}개` : '정의를 찾지 못했어요'}</div>
              {picker.hits.map((h, i) => (
                <button key={i} className="picker-row" onClick={() => { setPicker(null); onOpen({ path: h.path, line: h.line }) }}>
                  <span className={`kind kind-${h.kind}`}>{h.kind === 'type' ? '타입' : h.kind === 'method' ? '함수' : '파일'}</span>
                  <span className="pp">{h.path}:{h.line}</span>
                  <code>{h.text}</code>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
      {usages && <Usages {...usages} onOpen={onOpen} onClose={onCloseUsages} />}
    </div>
  )
}

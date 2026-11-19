import { Fragment, useEffect, useRef, useState } from 'react'
import { codeToTokens, type ThemedToken } from 'shiki'
import type { Annotation } from './types'
import type { Thread } from './api'
import { useNotesShown } from './NotesToggle'

const KIND_TAG: Record<Annotation['kind'], string> = { flow: '흐름', concept: '개념', caution: '주의', practice: '관례' }
const IDENT = /^[A-Za-z_$][\w$]*$/

const LANG: Record<string, string> = {
  java: 'java', kt: 'kotlin', kts: 'kotlin', ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', mjs: 'js', py: 'python',
  sql: 'sql', xml: 'xml', yml: 'yaml', yaml: 'yaml', json: 'json', md: 'markdown', gradle: 'groovy',
  properties: 'ini', sh: 'bash', html: 'html', css: 'css', go: 'go', rs: 'rust', dockerfile: 'docker',
}
export const langOf = (path: string) => {
  const name = path.split('/').pop()!.toLowerCase()
  if (name === 'dockerfile') return 'docker'
  return LANG[name.split('.').pop()!] ?? 'text'
}

// ⌘ 를 누르고 있는지 (정의로 이동 밑줄 표시용)
function useMetaKey() {
  const [down, setDown] = useState(false)
  useEffect(() => {
    const on = (e: KeyboardEvent) => setDown(e.metaKey || e.ctrlKey || e.altKey)
    const off = () => setDown(false)
    window.addEventListener('keydown', on)
    window.addEventListener('keyup', on)
    window.addEventListener('blur', off)
    return () => { window.removeEventListener('keydown', on); window.removeEventListener('keyup', on); window.removeEventListener('blur', off) }
  }, [])
  return down
}

// AI 답변: 코드 블록과 `인라인 코드`만 처리하는 최소 렌더러
function Rich({ text }: { text: string }) {
  return (
    <div className="rich">
      {text.split(/```[\w-]*\n?/).map((part, i) =>
        i % 2 === 1 ? <pre key={i}>{part.replace(/\n$/, '')}</pre> : (
          <p key={i}>{part.trim().split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((s, j) =>
            s.startsWith('`') ? <code key={j}>{s.slice(1, -1)}</code> : s.startsWith('**') ? <b key={j}>{s.slice(2, -2)}</b> : s)}</p>
        ),
      )}
    </div>
  )
}

function Composer({ placeholder, onSubmit, onCancel }: { placeholder: string; onSubmit: (q: string) => Promise<void>; onCancel?: () => void }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const send = async () => {
    if (!q.trim() || busy) return
    setBusy(true); setErr(null)
    try { await onSubmit(q.trim()); setQ('') } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="composer">
      <textarea
        autoFocus value={q} placeholder={placeholder} rows={2} disabled={busy}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); if (e.key === 'Escape') onCancel?.() }}
      />
      <div className="composer-bar">
        {busy ? <span className="thinking">AI 가 코드를 읽고 있어요…</span> : err ? <span className="err">{err}</span> : <span className="hint">⌘↵ 보내기</span>}
        {onCancel && !busy && <button className="ghost" onClick={onCancel}>취소</button>}
        <button className="primary" onClick={send} disabled={busy || !q.trim()}>AI 에게 묻기</button>
      </div>
    </div>
  )
}

function ThreadCard({ t, onReply }: { t: Thread; onReply?: (q: string) => Promise<void> }) {
  const [replying, setReplying] = useState(false)
  return (
    <div className="thread">
      <div className="thread-range">{t.start === t.end ? `${t.start}줄` : `${t.start}–${t.end}줄`}</div>
      {t.messages.map((m, i) => (
        <div key={i} className={`msg msg-${m.role}`}>
          <span className="who">{m.role === 'ai' ? 'AI' : '나'}</span>
          {m.role === 'ai' ? <Rich text={m.text} /> : <p>{m.text}</p>}
        </div>
      ))}
      {onReply && (replying
        ? <Composer placeholder="이어서 묻기" onSubmit={async (q) => { await onReply(q); setReplying(false) }} onCancel={() => setReplying(false)} />
        : <button className="link" onClick={() => setReplying(true)}>이어서 묻기</button>)}
    </div>
  )
}

export interface CodeLinesProps {
  file: string
  source: string
  startLine?: number
  changedLines?: number[]
  annotations?: Annotation[]
  threads?: Thread[]
  focusLine?: number
  onConcept?: (id: string) => void
  onDefinition?: (sym: string) => void
  onUsages?: (sym: string) => void
  onAsk?: (start: number, end: number, q: string, threadId?: string) => Promise<void>
}

export function CodeLines({ file, source, startLine = 1, changedLines, annotations, threads, focusLine, onConcept, onDefinition, onUsages, onAsk }: CodeLinesProps) {
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null)
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null)
  const hovered = useRef<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const meta = useMetaKey()
  const notesShown = useNotesShown()

  useEffect(() => {
    let alive = true
    setTokens(null)
    setSel(null)
    codeToTokens(source, { lang: langOf(file) as never, themes: { light: 'github-light-default', dark: 'github-dark-default' }, defaultColor: false }).then((r) => alive && setTokens(r.tokens), () => {})
    return () => { alive = false }
  }, [file, source])

  // AI 설명 켜기/끄기를 바꾸면 전부 펼치거나 접는다. 끈 상태에서도 점을 눌러 하나씩 볼 수 있다
  useEffect(() => {
    setOpen(new Set(notesShown ? annotations?.map((a) => a.line) : []))
  }, [file, source, notesShown])

  // 지정한 줄로 스크롤 + 잠깐 강조
  useEffect(() => {
    if (!focusLine || !tokens) return
    const el = box.current?.querySelector<HTMLElement>(`[data-ln="${focusLine}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center' })
    el.classList.add('flash')
    const t = setTimeout(() => el.classList.remove('flash'), 1600)
    return () => clearTimeout(t)
  }, [focusLine, tokens])

  // ⌘B: 마우스가 올라가 있는 심볼의 정의로
  useEffect(() => {
    if (!onDefinition) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b' && hovered.current) {
        e.preventDefault()
        onDefinition(hovered.current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDefinition])

  const byLine = new Map<number, Annotation[]>()
  annotations?.forEach((a) => byLine.set(a.line, [...(byLine.get(a.line) ?? []), a]))
  const threadsAt = new Map<number, Thread[]>()
  threads?.forEach((t) => threadsAt.set(t.end, [...(threadsAt.get(t.end) ?? []), t]))
  const changed = new Set(changedLines)
  const raw = source.split('\n')
  const lo = sel ? Math.min(sel.a, sel.b) : 0
  const hi = sel ? Math.max(sel.a, sel.b) : 0

  const clickNumber = (ln: number, shift: boolean) => {
    if (!onAsk) return
    setSel((s) => (shift && s ? { a: s.a, b: ln } : s && s.a === ln && s.b === ln ? null : { a: ln, b: ln }))
  }
  const toggle = (ln: number) => setOpen((s) => {
    const next = new Set(s)
    next.has(ln) ? next.delete(ln) : next.add(ln)
    return next
  })

  const tokenEl = (t: ThemedToken, key: number) => {
    const word = t.content.trim()
    if (!onDefinition || !IDENT.test(word)) return <span key={key} style={t.htmlStyle}>{t.content}</span>
    return (
      <span
        key={key} className="sym" style={t.htmlStyle}
        onMouseEnter={() => (hovered.current = word)}
        onMouseLeave={() => (hovered.current = null)}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) { e.preventDefault(); onDefinition(word) }
          else if (e.altKey && onUsages) { e.preventDefault(); onUsages(word) }
        }}
      >{t.content}</span>
    )
  }

  return (
    <div className={`code-body ${meta ? 'meta' : ''}`} ref={box}>
      {raw.map((text, i) => {
        const ln = startLine + i
        const notes = byLine.get(ln)
        const inSel = sel && ln >= lo && ln <= hi
        return (
          <Fragment key={ln}>
            <div data-ln={ln} className={`line ${changed.has(ln) ? 'is-changed' : ''} ${notes ? 'has-note' : ''} ${inSel ? 'is-sel' : ''}`}>
              <span className={`ln ${onAsk ? 'askable' : ''}`} title={onAsk ? '클릭: AI 에게 묻기 (Shift+클릭: 범위)' : undefined} onClick={(e) => clickNumber(ln, e.shiftKey)}>{ln}</span>
              <span className="mark">{changed.has(ln) ? '+' : ''}</span>
              <span className="src">{tokens?.[i] ? tokens[i].map(tokenEl) : text}</span>
              {notes && <button className="note-dots" onClick={() => toggle(ln)}>{notes.map((a, k) => <i key={k} className={`dot dot-${a.kind}`} />)}</button>}
            </div>
            {notes && open.has(ln) && notes.map((a, k) => (
              <div key={k} className={`note note-${a.kind}`}>
                <div className="note-head">
                  <span className="note-tag">{KIND_TAG[a.kind]}</span>
                  <span className="note-title">{a.title}</span>
                  {a.rule && <span className="note-rule">{a.rule}</span>}
                </div>
                <p>{a.body}</p>
                {a.concept && onConcept && <button className="link" onClick={() => onConcept(a.concept!)}>개념 사전에서 자세히 →</button>}
              </div>
            ))}
            {threadsAt.get(ln)?.map((t) => (
              <ThreadCard key={t.id} t={t} onReply={onAsk && ((q) => onAsk(t.start, t.end, q, t.id))} />
            ))}
            {sel && ln === hi && onAsk && (
              <div className="ask-box">
                <div className="ask-label">{lo === hi ? `${lo}줄` : `${lo}–${hi}줄`}에 대해 AI 에게 묻기</div>
                <Composer
                  placeholder="예: 여기서 동시에 두 요청이 오면 중복 처리될 수 있지 않아?"
                  onSubmit={async (q) => { await onAsk(lo, hi, q); setSel(null) }}
                  onCancel={() => setSel(null)}
                />
              </div>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}

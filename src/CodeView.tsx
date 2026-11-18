import { Fragment, useEffect, useState } from 'react'
import { codeToTokens, type ThemedToken } from 'shiki'
import type { Annotation, FlowNode } from './types'

const KIND_TAG: Record<Annotation['kind'], string> = { flow: '흐름', concept: '개념', caution: '주의' }

export function CodeView({ node, onConcept }: { node: FlowNode; onConcept: (id: string) => void }) {
  const code = node.code!
  const [lines, setLines] = useState<ThemedToken[][] | null>(null)
  const [open, setOpen] = useState<Set<number>>(new Set())

  useEffect(() => {
    let alive = true
    setLines(null)
    // 처음엔 모든 설명을 펼쳐 둔다
    setOpen(new Set(node.annotations?.map((a) => a.line)))
    codeToTokens(code.source, { lang: code.lang as never, theme: 'github-dark-default' }).then((r) => alive && setLines(r.tokens))
    return () => { alive = false }
  }, [node])

  const byLine = new Map<number, Annotation[]>()
  node.annotations?.forEach((a) => byLine.set(a.line, [...(byLine.get(a.line) ?? []), a]))
  const changed = new Set(code.changedLines)
  const raw = code.source.split('\n')

  const toggle = (ln: number) => setOpen((s) => {
    const next = new Set(s)
    next.has(ln) ? next.delete(ln) : next.add(ln)
    return next
  })

  return (
    <div className="code">
      <div className="code-file">{code.file}</div>
      <div className="code-body">
        {raw.map((text, i) => {
          const ln = code.startLine + i
          const notes = byLine.get(ln)
          return (
            <Fragment key={ln}>
              <div className={`line ${changed.has(ln) ? 'is-changed' : ''} ${notes ? 'has-note' : ''}`} onClick={() => notes && toggle(ln)}>
                <span className="ln">{ln}</span>
                <span className="mark">{changed.has(ln) ? '+' : ''}</span>
                <span className="src">
                  {lines?.[i]
                    ? lines[i].map((t, j) => <span key={j} style={{ color: t.color }}>{t.content}</span>)
                    : text}
                </span>
                {notes && <span className="note-dots">{notes.map((a, k) => <i key={k} className={`dot dot-${a.kind}`} />)}</span>}
              </div>
              {notes && open.has(ln) && notes.map((a, k) => (
                <div key={k} className={`note note-${a.kind}`}>
                  <div className="note-head">
                    <span className="note-tag">{KIND_TAG[a.kind]}</span>
                    <span className="note-title">{a.title}</span>
                  </div>
                  <p>{a.body}</p>
                  {a.concept && <button className="link" onClick={() => onConcept(a.concept!)}>개념 사전에서 자세히 →</button>}
                </div>
              ))}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

// 개념 노트: PR 마다 나온 개념을 하나의 학습 노트로 누적한다
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FLOWS, NOTES } from './paths.mjs'

const notesPath = join(NOTES, 'concepts.json')

// "@Transactional", "@transactional " → "transactional" (같은 개념 합치기용)
export const conceptKey = (name) => name.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^\p{L}\p{N}]+/gu, '')

function merge(notes, flow, slug, at) {
  for (const c of flow.concepts ?? []) {
    const key = conceptKey(c.name)
    if (!key) continue
    const n = (notes[key] ??= { key, name: c.name, stack: c.stack, short: c.short, body: c.body, seenIn: [] })
    // 설명은 가장 최근 PR 의 것으로 갱신하되, 처음 본 날짜는 유지
    Object.assign(n, { name: c.name, stack: c.stack, short: c.short, body: c.body })
    n.seenIn = n.seenIn.filter((s) => s.slug !== slug)
    n.seenIn.push({ slug, conceptId: c.id, title: `${flow.meta.repo} #${flow.meta.pr} ${flow.meta.title}`, at })
  }
  return notes
}

export function loadNotes() {
  if (existsSync(notesPath)) return JSON.parse(readFileSync(notesPath, 'utf8'))
  // 처음이면 지금까지 분석한 PR 전체에서 만든다
  let notes = {}
  if (existsSync(FLOWS)) {
    for (const f of readdirSync(FLOWS).filter((x) => /^[^.]+\.json$/.test(x) && x !== 'index.json')) {
      const flow = JSON.parse(readFileSync(join(FLOWS, f), 'utf8'))
      notes = merge(notes, flow, f.replace(/\.json$/, ''), new Date().toISOString())
    }
  }
  saveNotes(notes)
  return notes
}

const saveNotes = (notes) => {
  mkdirSync(NOTES, { recursive: true })
  writeFileSync(notesPath, JSON.stringify(notes, null, 2))
}

export function addFlowToNotes(flow, slug) {
  // 같은 PR 을 다시 분석하면 예전 결과의 개념은 지우고 새로 넣는다 (이름이 바뀐 개념이 남지 않게)
  const notes = loadNotes()
  for (const [key, n] of Object.entries(notes)) {
    n.seenIn = n.seenIn.filter((s) => s.slug !== slug)
    if (!n.seenIn.length) delete notes[key]
  }
  saveNotes(merge(notes, flow, slug, new Date().toISOString()))
}

// 개념 하나당 마크다운 파일 하나 (옵시디언 볼트 폴더를 PRFLOW_NOTES_DIR 로 지정하면 바로 노트가 된다)
export function exportNotes() {
  const dir = process.env.PRFLOW_NOTES_DIR || join(NOTES, 'md')
  mkdirSync(dir, { recursive: true })
  const notes = Object.values(loadNotes())
  for (const n of notes) {
    const file = `${n.name.replace(/[\\/:*?"<>|#^[\]]/g, '').trim() || n.key}.md`
    const md = `---
tags: [prflow, ${n.stack.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')}]
stack: ${n.stack}
---

# ${n.name}

> ${n.short}

${n.body}

## 등장한 PR
${n.seenIn.map((s) => `- ${s.title} (${s.at.slice(0, 10)})`).join('\n')}
`
    writeFileSync(join(dir, file), md)
  }
  return { dir, count: notes.length }
}

#!/usr/bin/env node
// 분석 결과 품질 점검. 사용법: npm run verify [slug ...]  (slug 생략 시 전체)
// 정의 이동 점검은 npm run dev 가 떠 있어야 한다.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FLOWS = join(ROOT, 'public', 'flows')
const DEV = 'http://localhost:4173'
const KINDS = ['ui', 'api', 'service', 'repository', 'db', 'event', 'external']

const slugs = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const all = readdirSync(FLOWS).filter((f) => f.endsWith('.json') && !/\.(threads|diagrams)\.json$/.test(f) && f !== 'index.json').map((f) => f.replace(/\.json$/, ''))
const targets = slugs.length ? slugs : all
const verbose = process.argv.includes('-v')

// 언어 표준 라이브러리·내장 객체 (레포 안에 정의가 없는 게 정상)
const STD = new Set(('toString equals hashCode stream map filter reduce forEach findFirst findAny ifPresent orElse orElseThrow subList isEmpty isPresent '
  + 'isAfter isBefore hasText hasErrors rejectValue getMessage contains startsWith endsWith toLowerCase toUpperCase format valueOf parseInt '
  + 'JSON stringify parse Number String Object Array Promise Record Partial Omit Pick Math Date Error console push slice splice includes '
  + 'nullish optional describe deepcopy append extend items keys values setdefault isinstance super').split(/\s+/))
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–')
const idents = (s) => [...new Set((s.match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) ?? []))]
const devUp = await fetch(`${DEV}/api/tree?f=x`).then(() => true, () => false)

const rows = []
for (const slug of targets) {
  const flow = JSON.parse(readFileSync(join(FLOWS, `${slug}.json`), 'utf8'))
  const work = join(homedir(), '.prflow', 'work', slug)
  const issues = []
  const ids = new Set(flow.nodes.map((n) => n.id))

  // A. 구조
  if (ids.size !== flow.nodes.length) issues.push('노드 id 중복')
  flow.nodes.filter((n) => !KINDS.includes(n.kind)).forEach((n) => issues.push(`알 수 없는 kind: ${n.kind}`))
  flow.readingOrder.filter((r) => !ids.has(r.node)).forEach((r) => issues.push(`읽는 순서에 없는 노드: ${r.node}`))
  const conceptIds = new Set(flow.concepts.map((c) => c.id))
  const anns = flow.nodes.flatMap((n) => (n.annotations ?? []).map((a) => ({ ...a, node: n })))
  anns.filter((a) => a.concept && !conceptIds.has(a.concept)).forEach((a) => issues.push(`없는 개념 연결: ${a.concept}`))
  const isolated = flow.nodes.filter((n) => !flow.edges.some((e) => e.from === n.id || e.to === n.id))
  isolated.forEach((n) => issues.push(`연결선 없는 노드: ${n.label}`))

  // B. 노드 라벨 ↔ 코드 일치 (라벨의 식별자가 코드 조각에 나오는가)
  const withCode = flow.nodes.filter((n) => n.code)
  let labelHit = 0
  for (const n of withCode) {
    const names = idents(n.label)
    if (names.some((x) => n.code.source.includes(x))) labelHit++
    else issues.push(`라벨이 코드에 안 보임: ${n.label} (${n.code.file}:${n.code.startLine})`)
    if (!existsSync(join(work, n.code.file))) issues.push(`파일 없음: ${n.code.file}`)
  }

  // C. 설명 위치: 빈 줄에 붙었는지, 설명 속 코드 식별자가 그 줄 ±2 에 있는지
  let anchorHit = 0
  let anchorChecked = 0
  for (const a of anns) {
    const lines = a.node.code.source.split('\n')
    const i = a.line - a.node.code.startLine
    if (!lines[i]?.trim()) { issues.push(`빈 줄에 붙은 설명: ${a.node.code.file}:${a.line} "${a.title}"`); continue }
    const near = lines.slice(Math.max(0, i - 2), i + 3).join('\n')
    const codey = idents(`${a.title} ${(a.body.match(/`[^`]+`/g) ?? []).join(' ')}`).filter((x) => /[A-Z_]|[a-z][A-Z]/.test(x) || a.body.includes(`\`${x}`))
    if (!codey.length) continue
    anchorChecked++
    if (codey.some((x) => near.includes(x))) anchorHit++
    else if (verbose) issues.push(`설명 위치 의심: ${a.node.code.file}:${a.line} "${a.title}" ↔ "${lines[i].trim().slice(0, 80)}"`)
  }

  // D. 변경 표시 일치
  for (const n of withCode) {
    const ch = flow.changes?.[n.code.file]
    const end = n.code.startLine + n.code.source.split('\n').length - 1
    const touched = ch?.added.some((l) => l >= n.code.startLine && l <= end)
    if (n.change === 'unchanged' && touched) issues.push(`변경 없음인데 추가된 줄 있음: ${n.label}`)
    if (n.change !== 'unchanged' && !ch) issues.push(`${n.change} 인데 PR 변경 파일 아님: ${n.label} (${n.code.file})`)
  }

  // E. verified 선의 근거: 대상 노드 라벨의 마지막 식별자가 출발 노드 코드에 나오는가
  const verified = flow.edges.filter((e) => e.status === 'verified')
  let edgeHit = 0
  for (const e of verified) {
    const from = flow.nodes.find((n) => n.id === e.from)
    const to = flow.nodes.find((n) => n.id === e.to)
    const names = idents(`${to.label} ${e.label ?? ''}`)
    if (!from.code || names.some((x) => from.code.source.includes(x))) edgeHit++
    else if (verbose) issues.push(`선 근거 약함: ${from.label} → ${to.label}`)
  }

  // F. 정의 이동: 코드 조각의 타입·호출 이름으로 /api/def 조회. 외부 라이브러리 심볼은 못 찾는 게 정상이라 제외
  let defFound = 0
  let defTried = 0
  let external = 0
  if (devUp) {
    const fileText = (f) => (existsSync(join(work, f)) ? readFileSync(join(work, f), 'utf8') : '')
    const isExternal = (sym, f) => {
      const t = fileText(f)
      if (new RegExp(`@${sym}\\b`).test(t)) return true // 애노테이션·데코레이터
      if (STD.has(sym)) return true // 언어 표준 라이브러리
      const imp = t.split('\n').find((l) => new RegExp(`^\\s*(import|from)\\b.*\\b${sym}\\b`).test(l))
      if (imp) {
        if (/^\s*import\s+(static\s+)?(java|javax|jakarta|org|com\.(fasterxml|google)|io|lombok|reactor)\./.test(imp)) return true // Java 외부 패키지
        if (/from\s+['"][^.@~/]/.test(imp) || /^\s*import\s+[^'"]*['"][^.@~/]/.test(imp)) return true // TS: 상대경로·별칭 아닌 패키지
        if (/^\s*from\s+(django|rest_framework|typing|collections|datetime|json|re|os|pydantic|fastapi|sqlalchemy|netaddr|strawberry)\b/.test(imp)) return true // Python 외부
      }
      if (new RegExp(`\\b[a-z][a-z0-9]*\\.${sym}\\s*\\(`).test(t) && /\.go$/.test(f)) {
        const pkg = t.match(new RegExp(`\\b([a-z][a-z0-9]*)\\.${sym}\\s*\\(`))?.[1]
        if (pkg && new RegExp(`"[^"]*\\b${pkg}"`).test(t) && !t.includes(`"code.gitea.io/gitea/`) ) return true
        if (pkg && ['fmt', 'strings', 'errors', 'time', 'context', 'http', 'json', 'io', 'os', 'strconv', 'sort', 'sync', 'log', 'url', 'filepath', 'bytes'].includes(pkg)) return true
      }
      return false
    }
    // 주석·문자열의 단어(Return, Render…)는 심볼이 아니므로 지운다
    const strip = (src, f) => src
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/("""|''')[\s\S]*?\1/g, '').replace(f.endsWith('.py') ? /#.*$/gm : /$^/, '')
      .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`[^`]*`/g, '""')
    const syms = [...new Set(withCode.flatMap((n) => [
      ...(strip(n.code.source, n.code.file).match(/\b[A-Z][A-Za-z0-9_]{3,}\b/g) ?? []),
      ...[...strip(n.code.source, n.code.file).matchAll(/\b([a-z][A-Za-z0-9]{3,})\s*\(/g)].map((m) => m[1]),
    ]))].filter((s) => !/^(return|this|super|print|func|function|async|await|select|where|from|string|String|List|Map|Set|Optional|Integer|Long|Boolean|Object|Promise|Error|None|True|False|self|null|void|throw|const|import|export|default|interface|class|struct|range|make|append|len|true|false|TODO|NOTE)$/.test(s)).slice(0, 20)
    for (const s of syms) {
      const from = withCode.find((n) => n.code.source.includes(s))?.code.file ?? ''
      if (isExternal(s, from)) { external++; continue }
      defTried++
      const hits = await fetch(`${DEV}/api/def?f=${slug}&sym=${encodeURIComponent(s)}&from=${encodeURIComponent(from)}`).then((r) => r.json(), () => [])
      if (Array.isArray(hits) && hits.length) defFound++
      else if (verbose) issues.push(`정의 못 찾음: ${s} (${from})`)
    }
  }

  const u = flow.meta.usage ?? {}
  rows.push({
    slug, stacks: flow.meta.stacks.join('+') || '?',
    nodes: flow.nodes.length, edges: flow.edges.length, anns: anns.length, concepts: flow.concepts.length,
    label: pct(labelHit, withCode.length), anchor: pct(anchorHit, anchorChecked), edge: pct(edgeHit, verified.length),
    def: devUp ? `${defFound}/${defTried} (외부 ${external})` : '–', dropped: flow.meta.dropped ?? 0,
    cost: u.costUsd != null ? `$${u.costUsd.toFixed(2)}` : '?', sec: u.durationMs ? Math.round(u.durationMs / 1000) : '?',
    issues,
  })
}

console.log('\nslug | 스택 | 노드 | 선 | 설명 | 개념 | 라벨↔코드 | 설명위치 | 선근거 | 정의이동 | 버림 | 비용 | 초')
for (const r of rows) console.log([r.slug, r.stacks, r.nodes, r.edges, r.anns, r.concepts, r.label, r.anchor, r.edge, r.def, r.dropped, r.cost, r.sec].join(' | '))
for (const r of rows.filter((x) => x.issues.length)) {
  console.log(`\n# ${r.slug}`)
  r.issues.forEach((i) => console.log(`  - ${i}`))
}
if (!devUp) console.log('\n(npm run dev 가 꺼져 있어 정의 이동 점검은 건너뜀)')

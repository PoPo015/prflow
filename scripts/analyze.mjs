#!/usr/bin/env node
// 사용법: npm run analyze <PR URL> [--model sonnet]
// PR 을 로컬에 펼치고 → Claude Code(headless, 읽기 전용)로 분석 → public/flows/*.json 저장
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOME = join(homedir(), '.prflow')
const MAX_DIFF = 60_000
const MAX_SNIPPET = 80

const args = process.argv.slice(2)
const url = args.find((a) => a.startsWith('http'))
const model = args.includes('--model') ? args[args.indexOf('--model') + 1] : 'sonnet'
const m = url?.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
if (!m) {
  console.error('사용법: npm run analyze https://github.com/<owner>/<repo>/pull/<번호>')
  process.exit(1)
}
const [, owner, repo, num] = m
const slug = `${owner}-${repo}-${num}`

const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts })
const log = (s) => console.log(`  ${s}`)

// ① PR 정보 + diff
const pr = JSON.parse(sh('gh', ['pr', 'view', url, '--json', 'title,body,headRefOid,baseRefName,files']))
const diff = sh('gh', ['pr', 'diff', url])
log(`✓ PR 수집: ${pr.title} (${pr.files.length}개 파일, head ${pr.headRefOid.slice(0, 7)})`)

// ② head 커밋을 로컬 worktree 로 펼침 (레포는 한 번만 clone 하고 재사용)
const repoDir = join(HOME, 'repos', owner, repo)
const workDir = join(HOME, 'work', slug)
if (!existsSync(repoDir)) {
  mkdirSync(dirname(repoDir), { recursive: true })
  sh('gh', ['repo', 'clone', `${owner}/${repo}`, repoDir, '--', '--filter=blob:none', '--no-checkout', '-q'])
}
sh('git', ['-C', repoDir, 'fetch', '-q', 'origin', `pull/${num}/head`])
if (existsSync(workDir)) {
  sh('git', ['-C', repoDir, 'worktree', 'remove', '--force', workDir])
  rmSync(workDir, { recursive: true, force: true })
}
sh('git', ['-C', repoDir, 'worktree', 'add', '-q', '--detach', workDir, pr.headRefOid])
log(`✓ 코드 준비: ${workDir}`)

// ③ 스택 감지 (파일만 보고 판단, AI 안 씀)
const stacks = []
const has = (f) => existsSync(join(workDir, f))
const read = (f) => (has(f) ? readFileSync(join(workDir, f), 'utf8') : '')
const gradle = read('build.gradle') + read('build.gradle.kts') + read('pom.xml')
if (gradle) stacks.push(gradle.includes('spring') ? 'Spring Boot' : 'Java')
if (gradle.includes('jpa')) stacks.push('JPA')
if (gradle.includes('querydsl')) stacks.push('QueryDSL')
const pkg = read('package.json')
if (pkg.includes('"next"')) stacks.push('Next.js')
else if (pkg.includes('"react"')) stacks.push('React')
if (has('pyproject.toml') || has('requirements.txt')) stacks.push('Python')
log(`✓ 스택 감지: ${stacks.join(', ') || '알 수 없음'}`)

// diff 에서 head 쪽 "추가된 줄" 번호 수집 → 화면의 + 표시용
const added = {}
let file = null
let ln = 0
for (const line of diff.split('\n')) {
  if (line.startsWith('+++ ')) { file = line.slice(6); added[file] = new Set(); continue }
  const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/)
  if (h) { ln = Number(h[1]); continue }
  if (!file || line.startsWith('---')) continue
  if (line.startsWith('+')) { added[file].add(ln); ln++ }
  else if (line.startsWith(' ')) ln++
}

// ④ AI 분석
const schema = JSON.parse(readFileSync(join(ROOT, 'scripts', 'flow.schema.json'), 'utf8'))
const fileList = pr.files.map((f) => `- ${f.path} (+${f.additions} -${f.deletions})`).join('\n')
const prompt = `너는 PR 리뷰어가 "코드 흐름을 이해하고 공부"할 수 있게 돕는 분석가다.
현재 디렉터리는 PR head 커밋의 전체 코드다. Read/Grep/Glob 으로 직접 코드를 읽고 따라가라.

# PR
제목: ${pr.title}
base: ${pr.baseRefName}
감지된 스택: ${stacks.join(', ') || '알 수 없음'}
본문:
${(pr.body || '(없음)').slice(0, 4000)}

변경 파일:
${fileList}

diff (길면 잘림):
${diff.slice(0, MAX_DIFF)}

# 할 일
1. 이 PR 이 추가·변경한 "핵심 흐름"을 찾아라. 진입점(화면/API/스케줄러/이벤트)부터 서비스 → 저장소 → DB/외부까지.
   PR 이 크면 가장 중요한 흐름 위주로 노드 6~14개로 압축한다. 변경 안 된 코드라도 흐름상 거쳐 가면 노드로 넣고 change=unchanged.
2. 각 노드의 code 는 실제 파일 경로와 줄 범위(startLine~endLine, 최대 ${MAX_SNIPPET}줄)만 적는다. 코드 본문은 프로그램이 채운다.
   줄 번호는 반드시 파일을 Read 해서 확인한 실제 번호여야 한다.
3. annotations 는 "처음 이 코드를 보는 사람"을 위한 설명이다. 코드 줄 번호(실제 파일 기준, 범위 안)에 붙인다.
   - flow: 이 줄이 전체 흐름에서 어떤 역할인지, 어디로 이어지는지
   - concept: 프레임워크·언어 문법/애노테이션이 실제로 어떻게 동작하는지 (예: 프록시, 트랜잭션, 훅)
   - caution: 리뷰 때 확인할 점 (동시성, 트랜잭션 범위, 예외, 보안, 성능)
   노드당 1~4개. 뻔한 설명은 쓰지 말고, 모르는 사람이 막힐 지점을 골라라.
4. edges.status: 호출 코드를 직접 확인했으면 verified, 추정이면 inferred.
5. readingOrder: 리뷰어가 읽을 순서와 이유. concepts: 등장한 핵심 개념 3~8개 (annotation.concept 로 연결).
6. 모든 설명은 한국어, 짧고 구체적으로. 파일을 수정하거나 명령을 실행하지 마라.`

log(`… AI 분석 중 (모델 ${model}). PR 크기에 따라 수 분 걸릴 수 있어요`)
const started = Date.now()
const raw = await new Promise((resolve, reject) => {
  const p = spawn('claude', [
    '-p',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(schema),
    '--model', model,
    '--allowedTools', 'Read', 'Grep', 'Glob',
    '--disallowedTools', 'Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Agent',
    '--permission-mode', 'default',
    '--strict-mcp-config',
    '--no-session-persistence',
  ], { cwd: workDir, stdio: ['pipe', 'pipe', 'inherit'] })
  let out = ''
  p.stdout.on('data', (d) => (out += d))
  p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`claude 종료 코드 ${code}\n${out.slice(0, 2000)}`))))
  p.stdin.end(prompt)
})
const res = JSON.parse(raw)
const ai = res.structured_output ?? JSON.parse(res.result)

// ⑤ 정리: 코드 본문은 실제 파일에서 잘라 넣고, 범위 밖 주석·없는 노드를 가리키는 선은 버린다
let dropped = 0
const ids = new Set(ai.nodes.map((n) => n.id))
for (const n of ai.nodes) {
  if (!n.code) continue
  const path = join(workDir, n.code.file)
  if (!existsSync(path)) { log(`! 파일 없음, 코드 제외: ${n.code.file}`); delete n.code; n.annotations = []; continue }
  const lines = readFileSync(path, 'utf8').split('\n')
  const start = Math.max(1, n.code.startLine)
  const end = Math.min(lines.length, n.code.endLine, start + MAX_SNIPPET - 1)
  const changed = added[n.code.file] ?? new Set()
  n.code = {
    file: n.code.file,
    lang: n.code.lang,
    startLine: start,
    source: lines.slice(start - 1, end).join('\n'),
    changedLines: [...changed].filter((l) => l >= start && l <= end),
  }
  const before = n.annotations?.length ?? 0
  n.annotations = (n.annotations ?? []).filter((a) => a.line >= start && a.line <= end)
  dropped += before - n.annotations.length
}
const edges = ai.edges.filter((e) => ids.has(e.from) && ids.has(e.to))
dropped += ai.edges.length - edges.length

const flow = {
  meta: {
    repo: `${owner}/${repo}`,
    pr: Number(num),
    title: pr.title,
    stacks,
    model,
    usage: { costUsd: res.total_cost_usd, durationMs: Date.now() - started, turns: res.num_turns, usage: res.usage },
    dropped,
  },
  summary: ai.summary,
  nodes: ai.nodes,
  edges,
  readingOrder: ai.readingOrder.filter((r) => ids.has(r.node)),
  concepts: ai.concepts,
  // 코드 탐색 화면에서 PR 변경 파일·추가된 줄을 표시하는 데 쓴다
  changes: Object.fromEntries(pr.files.map((f) => [f.path, { additions: f.additions, deletions: f.deletions, added: [...(added[f.path] ?? [])] }])),
}

// ⑥ 저장 + 목록 갱신
const outDir = join(ROOT, 'public', 'flows')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, `${slug}.json`), JSON.stringify(flow, null, 2))
const indexPath = join(outDir, 'index.json')
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')).filter((f) => f.id !== slug) : []
index.unshift({ id: slug, title: `${owner}/${repo} #${num} ${pr.title}` })
writeFileSync(indexPath, JSON.stringify(index, null, 2))

const sec = Math.round((Date.now() - started) / 1000)
log(`✓ 노드 ${flow.nodes.length} · 선 ${edges.length} · 설명 ${flow.nodes.reduce((s, n) => s + (n.annotations?.length ?? 0), 0)} · 버림 ${dropped}`)
log(`✓ 비용 $${res.total_cost_usd?.toFixed(2) ?? '?'} · ${sec}초 · ${res.num_turns}턴`)
log(`→ npm run dev 후 http://localhost:4173/?f=${slug}`)

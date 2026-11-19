// 로컬 API. vite dev 서버(vite.config.ts)와 npx 실행(bin/prflow.mjs)이 같은 핸들러를 쓴다.
// 분석한 PR 의 worktree(~/.prflow/work/<slug>)를 읽기 전용으로 노출한다.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve, sep, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FLOWS, WORK } from './paths.mjs'
import { loadNotes, exportNotes } from './notes.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAX_FILE = 1024 * 1024
const BUF = { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }

const workDir = (slug) => {
  if (!slug || !/^[\w.-]+$/.test(slug) || /^\.+$/.test(slug)) throw new Error('잘못된 f')
  const dir = join(WORK, slug)
  if (!existsSync(dir)) throw new Error('분석한 레포가 없어요')
  return dir
}

// 경로 탈출(../, 레포 밖을 가리키는 symlink) 방지
const safePath = (dir, p) => {
  const full = resolve(dir, p)
  if (!full.startsWith(dir + sep)) throw new Error('잘못된 경로')
  if (existsSync(full) && !realpathSync(full).startsWith(realpathSync(dir) + sep)) throw new Error('잘못된 경로')
  return full
}

// 다른 사이트가 로컬 API 를 부르지 못하게 (CSRF, DNS rebinding). Host 는 localhost 만, POST 는 같은 출처만
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/
const isTrusted = (req) => {
  const host = req.headers.host ?? ''
  if (!LOCAL_HOST.test(host)) return false
  return req.method !== 'POST' || req.headers.origin === `http://${host}`
}

const json = (res, body, status = 200) => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

const readBody = (req) =>
  new Promise((ok, fail) => {
    let s = ''
    req.on('data', (d) => (s += d))
    req.on('end', () => { try { ok(JSON.parse(s || '{}')) } catch (e) { fail(e) } })
  })

const threadsPath = (slug) => join(FLOWS, `${slug}.threads.json`)
const loadThreads = (slug) => (existsSync(threadsPath(slug)) ? JSON.parse(readFileSync(threadsPath(slug), 'utf8')) : [])

const grep = (dir, sym) => {
  try { return execFileSync('git', ['-C', dir, 'grep', '-n', '-w', '-I', '-e', sym], BUF) } catch { return '' } // 결과 없으면 exit 1
}
const rows = (out) => out.split('\n').map((r) => r.match(/^(.+?):(\d+):(.*)$/)).filter(Boolean).map(([, path, ln, text]) => ({ path, line: +ln, text }))

// 이 줄이 sym 의 "선언"인가. 선언이면 'type' | 'method', 아니면 null (LSP 없이 패턴으로)
function declKind(text, sym, path) {
  const typeRe = new RegExp(`\\b(class|interface|enum|record|@interface|object|trait|type|struct)\\s+${sym}\\b`)
  // function / def / fun / const x = / Go 메서드 func (r *T) Name(
  const fnRe = new RegExp(`(\\bfunction\\*?\\s+${sym}\\b|\\b(async\\s+)?def\\s+${sym}\\b|\\bfun\\s+${sym}\\b|\\b(const|let|var)\\s+${sym}\\s*[=:]|\\bfunc\\s+(\\([^)]*\\)\\s*)?${sym}\\s*[(\\[])`)
  // Java/Kotlin/C# 메서드: 반환 타입 + 이름(
  const methodRe = new RegExp(`^\\s*(@\\w+(\\([^)]*\\))?\\s+)*((public|private|protected|static|final|abstract|synchronized|default|override|open|suspend|async|export)\\s+)*[\\w<>\\[\\],.?]+\\s+${sym}\\s*\\([^;]*$`)
  // TS/JS 클래스·객체 메서드: async name(…) { / name(…): T {
  const jsMethodRe = new RegExp(`^\\s*((public|private|protected|static|async|get|set|readonly|override)\\s+)*${sym}\\s*(<[^>]*>)?\\s*\\([^)]*\\)?\\s*(:\\s*[^={;]+)?\\{?\\s*$`)
  // enum 상수: 줄이 상수 이름으로 시작 (SUCCEEDED, / SUCCEEDED("…"), / SUCCEEDED = 1)
  const enumRe = new RegExp(`^\\s*${sym}\\s*(\\(.*\\))?\\s*(,|;|=|\\{|$)`)
  // 상수·필드: static final X =, val X, readonly X, 구조 분해 const [a, setA] = / const { X } =
  const fieldRe = new RegExp(`(\\b(static|final|val|readonly)\\b[^=(]*\\b${sym}\\s*[=:;]|\\b(const|let|var)\\s*[\\[{][^=]*\\b${sym}\\b[^=]*[\\]}]\\s*=)`)
  // Go: 구조체 필드(Name string), const/var 블록(Name = …)
  const goFieldRe = new RegExp(`^\\s*${sym}(\\s*,\\s*\\w+)*\\s+([*\\[\\]\\w.{}]+)(\\s+\`.*\`)?\\s*(//.*)?$|^\\s*${sym}(\\s+[\\w.*\\[\\]]+)?\\s*=[^=]`)
  const notDecl = /^\s*(return|new|throw|else|if|while|for|case|await)\b/
  if (typeRe.test(text)) return 'type'
  if (fnRe.test(text) || (!notDecl.test(text) && (methodRe.test(text) || jsMethodRe.test(text)))) return 'method'
  if (/^[A-Z][A-Z0-9_]+$/.test(sym) && enumRe.test(text)) return 'type'
  if (!notDecl.test(text) && (fieldRe.test(text) || (path.endsWith('.go') && /^[A-Z]/.test(sym) && goFieldRe.test(text)))) return 'method'
  return null
}

const isTest = (p) => /(^|\/)(test|tests|__tests__|spec)\/|[._-](test|spec)\.\w+$|_test\.go$/.test(p)

// 정의 찾기
function findDefinition(dir, sym, from) {
  if (!/^[A-Za-z_$][\w$]*$/.test(sym)) return []
  const hits = []
  for (const r of rows(grep(dir, sym))) {
    const kind = declKind(r.text, sym, r.path)
    if (kind) hits.push({ path: r.path, line: r.line, text: r.text.trim(), kind })
  }
  // 파일 이름이 심볼과 같은 경우 (Java 클래스 등)
  if (!hits.some((h) => h.kind === 'type')) {
    const files = execFileSync('git', ['-C', dir, 'ls-files'], BUF).split('\n')
    files.filter((f) => f.split('/').pop()?.split('.')[0] === sym).forEach((f) => hits.push({ path: f, line: 1, text: f, kind: 'file' }))
  }
  // 타입 선언 > 같은 파일 > 같은 폴더 > 나머지, 테스트 코드는 뒤로
  const fromDir = from ? dirname(from) : ''
  const score = (h) =>
    (h.kind === 'type' ? 0 : h.kind === 'method' ? 10 : 5) +
    (h.path === from ? -3 : dirname(h.path) === fromDir ? -1 : 0) +
    (isTest(h.path) ? 20 : 0)
  return hits.sort((a, b) => score(a) - score(b)).slice(0, 30)
}

// 사용처 찾기: 선언·import·주석 줄을 뺀 나머지. PR 변경 파일 여부도 표시
function findUsages(dir, sym, changed) {
  if (!/^[A-Za-z_$][\w$]*$/.test(sym)) return { total: 0, hits: [] }
  const all = rows(grep(dir, sym)).filter((r) => {
    const t = r.text.trim()
    if (declKind(r.text, sym, r.path)) return false
    if (/^(import|from|package|using|require|#include)\b/.test(t) || /^(\/\/|#|\*|\/\*)/.test(t)) return false
    return true
  })
  const hits = all.map((r) => ({ path: r.path, line: r.line, text: r.text.trim().slice(0, 200), inPr: changed.has(r.path), test: isTest(r.path) }))
  // PR 밖 > PR 안, 테스트는 뒤로 — "바꿔도 다른 데 괜찮나" 가 먼저 보이게
  hits.sort((a, b) => (a.test - b.test) || (a.inPr - b.inPr) || a.path.localeCompare(b.path) || a.line - b.line)
  return { total: hits.length, hits: hits.slice(0, 300) }
}

// AI 에게 묻기: 해당 레포에서 Claude Code 를 읽기 전용으로 실행
function ask(dir, slug, t) {
  const flowPath = join(FLOWS, `${slug}.json`)
  const flow = existsSync(flowPath) ? JSON.parse(readFileSync(flowPath, 'utf8')) : null
  const lines = readFileSync(safePath(dir, t.file), 'utf8').split('\n')
  const snippet = lines.slice(t.start - 1, t.end).map((l, i) => `${t.start + i}: ${l}`).join('\n')
  const history = t.messages.slice(0, -1).map((m) => `${m.role === 'user' ? '질문' : '답변'}: ${m.text}`).join('\n\n')
  const prompt = `너는 PR 리뷰를 돕는 시니어 개발자다. 현재 디렉터리는 PR head 커밋의 전체 코드다.
필요하면 Read/Grep/Glob 으로 호출하는 쪽·호출되는 쪽·설정을 직접 확인한 뒤 답해라. 추측이면 추측이라고 말해라.

PR: ${flow?.meta?.title ?? ''}
PR 요약: ${flow?.summary?.what ?? ''}

리뷰어가 보고 있는 코드 (${t.file}):
\`\`\`
${snippet}
\`\`\`
${history ? `\n지금까지 대화:\n${history}\n` : ''}
리뷰어 질문: ${t.messages[t.messages.length - 1].text}

답변 규칙(다른 형식 지시보다 우선): PR 코드 리뷰 코멘트로 쓴다. 한국어, 결론 먼저, 짧게(10줄 안팎). 끝에 선택지·되묻는 질문을 붙이지 마라. 근거가 되는 코드는 파일:줄 로 짚어라. 실제로 문제가 될 조건(언제·어떤 입력에서)을 구체적으로. 코드 수정은 하지 마라.`
  return new Promise((ok, fail) => {
    const p = spawn('claude', [
      '-p', '--output-format', 'json', '--model', 'sonnet',
      '--allowedTools', 'Read', 'Grep', 'Glob',
      '--disallowedTools', 'Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Agent',
      '--permission-mode', 'default', '--strict-mcp-config', '--no-session-persistence',
      '--setting-sources', 'user', // 대상 레포의 .claude/settings.json(hooks 등)을 읽지 않는다
    ], { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => {
      if (code !== 0) return fail(new Error(`claude 종료 코드 ${code}: ${err.slice(0, 500)}`))
      const r = JSON.parse(out)
      ok({ text: r.result, costUsd: r.total_cost_usd })
    })
    p.stdin.end(prompt)
  })
}

// 화면에서 시작한 분석 작업. 한 번에 하나만 돌린다
let job = null
function startAnalyze(url) {
  if (job?.status === 'running') throw new Error('이미 분석 중인 PR 이 있어요')
  const m = url?.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!m) throw new Error('GitHub PR 링크가 아니에요 (https://github.com/<owner>/<repo>/pull/<번호>)')
  const slug = `${m[1]}-${m[2]}-${m[3]}`
  job = { id: Date.now().toString(36), url, slug, status: 'running', log: [], startedAt: Date.now() }
  const cur = job
  const p = spawn(process.execPath, [join(ROOT, 'scripts', 'analyze.mjs'), url], { stdio: ['ignore', 'pipe', 'pipe'] })
  const push = (d) => d.toString().split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => cur.log.push(l))
  p.stdout.on('data', push)
  p.stderr.on('data', push)
  p.on('close', (code) => { cur.status = code === 0 ? 'done' : 'failed'; cur.endedAt = Date.now() })
  return job
}

// /api/* 요청 처리. url 은 /api 를 뗀 경로
export async function handleApi(req, res) {
  const u = new URL(req.url ?? '/', 'http://x')
  if (!isTrusted(req)) return json(res, { error: 'forbidden' }, 403)
  try {
    // 레포와 상관없는 요청
    if (u.pathname === '/analyze' && req.method === 'POST') return json(res, startAnalyze((await readBody(req)).url))
    if (u.pathname === '/job') return json(res, job && job.id === u.searchParams.get('id') ? job : null)
    if (u.pathname === '/notes') return json(res, Object.values(loadNotes()).sort((a, b) => b.seenIn.length - a.seenIn.length || a.name.localeCompare(b.name)))
    if (u.pathname === '/notes/export' && req.method === 'POST') return json(res, exportNotes())

    const slug = u.searchParams.get('f')
    const dir = workDir(slug)
    if (u.pathname === '/tree') return json(res, execFileSync('git', ['-C', dir, 'ls-files'], BUF).split('\n').filter(Boolean))
    if (u.pathname === '/file') {
      const full = safePath(dir, u.searchParams.get('path') ?? '')
      if (statSync(full).size > MAX_FILE) return json(res, { error: '파일이 너무 커요 (1MB 초과)' }, 413)
      return json(res, { content: readFileSync(full, 'utf8') })
    }
    if (u.pathname === '/def') return json(res, findDefinition(dir, u.searchParams.get('sym') ?? '', u.searchParams.get('from')))
    if (u.pathname === '/refs') {
      const flowPath = join(FLOWS, `${slug}.json`)
      const changed = new Set(existsSync(flowPath) ? Object.keys(JSON.parse(readFileSync(flowPath, 'utf8')).changes ?? {}) : [])
      return json(res, findUsages(dir, u.searchParams.get('sym') ?? '', changed))
    }
    if (u.pathname === '/threads') return json(res, loadThreads(slug))
    if (u.pathname === '/ask' && req.method === 'POST') {
      const b = await readBody(req)
      const threads = loadThreads(slug)
      let t = threads.find((x) => x.id === b.threadId)
      if (!t) {
        safePath(dir, b.file)
        t = { id: `t${Date.now()}`, file: b.file, start: b.start, end: b.end, messages: [] }
        threads.push(t)
      }
      t.messages.push({ role: 'user', text: b.question, at: new Date().toISOString() })
      const a = await ask(dir, slug, t)
      t.messages.push({ role: 'ai', text: a.text, at: new Date().toISOString(), costUsd: a.costUsd })
      writeFileSync(threadsPath(slug), JSON.stringify(threads, null, 2))
      return json(res, t)
    }
    json(res, { error: 'not found' }, 404)
  } catch (e) {
    json(res, { error: e.message }, 400)
  }
}

// /flows/* : ~/.prflow/flows 의 분석 결과 JSON 을 내려준다
export function handleFlows(req, res) {
  if (!isTrusted(req)) return json(res, { error: 'forbidden' }, 403)
  const name = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname.replace(/^\//, ''))
  if (!/^[\w.-]+\.json$/.test(name) || extname(name) !== '.json') return json(res, { error: 'not found' }, 404)
  const path = join(FLOWS, name)
  if (!existsSync(path)) return json(res, name === 'index.json' ? [] : { error: 'not found' }, name === 'index.json' ? 200 : 404)
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(readFileSync(path))
}

// vite dev 서버에 붙는 로컬 API. 분석한 PR 의 worktree(~/.prflow/work/<slug>)를 읽기 전용으로 노출한다.
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve, sep, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WORK = join(homedir(), '.prflow', 'work')
const MAX_FILE = 1024 * 1024

export interface DefHit { path: string; line: number; text: string; kind: 'type' | 'method' | 'file' }
interface Msg { role: 'user' | 'ai'; text: string; at: string; costUsd?: number }
export interface Thread { id: string; file: string; start: number; end: number; messages: Msg[] }

const workDir = (slug: string | null) => {
  if (!slug || !/^[\w.-]+$/.test(slug)) throw new Error('잘못된 f')
  const dir = join(WORK, slug)
  if (!existsSync(dir)) throw new Error('분석한 레포가 없어요')
  return dir
}

// 경로 탈출(../) 방지
const safePath = (dir: string, p: string) => {
  const full = resolve(dir, p)
  if (!full.startsWith(dir + sep)) throw new Error('잘못된 경로')
  return full
}

const json = (res: ServerResponse, body: unknown, status = 200) => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

const readBody = (req: IncomingMessage) =>
  new Promise<any>((ok, fail) => {
    let s = ''
    req.on('data', (d) => (s += d))
    req.on('end', () => { try { ok(JSON.parse(s)) } catch (e) { fail(e) } })
  })

const threadsPath = (slug: string) => join(ROOT, 'public', 'flows', `${slug}.threads.json`)
const loadThreads = (slug: string): Thread[] => (existsSync(threadsPath(slug)) ? JSON.parse(readFileSync(threadsPath(slug), 'utf8')) : [])

// 정의 찾기: git grep 으로 이름이 나오는 줄을 모은 뒤, "선언처럼 생긴 줄"만 남긴다 (LSP 없이 가볍게)
function findDefinition(dir: string, sym: string, from: string | null): DefHit[] {
  if (!/^[A-Za-z_$][\w$]*$/.test(sym)) return []
  let out = ''
  try {
    out = execFileSync('git', ['-C', dir, 'grep', '-n', '-w', '-I', '-e', sym], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  } catch { return [] } // 결과 없으면 exit 1
  const typeRe = new RegExp(`\\b(class|interface|enum|record|@interface|object|trait|type|struct)\\s+${sym}\\b`)
  const fnRe = new RegExp(`(\\bfunction\\s+${sym}\\b|\\bdef\\s+${sym}\\b|\\bfun\\s+${sym}\\b|\\b(const|let|var)\\s+${sym}\\s*=)`)
  const methodRe = new RegExp(`^\\s*(@\\w+(\\([^)]*\\))?\\s+)*((public|private|protected|static|final|abstract|synchronized|default|override|open|suspend|async|export)\\s+)*[\\w<>\\[\\],.?]+\\s+${sym}\\s*\\([^;]*$`)
  const notDecl = /^\s*(return|new|throw|else|if|while|for|case)\b/
  const hits: DefHit[] = []
  for (const row of out.split('\n')) {
    const m = row.match(/^(.+?):(\d+):(.*)$/)
    if (!m) continue
    const [, path, ln, text] = m
    if (typeRe.test(text)) hits.push({ path, line: +ln, text: text.trim(), kind: 'type' })
    else if (fnRe.test(text) || (methodRe.test(text) && !notDecl.test(text))) hits.push({ path, line: +ln, text: text.trim(), kind: 'method' })
  }
  // 파일 이름이 심볼과 같은 경우 (Java 클래스 등)
  if (!hits.some((h) => h.kind === 'type')) {
    const files = execFileSync('git', ['-C', dir, 'ls-files'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).split('\n')
    files.filter((f) => f.split('/').pop()?.split('.')[0] === sym).forEach((f) => hits.push({ path: f, line: 1, text: f, kind: 'file' }))
  }
  // 타입 선언 > 같은 파일 > 같은 폴더 > 나머지, 테스트 코드는 뒤로
  const fromDir = from ? dirname(from) : ''
  const score = (h: DefHit) =>
    (h.kind === 'type' ? 0 : h.kind === 'method' ? 10 : 5) +
    (h.path === from ? -3 : dirname(h.path) === fromDir ? -1 : 0) +
    (/(^|\/)(test|tests|__tests__)\//.test(h.path) ? 20 : 0)
  return hits.sort((a, b) => score(a) - score(b)).slice(0, 30)
}

// AI 에게 묻기: 해당 레포에서 Claude Code 를 읽기 전용으로 실행
function ask(dir: string, slug: string, t: Thread): Promise<{ text: string; costUsd?: number }> {
  const flowPath = join(ROOT, 'public', 'flows', `${slug}.json`)
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

export function prflowApi(): Plugin {
  return {
    name: 'prflow-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        const u = new URL(req.url ?? '/', 'http://x')
        const slug = u.searchParams.get('f')
        try {
          const dir = workDir(slug)
          if (u.pathname === '/tree') {
            const files = execFileSync('git', ['-C', dir, 'ls-files'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).split('\n').filter(Boolean)
            return json(res, files)
          }
          if (u.pathname === '/file') {
            const full = safePath(dir, u.searchParams.get('path') ?? '')
            if (statSync(full).size > MAX_FILE) return json(res, { error: '파일이 너무 커요 (1MB 초과)' }, 413)
            return json(res, { content: readFileSync(full, 'utf8') })
          }
          if (u.pathname === '/def') {
            return json(res, findDefinition(dir, u.searchParams.get('sym') ?? '', u.searchParams.get('from')))
          }
          if (u.pathname === '/threads') return json(res, loadThreads(slug!))
          if (u.pathname === '/ask' && req.method === 'POST') {
            const b = await readBody(req)
            const threads = loadThreads(slug!)
            let t = threads.find((x) => x.id === b.threadId)
            if (!t) {
              safePath(dir, b.file)
              t = { id: `t${Date.now()}`, file: b.file, start: b.start, end: b.end, messages: [] }
              threads.push(t)
            }
            t.messages.push({ role: 'user', text: b.question, at: new Date().toISOString() })
            const a = await ask(dir, slug!, t)
            t.messages.push({ role: 'ai', text: a.text, at: new Date().toISOString(), costUsd: a.costUsd })
            writeFileSync(threadsPath(slug!), JSON.stringify(threads, null, 2))
            return json(res, t)
          }
          json(res, { error: 'not found' }, 404)
        } catch (e) {
          json(res, { error: (e as Error).message }, 400)
        }
      })
    },
  }
}

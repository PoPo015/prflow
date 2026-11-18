#!/usr/bin/env node
// npx prflow                → 화면 열기
// npx prflow <PR URL>       → 분석 후 화면 열기
// npx prflow doctor         → 도구·로그인 점검
import { createServer } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi, handleFlows } from '../server/api.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const PORT = Number(process.env.PRFLOW_PORT || 4173)
const arg = process.argv[2]

if (arg === 'doctor') {
  process.exit(spawnSync(process.execPath, [join(ROOT, 'scripts', 'doctor.mjs')], { stdio: 'inherit' }).status ?? 1)
}
if (arg === '-h' || arg === '--help') {
  console.log('사용법: prflow [PR URL]   |   prflow doctor')
  process.exit(0)
}

let slug = null
if (arg?.startsWith('http')) {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'analyze.mjs'), arg], { stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
  const m = arg.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  slug = m && `${m[1]}-${m[2]}-${m[3]}`
}

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('화면 빌드(dist)가 없어요. 레포에서 실행 중이라면 npm run build 를 먼저 하거나 npm run dev 를 쓰세요.')
  process.exit(1)
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm', '.woff2': 'font/woff2' }

const server = createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname
  if (path.startsWith('/api/')) { req.url = req.url.slice(4); return handleApi(req, res) }
  if (path.startsWith('/flows/')) { req.url = req.url.slice(6); return handleFlows(req, res) }
  // 정적 파일, 없으면 index.html (SPA)
  const file = resolve(DIST, '.' + decodeURIComponent(path))
  const target = file.startsWith(DIST + sep) && existsSync(file) && extname(file) ? file : join(DIST, 'index.html')
  res.setHeader('content-type', TYPES[extname(target)] ?? 'application/octet-stream')
  res.end(readFileSync(target))
})

// 로컬에서만 접속 가능하게 127.0.0.1 에만 연다
server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}/${slug ? `?f=${slug}` : ''}`
  console.log(`\n  prflow → ${url}\n  (종료: Ctrl+C)`)
  if (process.env.PRFLOW_NO_OPEN) return
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  spawn(opener, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref()
})
server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `포트 ${PORT} 가 사용 중이에요. PRFLOW_PORT=4180 npx prflow 처럼 다른 포트를 지정하세요.` : e.message)
  process.exit(1)
})

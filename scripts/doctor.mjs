#!/usr/bin/env node
// 실행에 필요한 도구와 로그인 상태를 점검한다. npm run doctor, 그리고 analyze 시작 때 자동 실행.
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const run = (cmd, args) => {
  try { return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } }
  catch (e) { return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}`, missing: e.code === 'ENOENT' } }
}

export function doctor({ quiet = false } = {}) {
  const checks = []
  const major = Number(process.versions.node.split('.')[0])
  checks.push({ name: 'Node.js 20+', ok: major >= 20, fix: 'https://nodejs.org 에서 20 이상 설치' })

  const git = run('git', ['--version'])
  checks.push({ name: 'git', ok: git.ok, fix: 'git 설치' })

  const gh = run('gh', ['--version'])
  checks.push({ name: 'GitHub CLI (gh)', ok: gh.ok, fix: 'https://cli.github.com 에서 설치' })
  if (gh.ok) {
    const auth = run('gh', ['auth', 'status'])
    checks.push({ name: 'gh 로그인', ok: auth.ok, fix: 'gh auth login 실행 (비공개 레포는 접근 권한이 있는 계정으로)' })
  }

  const claude = run('claude', ['--version'])
  checks.push({ name: 'Claude Code (claude)', ok: claude.ok, fix: 'https://docs.anthropic.com/en/docs/claude-code 에서 설치 후 claude 실행해 로그인' })

  if (!quiet || checks.some((c) => !c.ok)) {
    for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : `  → ${c.fix}`}`)
  }
  return checks.every((c) => c.ok)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ok = doctor()
  console.log(ok ? '\n  준비 완료. Claude 로그인은 첫 분석 때 확인돼요.' : '\n  ✗ 표시된 항목을 먼저 해결해 주세요.')
  process.exit(ok ? 0 : 1)
}

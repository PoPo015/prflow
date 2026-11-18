// 프레임워크별 규칙(기본 개념·베스트 프랙티스·자주 하는 실수)을 감지된 스택에 맞게 불러온다.
// 기본 규칙: 레포의 rules/<name>.md
// 내 규칙:   ~/.prflow/rules/<name>.md (같은 이름이면 기본 규칙 뒤에 덧붙임), ~/.prflow/rules/common.md (항상)
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HOME } from './paths.mjs'

const BUILTIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'rules')
const LOCAL = join(HOME, 'rules')

// 감지된 스택 → 규칙 파일 이름
const STACK_RULES = {
  'Spring Boot': ['spring'], Java: [], JPA: ['jpa'], QueryDSL: ['jpa'],
  'Next.js': ['nextjs', 'react'], React: ['react'], TypeScript: ['typescript'],
  Django: ['django', 'python'], FastAPI: ['python'], Python: ['python'], Go: ['go'],
}

const read = (dir, name) => {
  const p = join(dir, `${name}.md`)
  return existsSync(p) ? readFileSync(p, 'utf8') : ''
}

// "- [di] …" → "- [spring/di] …" 로 바꿔 규칙 id 를 파일 이름까지 포함한 전역 id 로
const qualify = (name, text) => text.replace(/^(\s*-\s*)\[([\w-]+)\]/gm, `$1[${name}/$2]`)

export function loadRules(stacks) {
  const names = [...new Set(stacks.flatMap((s) => STACK_RULES[s] ?? []))]
  // 내 규칙 폴더에만 있는 파일도 스택 이름과 맞으면 쓴다 (예: ~/.prflow/rules/kotlin.md)
  if (existsSync(LOCAL)) {
    for (const f of readdirSync(LOCAL).filter((x) => x.endsWith('.md'))) {
      const n = f.replace(/\.md$/, '')
      if (n !== 'common' && stacks.some((s) => s.toLowerCase().replace(/[^a-z0-9]/g, '') === n) && !names.includes(n)) names.push(n)
    }
  }
  const parts = []
  for (const n of names) {
    const text = [read(BUILTIN, n), read(LOCAL, n) && `\n### 팀 규칙\n${read(LOCAL, n)}`].filter(Boolean).join('\n')
    if (text) parts.push(qualify(n, text))
  }
  const common = read(LOCAL, 'common')
  if (common) parts.push(qualify('team', `# 팀 공통 규칙\n${common}`))
  const text = parts.join('\n\n')
  const ids = new Set([...text.matchAll(/^\s*-\s*\[([\w-]+\/[\w-]+)\]/gm)].map((m) => m[1]))
  return { names: [...names, ...(common ? ['team'] : [])], text, ids }
}

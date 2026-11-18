#!/usr/bin/env node
// 회귀 테스트: 공개 레포 PR 8개(언어별 2개)를 다시 분석하고 verify 로 점검한다.
// 사용법: npm run e2e [-- --only java,go]   (약 $2·7분, 내 Claude 사용량 사용)
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CASES = {
  java: ['https://github.com/spring-projects/spring-petclinic/pull/2573', 'https://github.com/apache/fineract/pull/6880'],
  ts: ['https://github.com/vercel/commerce/pull/1364', 'https://github.com/dubinc/dub/pull/4773'],
  python: ['https://github.com/netbox-community/netbox/pull/23726', 'https://github.com/netbox-community/netbox/pull/23672'],
  go: ['https://github.com/go-gitea/gitea/pull/40420', 'https://github.com/go-gitea/gitea/pull/40397'],
}

const onlyArg = process.argv.indexOf('--only')
const langs = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : Object.keys(CASES)
const urls = langs.flatMap((l) => CASES[l] ?? [])
const slugs = urls.map((u) => u.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/).slice(1).join('-'))

const failed = []
for (const url of urls) {
  console.log(`\n### ${url}`)
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'analyze.mjs'), url], { stdio: 'inherit' })
  if (r.status !== 0) failed.push(url)
}
console.log('\n### verify')
spawnSync(process.execPath, [join(ROOT, 'scripts', 'verify.mjs'), ...slugs, '-v'], { stdio: 'inherit' })
if (failed.length) {
  console.log(`\n✗ 분석 실패 ${failed.length}건:\n${failed.join('\n')}`)
  process.exit(1)
}

// 데이터는 모두 ~/.prflow 아래에 둔다 (npx 로 실행해도 유지되고, 대상 코드가 레포 폴더에 남지 않도록)
import { homedir } from 'node:os'
import { join } from 'node:path'

export const HOME = process.env.PRFLOW_HOME || join(homedir(), '.prflow')
export const FLOWS = join(HOME, 'flows') // 분석 결과 <slug>.json, 질문 기록 <slug>.threads.json
export const WORK = join(HOME, 'work') // PR head 커밋 worktree
export const REPOS = join(HOME, 'repos') // 레포 clone (재사용)
export const NOTES = join(HOME, 'notes') // 개념 노트

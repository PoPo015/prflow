// flow.json 형식. AI 엔진이 만들고 화면이 읽는다.

export type NodeKind = 'ui' | 'api' | 'service' | 'repository' | 'db' | 'event' | 'external'
export type Change = 'added' | 'modified' | 'unchanged'

// 코드 줄에 붙는 설명. 공부용 핵심 기능.
export interface Annotation {
  line: number // code.startLine 기준 실제 줄 번호
  kind: 'flow' | 'concept' | 'caution'
  title: string
  body: string
  concept?: string // concepts[].id 로 연결
}

export interface FlowNode {
  id: string
  kind: NodeKind
  label: string
  sub?: string // 파일명 등 보조 표시
  change: Change
  summary: string // 이 노드가 하는 일 한 줄
  code?: {
    file: string
    lang: string
    startLine: number
    source: string
    changedLines?: number[]
  }
  annotations?: Annotation[]
}

export interface FlowEdge {
  from: string
  to: string
  label?: string
  status: 'verified' | 'inferred'
}

export interface Concept {
  id: string
  name: string
  stack: string
  short: string // 한 줄 정의
  body: string // 어떻게 동작하는지
}

export interface Flow {
  meta: { repo: string; pr: number; title: string; stacks: string[]; model?: string }
  summary: { why: string; what: string }
  nodes: FlowNode[]
  edges: FlowEdge[]
  readingOrder: { node: string; why: string }[]
  concepts: Concept[]
  changes?: Record<string, { additions: number; deletions: number; added: number[] }>
}

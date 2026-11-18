# prflow 설계 문서 (v0.1 초안)

> PR을 diff 순서가 아니라 **실행 흐름 순서**로 읽게 해 주는 리뷰 보조 도구.
> 작성일: 2026-11-19 · 상태: 초안 (MVP 착수 전)

---

## 1. 문제

- GitHub PR 화면은 파일을 알파벳순으로, 바뀐 줄만 보여준다.
- 그래서 리뷰어는 "이 변경이 어느 흐름의 어디에 끼어드는지"를 머릿속으로 다시 조립해야 한다.
- 결과적으로 큰 흐름을 놓치고, 피드백도 바뀐 줄 단위로만 나온다.

## 1-1. 방향 (2026-11-19 갱신)

- **가볍게, 바이브 코딩으로.** 모노레포 대신 Vite 앱 하나(`src/`)로 시작. 엄격한 근거 검증은 나중에.
- **두 가지 목적**
  1. PR 로 흐름을 파악한다 → 흐름 그래프 + 읽는 순서
  2. 처음 보는 코드·문법을 공부한다 → 코드 줄마다 붙는 **설명 주석**(흐름 / 개념 / 주의) + **개념 사전**
- flow.json 에 `annotations`(줄 단위 설명)와 `concepts`(개념 사전)를 추가. 실제 형식은 `src/types.ts` 가 기준.

## 2. 목표 / 비목표

**목표**
- PR 하나를 넣으면 **변경 지점이 표시된 흐름 그래프** + **읽는 순서**를 보여준다.
- 기술 스택은 AI가 알아서 따라간다. 단, 그래프의 모든 선은 **코드 근거로 검증**해서 확인된 선과 추정한 선을 구분해 보여준다.
- 서버 없이 로컬에서 돌아간다.

**비목표 (MVP 범위 밖)**
- 버그 찾기·리뷰 코멘트 자동 작성 (리뷰는 사람이 한다. 이 도구는 *읽기*를 돕는다)
- 호스팅 웹 서비스, GitHub에 쓰기(코멘트 달기)
- 모든 언어에서 정적 분석 수준의 정확도

## 3. 사용 흐름

```
$ npx prflow https://github.com/org/repo/pull/1234
  ✓ PR 수집 (head a1b2c3d)
  ✓ 스택 감지: Spring Boot (Gradle), Next.js
  ✓ AI 분석 중... 노드 14 · 선 19
  ✓ 근거 검증: 확인 16 · 추정 3 · 버림 2
  ✓ 비용 $0.xx · 1m 42s
  → http://localhost:4173 열림
```

같은 PR(같은 head 커밋)을 다시 열면 캐시를 써서 AI를 다시 호출하지 않는다.

## 4. 아키텍처

```
packages/
  core/    PR 수집 → 스택 감지 → AI 분석 → 근거 검증 → flow.json
  viewer/  flow.json → 그래프 + 코드 패널 (정적 React 앱)
  cli/     npx prflow <PR URL>  (core 실행 → viewer 띄움)
```

파이프라인:

```
PR URL
 └─① 수집     gh로 메타·diff 조회 + git worktree로 head 커밋 전체 코드 펼침
 └─② 스택감지  package.json / build.gradle / pom.xml / pyproject.toml 파일로 판단 (AI 안 씀)
 └─③ AI 분석   Claude Agent SDK 에이전트가 변경 지점부터 위아래로 따라가며 노드·선·근거 작성
 └─④ 근거검증  선마다 file:line을 실제 코드와 대조 → verified / inferred / 버림
 └─⑤ 출력     flow.json 저장(캐시) → viewer가 읽어서 렌더
```

| 역할 | 선택 |
|---|---|
| 언어 | TypeScript (Node 20+) |
| 분석 엔진 | `@anthropic-ai/claude-agent-sdk` |
| PR 수집 | `gh` CLI + `git worktree` |
| 그래프 | React + `@xyflow/react` (React Flow) + `elkjs` 자동 배치 |
| 코드 패널 | Monaco diff editor |
| 빌드 | Vite, pnpm workspace |

## 5. flow.json (핵심 계약)

엔진과 화면은 이 형식으로만 연결된다. 이 형식이 고정되면 둘을 독립적으로 바꿀 수 있다.

```jsonc
{
  "version": 1,
  "meta": {
    "repo": "org/repo", "pr": 1234,
    "baseSha": "…", "headSha": "…",
    "title": "…",
    "stacks": ["spring-boot", "nextjs"],
    "model": "claude-sonnet-5-5",
    "usage": { "inputTokens": 0, "outputTokens": 0, "costUsd": 0 },
    "generatedAt": "2026-11-19T00:00:00Z"
  },
  "summary": {
    "why": "이 PR이 왜 필요한지 한두 문장",
    "what": "무엇이 바뀌는지 한두 문장"
  },
  "nodes": [
    {
      "id": "n1",
      "kind": "ui | route | api | service | repository | db | job | module | external",
      "label": "UserController.signUp",
      "file": "src/main/java/.../UserController.java",
      "range": [42, 71],
      "change": "added | modified | deleted | unchanged",
      "note": "이 노드에서 무엇이 바뀌었는지 한 줄"
    }
  ],
  "edges": [
    {
      "id": "e1", "from": "n1", "to": "n2",
      "kind": "call | http | db | event | import",
      "evidence": { "file": "…/UserController.java", "line": 58, "snippet": "userService.register(req)" },
      "status": "verified | inferred"
    }
  ],
  "readingOrder": [
    { "node": "n1", "why": "요청 진입점. 여기서 시작" },
    { "node": "n2", "why": "핵심 변경. 검증 로직 추가" }
  ],
  "questions": [
    { "node": "n2", "text": "중복 가입 시 예외가 트랜잭션 밖에서 터지지 않는지?" }
  ]
}
```

## 6. AI 분석 엔진

**도구 제한 (보안)**
- 에이전트에게는 `Read`, `Grep`, `Glob`만 허용한다. Bash·쓰기·네트워크는 막는다.
- 이유: 분석 대상은 남이 쓴 코드다. 코드 주석에 숨겨진 지시(프롬프트 인젝션)가 있어도 읽기 외에는 아무것도 할 수 없게 만든다.

**탐색 범위 (비용 상한)**
- 시작점: diff에서 바뀐 함수·클래스
- 호출하는 쪽(위)으로 2단계, 호출되는 쪽(아래)으로 3단계까지만 따라간다
- 읽는 파일 수와 토큰에 상한을 두고, 넘으면 그 지점에서 멈추고 `external` 노드로 표시한다

**프롬프트 전략**
- 감지한 스택을 힌트로 준다 (예: "Spring이면 Controller → Service → Repository 순, Next.js면 page/route handler → fetch → API 순으로 진입점을 찾아라")
- 출력은 flow.json의 nodes/edges/readingOrder/questions를 구조화 출력으로 받는다
- **모든 선에 `evidence`(file, line, snippet)를 필수로 요구한다**

**모델**
- 기본값 `claude-sonnet-5-5`, 옵션으로 변경 가능
- 실제 PR로 비용을 잰 뒤 기본값을 다시 정한다

## 7. 근거 검증 규칙

AI가 만든 선마다 프로그램이 확인한다 (AI가 판단하지 않는다).

| 조건 | 결과 |
|---|---|
| evidence 없음 / 파일 없음 / 줄 번호가 범위 밖 | **버림** |
| 해당 줄 ±2줄 안에 대상 노드의 심볼 이름(메서드·함수명)이 있음 | **verified** (실선) |
| `http` 선: 프론트의 요청 URL과 백엔드 라우트가 정규화 후 일치 | **verified** (실선) |
| 파일·줄은 맞지만 심볼이 안 보임 | **inferred** (점선) |

버린 선의 개수는 meta에 기록해서 AI가 얼마나 지어냈는지 추적한다.

## 8. 화면

```
┌─ 요약: why / what ─────────────────────────────────────────┐
├────────────────────────┬───────────────────────────────────┤
│ 흐름 그래프              │ 선택한 노드                          │
│  [화면] ─→ [API]        │  note: 무엇이 바뀌었나                │
│            ↓           │  ┌ Monaco diff ─────────────────┐  │
│         [Service ★]    │  │ 변경 + 주변 코드                │  │
│            ↓           │  └──────────────────────────────┘  │
│         [DB]           │  질문: 트랜잭션 범위 괜찮은지?          │
│ 실선=확인 · 점선=추정      │  읽는 순서 2/5   [← 이전] [다음 →]    │
└────────────────────────┴───────────────────────────────────┘
```

- 노드 색: 추가(초록) / 수정(주황) / 삭제(빨강) / 변경 없음(회색)
- 선을 클릭하면 evidence 위치로 코드 패널이 이동한다
- "읽는 순서" 모드: 다음을 누르면 그래프의 해당 노드가 강조되고 코드가 바뀐다

## 9. 비용·보안

- AI 호출 외에는 코드가 PC 밖으로 나가지 않는다 (서버 없음, 텔레메트리 없음)
- 실행마다 토큰과 비용을 meta.usage에 기록하고 CLI에 출력한다
- 결과는 `~/.prflow/cache/<owner>/<repo>/<headSha>.json`에 캐시한다
- 회사 레포에 쓰기 전에 **회사의 Anthropic API 사용 범위**를 확인해야 한다

## 10. MVP 마일스톤

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| M0 | flow.json 스키마 확정 + 손으로 만든 샘플 1개 → viewer로 렌더 | AI 없이 화면 구조 검증 (비용 0) |
| M1 | core: 수집 → 스택 감지 → AI 분석 → 검증 → flow.json, CLI 연결 | 실제 PR 1개에서 flow.json 생성 |
| M2 | viewer: 그래프 + 코드 패널 + 읽는 순서 + 캐시 | `npx prflow <URL>` 한 줄로 화면까지 |
| M3 | 실제 PR 3개로 측정 (Spring 2, Next.js 1) | 아래 성공 기준 표 작성 |
| 판단 | 결과를 보고 PR 코멘트(Mermaid) 모드 / Electron 앱 진행 여부 결정 | |

## 11. 성공 기준 (M3에서 측정, 수치는 제안값)

- 리뷰어가 diff를 보기 전에 그래프만 보고 PR의 흐름을 설명할 수 있다 (주관 평가)
- verified 비율 70% 이상, 버린 선 비율 10% 이하
- PR당 비용과 소요 시간: **측정 후 상한을 정한다** (추정하지 않음)

## 12. 열린 질문

1. PR당 허용 비용 상한은 얼마인가? (M3 측정 후 결정)
2. 회사 레포에 써도 되는가? (Anthropic API 사용 범위 확인 필요)
3. 공개 오픈소스로 할 경우 라이선스 (MIT 제안)
4. 이름 `prflow`는 가칭. npm 이름이 비어 있는지 확인 필요

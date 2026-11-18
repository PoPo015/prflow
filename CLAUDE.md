# prflow 작업 규칙

PR 을 흐름 그래프·코드 줄 설명·개념 노트로 읽는 로컬 리뷰 도구. 목적은 **리뷰하면서 새 코드를 공부하는 것** (README 「왜 만들었나」).

## 원칙
- 가볍게 간다. 프레임워크·추상화 추가보다 파일 하나 더 만드는 쪽. 실험 기능은 파일을 분리해 쉽게 뺄 수 있게.
- 코드 주석·UI 문구·커밋 메시지는 한국어. 주변 코드 밀도에 맞춘다.
- AI 결과는 그대로 믿지 않는다. 코드 본문·줄 번호·변경 표시처럼 프로그램이 확인할 수 있는 건 프로그램이 채우거나 보정한다 (`scripts/analyze.mjs` ⑤).
- AI 호출은 항상 읽기 전용(`--allowedTools Read Grep Glob`, 나머지 disallow).

## 구조
- `scripts/analyze.mjs` PR → `~/.prflow/flows/<slug>.json` (+ 개념 노트 누적)
- `server/api.mjs` 로컬 API (dev 는 `vite.config.ts`, 배포판은 `bin/prflow.mjs` 가 같은 핸들러 사용)
- `rules/<스택>.md` 프레임워크 규칙(기본 개념·베스트 프랙티스·자주 하는 실수). `server/rules.mjs` 가 감지된 스택에 맞춰 프롬프트에 넣는다. 팀·회사 규칙은 `~/.prflow/rules/` (공개 레포에 넣지 않는다)
- `src/` 화면 (React, `@xyflow/react`, `shiki`)
- 데이터는 전부 `~/.prflow` (`server/paths.mjs`). **레포 폴더에 분석 결과를 두지 않는다** — 대상 레포 코드가 들어 있다.

## 공개 레포 주의
- public 레포다. 커밋 전에 분석 대상(특히 회사) 레포의 이름·패키지명·코드가 섞이지 않았는지 확인한다.
- 이 PC 에는 `.git/hooks/pre-commit` 이 차단 목록(`~/.prflow/commit-blocklist.txt`, 레포 밖)으로 검사한다. 훅을 우회(`--no-verify`)하지 않는다.
- 샘플·테스트·스크린샷은 가상 데이터(`src/sample.ts`)나 공개 레포 PR 만 쓴다.

## 바꾼 뒤 확인
- `npx tsc --noEmit && npm run build`
- 분석 품질에 영향 있는 변경(프롬프트, 후처리, 정의·사용처 찾기)은 `npm run verify -v` 로 기존 결과를 점검하고, 필요하면 `npm run e2e`(공개 PR 8개 재분석, 약 $2·7분)로 전후 비교한다. 비용은 실측값을 보고한다.
- 화면 변경은 브라우저에서 직접 확인한다 (`npm run dev`, http://localhost:4173).

## 하지 않기로 한 것
- Mermaid 다이어그램 탭: 실험 후 제거 (보기 별로)
- npm 배포: 보류. 준비(`bin/`, package.json `bin`·`files`)는 되어 있음

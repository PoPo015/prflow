# Next.js (App Router)

## 기본 개념
- [server-component] 서버 컴포넌트가 기본. 서버에서 렌더링되고 JS 가 브라우저로 가지 않는다. DB·비밀키 접근 가능, 훅·이벤트 핸들러는 불가.
- [use-client] 'use client' 파일부터 아래 트리는 클라이언트 컴포넌트. 상태·이벤트가 필요한 말단에만 둔다.
- [server-action] 'use server' 함수(Server Action): 폼·버튼에서 직접 부르는 서버 함수. 공개 POST 엔드포인트와 같으므로 인증·검증이 필요하다.
- [caching] fetch·라우트 캐시와 revalidatePath / revalidateTag 로 다시 가져오기. 버전에 따라 기본 캐시 정책이 다르다(14: 기본 캐시, 15: 기본 no-store).
- [route-handler] app/**/route.ts: GET/POST 등 HTTP 핸들러. 페이지와 같은 경로에 둘 수 없다.
- [rendering-mode] 정적 렌더링 vs 동적 렌더링: cookies()·headers()·searchParams 를 쓰면 요청마다 동적으로 렌더링된다.

## 베스트 프랙티스
- [client-boundary-leaf] 'use client' 경계는 최대한 아래로. 큰 레이아웃 전체를 클라이언트로 만들지 않는다.
- [action-auth] Server Action·Route Handler 안에서 매번 인증·권한·입력 검증(zod 등). 클라이언트에서 숨겼다고 안전하지 않다.
- [revalidate-after-mutation] 데이터 변경 후 관련 경로·태그를 revalidate 해서 화면을 최신으로.
- [server-only] 비밀키·DB 코드는 서버 전용 모듈(server-only)에 두어 클라이언트 번들에 섞이지 않게.
- [loading-error] loading.tsx·error.tsx·Suspense 로 로딩·에러 상태를 라우트 단위로.

## 자주 하는 실수
- [secret-leak] NEXT_PUBLIC_ 이 붙은 환경변수나 클라이언트 컴포넌트에서 쓴 값은 브라우저에 노출된다.
- [action-trust-input] Server Action 인자(hidden input 포함)를 그대로 믿음 → 조작된 값으로 다른 사용자 데이터 변경·open redirect.
- [hydration-mismatch] 서버·클라이언트 렌더 결과가 다름(Date.now(), Math.random(), window 분기) → hydration 오류.
- [stale-cache] 변경 후 revalidate 누락 → 화면에 예전 데이터.
- [client-fetch-waterfall] 클라이언트에서 순차 fetch 여러 번 → 서버 컴포넌트에서 병렬로 가져오기.

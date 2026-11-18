# React

## 기본 개념
- [render] 렌더링: state·props 가 바뀌면 컴포넌트 함수가 다시 실행되고, 결과를 이전과 비교해 바뀐 DOM 만 갱신한다.
- [state-immutable] state 는 불변으로 다룬다. 객체·배열을 직접 고치지 말고 새 값을 만들어 set 한다(같은 참조면 리렌더 안 됨).
- [effect] useEffect: 렌더 후 외부 시스템과 동기화(구독, 타이머, DOM). 의존성 배열의 값이 바뀔 때만 다시 실행되고, cleanup 으로 정리한다.
- [key] 리스트의 key 는 항목의 안정적인 id. 순서가 바뀌면 key 로 같은 항목을 찾아 state 를 유지한다.
- [transition] useTransition / startTransition: 급하지 않은 업데이트를 표시해 입력 반응성을 유지. React 19 의 form action 은 자동으로 transition.
- [optimistic] useOptimistic: 서버 응답 전에 임시 상태를 보여 주고, 액션이 끝나면 실제 상태로 되돌아간다.

## 베스트 프랙티스
- [derive-not-sync] 다른 state·props 에서 계산 가능한 값은 state 로 두지 말고 렌더 중에 계산.
- [effect-last-resort] 이벤트로 처리할 수 있는 일(제출, 클릭 결과)은 effect 가 아니라 이벤트 핸들러에서.
- [stable-key] 배열 index 를 key 로 쓰지 않는다(정렬·삽입 시 state 꼬임).
- [lift-state] 여러 컴포넌트가 같은 데이터를 쓰면 가장 가까운 공통 부모로 state 를 올린다.
- [memo-when-needed] useMemo·useCallback·memo 는 측정된 성능 문제나 의존성 안정화가 필요할 때만.

## 자주 하는 실수
- [stale-closure] effect·콜백 안에서 오래된 state 를 참조(의존성 누락). 함수형 업데이트 setX(prev => …) 로 해결.
- [missing-deps] useEffect 의존성 배열 누락 → 값이 바뀌어도 다시 실행 안 됨. 반대로 매 렌더 새로 만든 객체를 넣으면 무한 실행.
- [effect-race] effect 안 fetch 결과가 늦게 와서 최신 요청 결과를 덮어씀. cleanup 에서 무시 플래그·AbortController.
- [mutate-state] state 객체를 직접 수정 후 set → 리렌더 누락.
- [setstate-in-render] 렌더 중에 setState 호출 → 무한 루프.

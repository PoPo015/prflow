# Go

## 기본 개념
- [error-value] 에러는 값: 함수가 (결과, error) 를 돌려주고 호출자가 if err != nil 로 바로 처리한다. 예외 대신 명시적 흐름.
- [error-wrap] fmt.Errorf("…: %w", err) 로 감싸고 errors.Is / errors.As 로 원인을 확인한다.
- [interface-implicit] 인터페이스는 암묵적으로 구현된다(implements 선언 없음). 메서드 집합이 맞으면 만족.
- [embedding] 구조체 임베딩: 다른 타입을 이름 없이 넣으면 그 메서드가 승격된다. 상속이 아니라 위임.
- [context] context.Context: 요청 범위의 취소·타임아웃·값 전달. 첫 번째 인자로 넘기고, 취소되면 하위 작업도 멈춰야 한다.
- [goroutine-channel] 고루틴(가벼운 동시 실행)과 채널(값 전달·동기화). 공유 메모리는 sync.Mutex 로 보호.
- [defer] defer: 함수가 끝날 때 역순으로 실행. 자원 해제(Close, Unlock)에 쓴다.

## 베스트 프랙티스
- [handle-once] 에러는 한 번만 처리: 로그를 남기거나 감싸서 반환하거나, 둘 다 하지 않는다.
- [ctx-propagate] 받은 ctx 를 하위 호출에 그대로 전달. context.Background() 를 중간에서 새로 만들지 않는다.
- [small-interfaces] 인터페이스는 쓰는 쪽에서 작게 정의(io.Reader 처럼 메서드 1~2개).
- [goroutine-lifetime] 고루틴을 시작하면 언제 끝나는지(ctx 취소, WaitGroup) 책임진다.
- [close-body] HTTP 응답 Body 는 defer resp.Body.Close().

## 자주 하는 실수
- [ignored-error] _ 로 에러를 버림 → 실패가 조용히 지나감.
- [nil-interface] nil 포인터를 담은 인터페이스는 nil 이 아니다(err != nil 이 참).
- [loop-var-capture] (Go 1.22 이전) 루프 변수를 고루틴·클로저가 캡처 → 마지막 값만 봄.
- [goroutine-leak] 아무도 읽지 않는 채널에 보내는 고루틴 → 영원히 블록.
- [map-race] 여러 고루틴이 map 에 동시 쓰기 → 런타임 패닉. Mutex 또는 sync.Map.
- [defer-in-loop] 루프 안 defer → 함수가 끝날 때까지 자원이 안 풀림.

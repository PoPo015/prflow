# TypeScript

## 기본 개념
- [structural] 구조적 타입: 이름이 아니라 모양(속성)이 같으면 같은 타입으로 본다.
- [narrowing] 타입 좁히기: typeof·in·instanceof·판별 필드(kind === 'a') 검사 후 그 분기 안에서는 더 구체적인 타입이 된다.
- [union-discriminated] 판별 유니온: 공통 리터럴 필드(type, kind)로 여러 모양을 구분하고 switch 로 빠짐없이 처리.
- [generics] 제네릭: 타입을 매개변수로 받아 입력과 출력의 관계를 표현한다.
- [runtime-gap] 타입은 컴파일 후 사라진다. 외부 입력(API 응답, 폼, JSON)은 런타임 검증(zod 등) 없이는 타입이 보장되지 않는다.

## 베스트 프랙티스
- [no-any] any 대신 unknown + 좁히기. any 는 타입 검사를 통째로 끈다.
- [exhaustive] 판별 유니온 switch 에 never 체크로 새 케이스 누락을 컴파일 에러로.
- [validate-boundary] 시스템 경계(요청 바디, 외부 API)에서 스키마 검증 후 타입 추론(z.infer).
- [strict-null] strictNullChecks 전제: null/undefined 가능성을 타입으로 드러내고 ?. ?? 로 처리.

## 자주 하는 실수
- [as-cast] as 단언으로 타입 오류를 덮음 → 런타임에서 터짐.
- [non-null-bang] ! 단언 남용 → 실제 null 일 때 크래시.
- [optional-vs-undefined] 선택 속성(?:)과 undefined 허용을 혼동 → 업데이트 API 에서 "필드 지우기"와 "안 보냄"이 구분되지 않음.
- [floating-promise] await 하지 않은 Promise → 에러가 삼켜지고 순서가 꼬임.

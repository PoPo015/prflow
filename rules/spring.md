# Spring

## 기본 개념
- [di] 의존성 주입: 객체를 직접 new 하지 않고 스프링 컨테이너가 빈을 만들어 생성자로 넣어 준다. 생성자 주입 + final 필드가 기본.
- [proxy] 프록시 기반 AOP: @Transactional, @Async, @Cacheable 등은 빈을 감싼 프록시가 메서드 호출을 가로채서 동작한다. 프록시를 거치지 않는 호출에는 적용되지 않는다.
- [tx] 트랜잭션: @Transactional 메서드가 정상 종료되면 커밋, RuntimeException 이 나가면 롤백. checked 예외는 기본적으로 롤백하지 않는다. propagation 기본값은 REQUIRED(있으면 참여, 없으면 생성).
- [bean-scope] 빈은 기본 싱글톤. 여러 요청이 같은 인스턴스를 동시에 쓰므로 필드에 요청별 상태를 두면 안 된다.
- [profile] @Profile / 프로퍼티로 환경별 빈 등록을 바꾼다. 조건이 맞지 않으면 빈이 아예 생성되지 않는다.
- [validation] @Valid + Bean Validation(@NotBlank 등)은 컨트롤러 진입 전에 검사하고, 실패하면 MethodArgumentNotValidException → 400.

## 베스트 프랙티스
- [ctor-injection] 필드 주입(@Autowired 필드) 대신 생성자 주입. 테스트와 불변성에 유리.
- [tx-at-service] 트랜잭션 경계는 서비스 계층 public 메서드에. 컨트롤러·리포지토리에 흩어 두지 않는다.
- [readonly-tx] 조회 전용 메서드는 @Transactional(readOnly = true).
- [thin-controller] 컨트롤러는 요청 변환·검증·응답만. 비즈니스 규칙은 서비스·도메인으로.
- [exception-handler] 예외 → HTTP 응답 변환은 @RestControllerAdvice 한곳에서.
- [after-commit] 메일·메시지 발행 같은 외부 부작용은 커밋 이후에(@TransactionalEventListener(AFTER_COMMIT) 등). 롤백됐는데 외부엔 나가는 사고 방지.
- [config-props] 설정값은 @ConfigurationProperties 로 묶어 타입 있게 주입. 하드코딩·흩어진 @Value 지양.

## 자주 하는 실수
- [self-invocation] 같은 클래스 안에서 this.method() 로 부르면 프록시를 안 거쳐 @Transactional·@Async 가 무시된다.
- [private-tx] private / final 메서드의 @Transactional 은 동작하지 않는다(프록시가 가로챌 수 없음).
- [checked-rollback] checked 예외를 던지면 기본은 커밋된다. 롤백이 필요하면 rollbackFor 지정.
- [async-no-enable] @Async 는 @EnableAsync 가 없으면 그냥 동기로 돈다. 반환 void 면 예외가 호출자에게 안 간다.
- [long-tx] 트랜잭션 안에서 외부 API 호출·파일 IO → DB 커넥션을 오래 잡아 풀 고갈.
- [catch-swallow] 트랜잭션 안에서 예외를 잡고 삼키면, 이미 rollback-only 로 표시된 경우 커밋 시 UnexpectedRollbackException.
- [singleton-state] 싱글톤 빈의 가변 필드 → 동시 요청 간 데이터 섞임.

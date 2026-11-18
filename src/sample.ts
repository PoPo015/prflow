import type { Flow } from './types'

// 손으로 만든 샘플. 나중에 AI 엔진이 같은 형식으로 만든다.
export const sample: Flow = {
  meta: {
    repo: 'example/shop',
    pr: 412,
    title: '회원가입 시 이메일 중복 검사 + 가입 환영 메일 발송',
    stacks: ['Next.js', 'Spring Boot', 'JPA'],
  },
  summary: {
    why: '같은 이메일로 중복 가입되는 문제가 있었고, 가입 직후 환영 메일을 보내 달라는 요청이 있었다.',
    what: '가입 API에서 이메일 중복을 먼저 검사하고, 저장이 커밋된 뒤에만 환영 메일을 보내도록 이벤트를 추가했다.',
  },
  nodes: [
    {
      id: 'form',
      kind: 'ui',
      label: 'SignUpForm',
      sub: 'app/signup/SignUpForm.tsx',
      change: 'modified',
      summary: '가입 폼. 제출하면 POST /api/users 를 호출하고, 409면 "이미 가입된 이메일" 을 보여준다.',
      code: {
        file: 'app/signup/SignUpForm.tsx',
        lang: 'tsx',
        startLine: 1,
        changedLines: [14, 15, 16, 17],
        source: `'use client'

import { useState, useTransition } from 'react'

export function SignUpForm() {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function submit(form: FormData) {
    const res = await fetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form)),
    })
    if (res.status === 409) {
      setError('이미 가입된 이메일입니다')
      return
    }
  }

  return <form action={(f) => startTransition(() => submit(f))}>…</form>
}`,
      },
      annotations: [
        {
          line: 1,
          kind: 'concept',
          title: "'use client' — 브라우저에서 도는 컴포넌트",
          body: 'Next.js App Router 는 기본이 서버 컴포넌트다. useState 같은 훅이나 이벤트 핸들러를 쓰려면 파일 맨 위에 이 지시어를 붙여 클라이언트 컴포넌트로 만들어야 한다.',
          concept: 'use-client',
        },
        {
          line: 7,
          kind: 'concept',
          title: 'useTransition — 제출 중 상태',
          body: 'startTransition 안에서 실행한 작업이 끝날 때까지 pending 이 true 가 된다. 버튼 비활성화·로딩 표시에 쓴다.',
        },
        {
          line: 14,
          kind: 'flow',
          title: '409 Conflict 를 여기서 받는다',
          body: '백엔드 GlobalExceptionHandler 가 DuplicateEmailException 을 409 로 바꿔 보낸다. 즉 이 if 문은 UserService 의 중복 검사 결과가 화면까지 올라온 지점이다.',
        },
      ],
    },
    {
      id: 'controller',
      kind: 'api',
      label: 'UserController.signUp',
      sub: 'POST /api/users',
      change: 'unchanged',
      summary: '요청 진입점. 입력값 검증(@Valid) 후 UserService 에 넘긴다. 이번 PR 에서 바뀌지 않았지만 흐름상 거쳐 간다.',
      code: {
        file: 'src/main/java/shop/user/UserController.java',
        lang: 'java',
        startLine: 18,
        source: `@PostMapping("/api/users")
@ResponseStatus(HttpStatus.CREATED)
public UserResponse signUp(@Valid @RequestBody SignUpRequest req) {
    return UserResponse.from(userService.register(req));
}`,
      },
      annotations: [
        {
          line: 20,
          kind: 'concept',
          title: '@Valid @RequestBody',
          body: 'JSON 본문을 SignUpRequest 로 바꾼 뒤(@RequestBody), 필드에 붙은 @Email·@NotBlank 규칙을 검사한다(@Valid). 실패하면 이 메서드에 들어오기도 전에 400 이 나간다.',
        },
      ],
    },
    {
      id: 'service',
      kind: 'service',
      label: 'UserService.register',
      sub: 'UserService.java',
      change: 'modified',
      summary: '핵심 변경. 중복 이메일이면 예외, 아니면 저장하고 "가입됨" 이벤트를 발행한다.',
      code: {
        file: 'src/main/java/shop/user/UserService.java',
        lang: 'java',
        startLine: 24,
        changedLines: [27, 28, 29, 31],
        source: `@Transactional
public User register(SignUpRequest req) {
    // 이메일 중복 검사
    if (userRepository.existsByEmail(req.email())) {
        throw new DuplicateEmailException(req.email());
    }
    User user = userRepository.save(User.create(req));
    events.publishEvent(new UserSignedUp(user.getId(), user.getEmail()));
    return user;
}`,
      },
      annotations: [
        {
          line: 24,
          kind: 'concept',
          title: '@Transactional — 이 메서드 전체가 하나의 트랜잭션',
          body: '메서드가 정상 종료되면 커밋, 런타임 예외가 나가면 롤백된다. 스프링이 프록시 객체로 감싸서 앞뒤에 begin/commit 을 넣는 방식이라, 같은 클래스 안에서 this.register() 로 부르면 적용되지 않는다.',
          concept: 'transactional',
        },
        {
          line: 27,
          kind: 'caution',
          title: '동시에 두 번 요청하면?',
          body: 'exists 검사와 save 사이에 다른 요청이 끼어들면 둘 다 통과할 수 있다. users.email 에 UNIQUE 제약이 있어야 최종적으로 막힌다. 리뷰 때 마이그레이션에 제약이 있는지 확인할 것.',
        },
        {
          line: 31,
          kind: 'flow',
          title: '여기서 메일을 바로 보내지 않는다',
          body: '이벤트만 발행하고 끝난다. 실제 메일은 WelcomeMailListener 가 "커밋된 뒤에" 받아서 보낸다. 저장이 롤백됐는데 메일만 나가는 사고를 막는 구조.',
          concept: 'tx-event',
        },
      ],
    },
    {
      id: 'repo',
      kind: 'repository',
      label: 'UserRepository',
      sub: 'UserRepository.java',
      change: 'modified',
      summary: 'existsByEmail 메서드 한 줄 추가. 구현 코드는 없고 이름으로 쿼리가 만들어진다.',
      code: {
        file: 'src/main/java/shop/user/UserRepository.java',
        lang: 'java',
        startLine: 7,
        changedLines: [8],
        source: `public interface UserRepository extends JpaRepository<User, Long> {
    boolean existsByEmail(String email);
}`,
      },
      annotations: [
        {
          line: 8,
          kind: 'concept',
          title: '메서드 이름이 곧 쿼리',
          body: 'Spring Data JPA 가 이름을 해석해 select 1 from users where email = ? limit 1 같은 쿼리를 자동으로 만든다. exists / find / count + By + 필드명 규칙.',
          concept: 'derived-query',
        },
      ],
    },
    {
      id: 'db',
      kind: 'db',
      label: 'users',
      sub: 'MySQL 테이블',
      change: 'unchanged',
      summary: '회원 테이블. email 에 UNIQUE 제약이 있는지가 동시성 안전의 마지막 방어선.',
    },
    {
      id: 'listener',
      kind: 'event',
      label: 'WelcomeMailListener',
      sub: 'WelcomeMailListener.java',
      change: 'added',
      summary: '새 파일. 가입 트랜잭션이 커밋된 뒤에만 실행되어 환영 메일을 보낸다.',
      code: {
        file: 'src/main/java/shop/mail/WelcomeMailListener.java',
        lang: 'java',
        startLine: 12,
        changedLines: [12, 13, 14, 15, 16, 17],
        source: `@Async
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
public void on(UserSignedUp event) {
    mailClient.send(event.email(), Templates.WELCOME);
    log.info("welcome mail sent userId={}", event.userId());
}`,
      },
      annotations: [
        {
          line: 13,
          kind: 'concept',
          title: 'AFTER_COMMIT — 커밋이 확정된 뒤에만',
          body: '일반 @EventListener 는 publishEvent 하는 순간 바로 실행된다. 이건 트랜잭션이 커밋에 성공했을 때만 실행되고, 롤백되면 아예 실행되지 않는다.',
          concept: 'tx-event',
        },
        {
          line: 12,
          kind: 'caution',
          title: '@Async — 별도 스레드에서 실행',
          body: '메일 발송이 느려도 가입 응답은 기다리지 않는다. 대신 여기서 예외가 나도 사용자에게 전달되지 않으니, 실패 로그·재시도 정책이 있는지 확인할 것. @EnableAsync 설정이 없으면 그냥 동기로 돈다.',
        },
      ],
    },
    {
      id: 'mail',
      kind: 'external',
      label: 'MailClient',
      sub: '외부 메일 API',
      change: 'unchanged',
      summary: '외부 메일 발송 서비스 호출. 이번 PR 범위 밖.',
    },
  ],
  edges: [
    { from: 'form', to: 'controller', label: 'POST /api/users', status: 'verified' },
    { from: 'controller', to: 'service', label: 'register()', status: 'verified' },
    { from: 'service', to: 'repo', label: 'existsByEmail / save', status: 'verified' },
    { from: 'repo', to: 'db', label: 'SQL', status: 'inferred' },
    { from: 'service', to: 'listener', label: 'UserSignedUp (커밋 후)', status: 'verified' },
    { from: 'listener', to: 'mail', label: 'send()', status: 'verified' },
  ],
  readingOrder: [
    { node: 'form', why: '사용자가 가입 버튼을 누르는 곳. 409 처리만 추가됐다.' },
    { node: 'controller', why: '요청이 들어오는 입구. 바뀐 건 없고 흐름 파악용.' },
    { node: 'service', why: '이번 PR 의 핵심. 중복 검사와 이벤트 발행.' },
    { node: 'repo', why: '중복 검사 쿼리가 어떻게 만들어지는지.' },
    { node: 'listener', why: '메일이 언제, 어느 스레드에서 나가는지.' },
  ],
  concepts: [
    {
      id: 'use-client',
      name: "'use client'",
      stack: 'Next.js',
      short: '이 파일부터 아래는 브라우저에서 실행된다는 표시',
      body: 'App Router 의 컴포넌트는 기본적으로 서버에서 렌더링된다. 상태·이벤트가 필요한 컴포넌트만 클라이언트로 내려보내서 JS 번들을 줄이는 구조.',
    },
    {
      id: 'transactional',
      name: '@Transactional',
      stack: 'Spring',
      short: '메서드 하나를 트랜잭션 하나로 묶는다',
      body: '스프링이 빈을 프록시로 감싸고, 메서드 호출 전후에 트랜잭션 시작·커밋·롤백을 넣는다. 기본은 RuntimeException 일 때만 롤백. 같은 클래스 내부 호출에는 프록시를 거치지 않아 적용되지 않는다.',
    },
    {
      id: 'tx-event',
      name: '@TransactionalEventListener',
      stack: 'Spring',
      short: '트랜잭션 결과(커밋/롤백)에 맞춰 실행되는 이벤트 리스너',
      body: 'publishEvent 시점에 바로 실행하지 않고, 트랜잭션이 끝날 때 phase(AFTER_COMMIT 기본)에 맞춰 실행한다. "DB 에 확실히 저장된 뒤에 외부 작업" 을 할 때 쓰는 대표 패턴.',
    },
    {
      id: 'derived-query',
      name: '쿼리 메서드 (Derived Query)',
      stack: 'Spring Data JPA',
      short: '메서드 이름을 해석해서 SQL 을 자동 생성',
      body: 'findByEmailAndStatus, countByCreatedAtAfter 처럼 규칙에 맞게 이름을 지으면 구현 없이 동작한다. 조건이 복잡해지면 @Query 나 QueryDSL 로 넘어간다.',
    },
  ],
}

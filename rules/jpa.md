# JPA / Hibernate (Spring Data JPA, QueryDSL 포함)

## 기본 개념
- [persistence-context] 영속성 컨텍스트: 트랜잭션 안에서 조회한 엔티티를 1차 캐시에 들고 있고, 같은 id 는 같은 객체를 돌려준다.
- [dirty-checking] 변경 감지: 영속 엔티티의 필드를 바꾸면 save 를 부르지 않아도 flush 시점에 UPDATE 가 나간다.
- [flush] flush: 쌓인 변경을 SQL 로 보내는 시점. 기본은 커밋 직전·JPQL 실행 직전. 제약 위반 예외도 이때 터진다(saveAndFlush 로 앞당길 수 있음).
- [lazy] 지연 로딩: 연관 엔티티는 실제로 접근할 때 쿼리. 트랜잭션 밖에서 접근하면 LazyInitializationException.
- [derived-query] 쿼리 메서드: findByEmailAndStatus 처럼 이름으로 쿼리가 생성된다. 복잡해지면 @Query·QueryDSL.
- [locking] 잠금: 낙관적(@Version, 충돌 시 예외) / 비관적(@Lock(PESSIMISTIC_WRITE) → SELECT … FOR UPDATE).
- [owning-side] 연관관계 주인: FK 를 가진 쪽(또는 @JoinColumn 을 가진 쪽)만 DB 에 반영된다. mappedBy 쪽 변경은 무시.

## 베스트 프랙티스
- [fetch-lazy] @ManyToOne·@OneToOne 은 기본 EAGER 이므로 LAZY 로 명시.
- [fetch-join] 목록 + 연관 엔티티가 필요하면 fetch join / @EntityGraph / batch size 로 N+1 방지.
- [dto-projection] 조회 화면용은 엔티티 대신 DTO 프로젝션. 엔티티를 API 응답으로 그대로 노출하지 않는다.
- [db-constraint] 중복·무결성은 앱 검사(exists → save)만 믿지 말고 DB 유니크·FK 제약으로 최종 방어.
- [bulk-update] 대량 수정은 엔티티 루프 대신 벌크 쿼리. 단 벌크 후엔 영속성 컨텍스트가 DB 와 어긋나므로 clear.

## 자주 하는 실수
- [n-plus-one] 루프 안에서 lazy 연관 접근 → 쿼리 N+1 번.
- [check-then-act] exists 검사 후 save 사이에 다른 요청이 끼어들어 중복 생성. 유니크 제약이나 잠금 필요.
- [paging-fetch-join] 컬렉션 fetch join + 페이징 → 메모리에서 페이징(경고 HHH90003004) 또는 결과 중복.
- [equals-hashcode] id 기반 equals/hashCode 를 영속 전(id null)에 쓰면 Set 동작이 깨진다.
- [open-in-view] OSIV 켜진 채로 컨트롤러·뷰에서 lazy 로딩 → 커넥션을 요청 끝까지 점유.
- [cascade-remove] cascade = REMOVE / orphanRemoval 을 공유 엔티티에 걸면 의도치 않은 삭제.

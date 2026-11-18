# Django (+ Django REST framework)

## 기본 개념
- [orm-lazy] QuerySet 은 지연 평가: 순회·슬라이싱·list() 하는 순간 쿼리가 실행된다. filter 를 이어 붙이는 동안엔 쿼리가 나가지 않는다.
- [related-loading] select_related(FK·1:1, JOIN) / prefetch_related(역참조·M2M, 별도 쿼리)로 연관 객체를 미리 가져온다.
- [atomic] transaction.atomic: 블록 단위 트랜잭션. 기본은 autocommit(쿼리마다 커밋).
- [signals] 시그널(pre_save, post_save 등): 모델 저장 시 자동 호출되는 훅. 흐름이 코드에 안 보이는 간접 호출이다.
- [cbv] 클래스 기반 뷰·DRF ViewSet: get_queryset·get_serializer·perform_create 같은 훅 메서드를 오버라이드해 동작을 바꾼다.
- [content-types] GenericForeignKey(content_type + object_id): 아무 모델이나 가리키는 다형 관계. DB FK 제약이 없다.

## 베스트 프랙티스
- [avoid-n-plus-one] 목록 뷰·시리얼라이저에서 연관 필드를 쓰면 select_related/prefetch_related.
- [queryset-permission] 권한 필터링은 get_queryset 단계에서(다른 사용자 객체가 애초에 조회되지 않게).
- [atomic-multi-write] 여러 모델을 함께 바꾸는 작업은 transaction.atomic 으로 묶는다.
- [on-commit] 메일·태스크 큐 발행은 transaction.on_commit 으로 커밋 이후에.
- [bulk-ops] 대량 생성·수정은 bulk_create / bulk_update / update(). 단 save()·시그널이 호출되지 않는 점 주의.
- [f-expressions] 동시 수정되는 카운터는 F('count') + 1 로 DB 에서 계산(경쟁 조건 방지).

## 자주 하는 실수
- [n-plus-one] 템플릿·시리얼라이저 루프 안 FK 접근 → 쿼리 N+1.
- [bulk-skips-signals] bulk_* / update() 는 save()·시그널을 건너뛴다 → 변경 로그·캐시 무효화 누락.
- [mutable-default] 함수 기본 인자에 {} [] → 호출 간 공유(파이썬 공통).
- [raw-sql-injection] extra()·raw()·문자열 포맷 SQL → 인젝션. 파라미터 바인딩 사용.
- [gfk-orphans] GenericForeignKey 대상이 삭제돼도 자동 정리되지 않음(GenericRelation 필요).

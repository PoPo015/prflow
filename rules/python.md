# Python

## 기본 개념
- [duck-typing] 덕 타이핑: 타입이 아니라 필요한 메서드·속성이 있는지로 동작한다. 타입 힌트는 실행 시 강제되지 않는다.
- [context-manager] with 문: 진입·종료 시 자원 획득·해제(__enter__/__exit__). 예외가 나도 정리된다.
- [generator] 제너레이터(yield): 값을 한 번에 다 만들지 않고 필요할 때 하나씩. 한 번 소비하면 다시 못 쓴다.
- [decorator] 데코레이터: 함수를 받아 감싼 함수를 돌려준다. @functools.wraps 로 원래 이름·docstring 유지.
- [mro] 다중 상속·믹스인: 메서드 탐색 순서(MRO)대로 찾고, super() 는 MRO 의 다음 클래스를 부른다.

## 베스트 프랙티스
- [explicit-exceptions] 구체적인 예외만 잡는다. except Exception / bare except 로 전부 삼키지 않는다.
- [type-hints] 공개 함수에는 타입 힌트. 정적 검사(mypy/pyright)로 잡을 수 있는 오류를 늘린다.
- [pathlib] 경로는 문자열 조합 대신 pathlib.
- [logging] print 대신 logging, 포맷은 지연 평가 log.info("x=%s", x).

## 자주 하는 실수
- [mutable-default] 기본 인자에 가변 객체(def f(x=[])) → 호출 사이에 공유된다.
- [late-binding-closure] 루프 안 lambda·클로저가 루프 변수를 나중 값으로 참조.
- [shallow-copy] dict/list 의 copy() 는 얕은 복사. 중첩 구조 수정이 원본에 번진다(deepcopy 필요).
- [is-vs-eq] is 는 같은 객체인지, == 는 값 비교. 숫자·문자열 비교에 is 사용 금지.
- [silent-none] 함수가 일부 분기에서 return 을 빠뜨려 None 반환.

# Phase 4: 테스트 케이스

## 테스트 커버리지 목표

70% 는 참고 수치다 — 통과 기준이 아니다.

## 검증할 동작

### `summarizeDraft` 레이블 모듈 (`tests/unit/session/`)

- **동작**: work op N세트 → summary 에 「정규 N세트」 포함 | **계층**: 단위
- **동작**: work(N) + free(M) → summary 에 「정규 N세트 · 추가 M세트」 포함 | **계층**: 단위
- **동작**: abandon op → summary 에 「중단」 포함 | **계층**: 단위
- **동작**: summary 에 판정 결과·격려·백분율이 포함되지 않는다 (NFR-2 / R-4) | **계층**: 단위

### FR-43.2: 잠긴 종목 선택 불가 (회귀)

`FreeExerciseForm` 의 잠금 검사는 `$derived(checkGate(currentState, catalog, progressionId))`
(`FreeExerciseForm.svelte:51`) 로 구현된다. `checkGate` 는 `src/lib/domain/gate.ts:21` 의 순수 함수이며
`tests/unit/gate.test.ts` 에서 이미 테스트된다. 도메인 로직은 이 Phase 에서 변경하지 않으므로 회귀는
기존 `gate.test.ts` 통과로 확인한다. 컴포넌트 바인딩은 DOM 테스트 인프라 부재(R-5)로 단위 테스트 불가 —
Phase 6 폰 체크리스트 항목 8(자유 운동 흐름)에서 수동 확인한다.

### `data-*` 훅 존재 확인 (Playwright 가 없으므로 구조 테스트 또는 수동 확인)

DOM 테스트 인프라가 없으므로 (R-5) 아래 항목은 Phase 6 수동 체크리스트(체크리스트 항목 1~14)로 대체한다.

## 이 페이즈에 실제로 해당하는 엣지 케이스

- EC-94: `markAbandoned(key, false)` 시 연결 다지기 칸 닫기 확인 다이얼로그가 뜬다.
- EC-101: FinishDialog 취소 시 아무 칸도 변경되지 않는다.
- EC-102: 마치기 완료 후 같은 날 같은 종목의 `beginWork` 가 새 칸을 만든다.

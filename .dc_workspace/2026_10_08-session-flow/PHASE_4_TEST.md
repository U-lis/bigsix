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

## 검증 결과 (2026-10-08)

### 통과한 동작

| 동작 | 파일:줄 |
|------|--------|
| work N세트 → summary 「정규 N세트」 | `summarizeDraft.test.ts:87` |
| work + free → summary 「정규 N세트 · 추가 M세트」 | `summarizeDraft.test.ts:101` |
| abandon → summary 「중단」 | `summarizeDraft.test.ts:119` |
| summary 판정·격려·백분율 없음 (NFR-2) | `summarizeDraft.test.ts:166` |
| FR-6.7a: SessionRecord.rpe === max(setRpes) | `finish.test.ts` — `executeFinish — FR-6.7a` |
| FR-6.7a: setRpes 전무 → rpe 필드 없음 | `finish.test.ts` — `executeFinish — FR-6.7a` |
| EC-102: finish 후 같은 종목 beginWork 가능 | `inprogress.test.ts` — `finish 후 같은 종목 재개` |

### 수동 체크리스트 (Phase 6)

- [ ] 1. `data-finish`, `data-finish-bar`, `data-finish-dialog`, `data-finish-row` 훅 존재
- [ ] 2. `data-abandon-mark` 값 `'on'|'off'` 토글
- [ ] 3. `data-set-row`, `data-set-extra`, `data-set-short` 세트 행 훅
- [ ] 4. `data-draft-blocked` 스테일 칸 잠금 표시 및 문구
- [ ] 5. FinishBar 비활성 상태 (opacity + cursor + disabled)
- [ ] 6. FinishDialog 취소 시 아무 칸도 변경 없음 (EC-101)
- [ ] 7. 다지기 제안 승인 후 consolidation 카드 노출 (EC-94)
- [ ] 8. 자유 운동 폼 — `beginFree` false 반환 시 에러 문구 표시 (입력 미소실)
- [ ] 9. 잠긴 종목 선택 불가 (FR-43.2)
- [ ] 10. 중단 카드 입력 영역 CSS 접힘 확인
- [ ] 11. write-blocked 시 저장 실패 배너 표시
- [ ] 12. 마치기 후 승급·보류 결과 사실 문구 노출
- [ ] 13. 자유 운동 칸이 agenda 카드 아래 독립 카드로 노출
- [ ] 14. FinishDialog 에 종목명·단계·사실 문구 표시

# Phase 2: 테스트 케이스

## 테스트 커버리지 목표

70% 는 참고 수치다 — 통과 기준이 아니다.

## 검증할 동작

### 스토어 API (`tests/unit/session/inprogress.test.ts`)

- **동작**: `beginWork` 로 시작한 칸이 `getDraft` 로 읽힌다 | **계층**: 단위
- **동작**: 이미 칸이 있는 키로 `beginWork` 를 다시 호출해도 기존 세트가 지워지지 않는다 (EC-99/100) | **계층**: 단위
- **동작**: 두 종목 칸을 각각 시작하고 세트를 쌓으면 서로 독립적으로 유지된다 (FR-39.2) | **계층**: 단위
- **동작**: `pushSet` → `updateSet` → `removeSet` 이 불변 spread 로 `workSets` 를 변경한다 | **계층**: 단위
- **동작**: `markAbandoned(key, true)` 뒤 `getDraft` 로 읽으면 `abandoned === true` | **계층**: 단위
- **동작**: `markAbandoned(key, false)` 뒤 `getDraft` 로 읽으면 `abandoned === false` (EC-94) | **계층**: 단위
- **동작**: `discardDraft(key)` 뒤 해당 키의 칸이 없어진다 | **계층**: 단위
- **동작**: `discardAll()` 뒤 `drafts` 가 빈 객체다 | **계층**: 단위

### `staleDrafts` (`tests/unit/session/inprogress.test.ts` 또는 별도 파일)

- **동작**: `startedAt < today` 인 칸만 반환된다 | **계층**: 단위
- **동작**: 반환 결과가 날짜별로 묶인다 | **계층**: 단위
- **동작**: `startedAt === today` 인 칸은 포함되지 않는다 | **계층**: 단위

## 이 페이즈에 실제로 해당하는 엣지 케이스

- `beginConsolidation` 은 `linkedTo` 필드가 있는 칸을 만든다.
- `getDraft(id, kind, onDate)` 에서 `onDate` 와 `startedAt` 이 다른 칸은 반환되지 않는다.

## 테스트 결과 (2026-10-08)

`pnpm test` 966 passed, 0 failed (56 test files).

| 동작 | 파일 | 결과 |
|------|------|------|
| `beginWork` 로 시작한 칸이 `getDraft` 로 읽힌다 | `tests/unit/session/inprogress.test.ts` | PASS |
| 이미 칸이 있는 키로 `beginWork` 를 다시 호출해도 기존 세트가 지워지지 않는다 (EC-99/100) | 상동 | PASS |
| 두 종목 칸을 각각 시작하고 세트를 쌓으면 서로 독립적으로 유지된다 (FR-39.2) | 상동 | PASS |
| `pushSet` → `updateSet` → `removeSet` 이 불변 spread 로 `workSets` 를 변경한다 | 상동 | PASS |
| `markAbandoned(key, true)` 뒤 `getDraft` 로 읽으면 `abandoned === true` | 상동 | PASS |
| `markAbandoned(key, false)` 뒤 `getDraft` 로 읽으면 `abandoned === false` (EC-94) | 상동 | PASS |
| `discardDraft(key)` 뒤 해당 키의 칸이 없어진다 | 상동 | PASS |
| `discardAll()` 뒤 `drafts` 가 빈 객체다 | 상동 | PASS |
| `startedAt < today` 인 칸만 반환된다 | `tests/unit/session/stale.test.ts` | PASS |
| 반환 결과가 날짜별로 묶인다 | 상동 | PASS |
| `startedAt === today` 인 칸은 포함되지 않는다 | 상동 | PASS |
| **추가**: 어제 칸이 있으면 `beginWork` 가 `false` 를 돌려준다 (스테일 충돌) | `tests/unit/session/inprogress.test.ts` | PASS |

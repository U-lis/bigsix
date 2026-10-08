# Phase 3: 테스트 케이스

## 테스트 커버리지 목표

70% 는 참고 수치다 — 통과 기준이 아니다.

## 검증할 동작

### `planFinish` (`tests/unit/session/finish.test.ts`)

- **동작**: 세트 0개 칸은 그룹에 포함되지 않는다 (EC-89) | **계층**: 단위
- **동작**: work 칸 2×20, 실제 세트 [20, 18] → op `work` 하나 (sets=[20,18]) | **계층**: 단위
- **동작**: work 칸 2×20, 실제 세트 [20, 18, 15] → op `work`(sets=[20,18]) + op `free`(sets=[15]) | **계층**: 단위
- **동작**: `abandoned === true` 인 work 칸 → op `abandon` (전체 세트, sets=[20,18,15]) | **계층**: 단위
- **동작**: `abandoned === true` 이고 세트 0개인 work 칸 → op `abandon` 하나 (sets=[]) (EC-95) | **계층**: 단위
- **동작**: consolidation 칸 목표 3세트, 실제 5세트 → op `consolidation`(sets=[...3]) + op `free`(sets=[...2], performedStep = step-1) (EC-92) | **계층**: 단위
- **동작**: free 칸 → op `free` (전체 세트) 그대로 통과 | **계층**: 단위
- **동작**: 그룹 순서 — agendaOrder [pushup, squat] 이고 pushup:work, squat:work, pushup:free 가 있으면 pushup:work → squat:work → pushup:free 순 | **계층**: 단위
- **동작**: `scope = { kind: 'date', date: '2026-10-07' }` 이면 `startedAt === '2026-10-07'` 인 칸만 포함 | **계층**: 단위
- **동작**: `setRpes` 가 op 의 세트 슬라이스에 맞게 분리된다 (work N개 → 앞 N개, free M개 → 뒤 M개) | **계층**: 단위

### `executeFinish` (`tests/unit/session/finish.test.ts`)

- **동작**: 모든 그룹 성공 시 `perDraft` 의 모든 항목이 `ok: true` | **계층**: 단위
- **동작**: 중간 그룹(예: squat:work)이 throw 하면 그 칸은 `ok: false, reason` 이 기록되고, 다음 그룹(pushup:free)이 계속 실행된다 (FR-42.6) | **계층**: 단위
- **동작**: `completedAt` 이 모든 op 에 전달된다 | **계층**: 단위

## 이 페이즈에 실제로 해당하는 엣지 케이스

- `target` 이 undefined 인 칸(자유 운동 칸)의 op 에는 `target` 필드 자체가 없다 (undefined 명시 대입 금지).
- op date 는 `draft.startedAt` 이며, `nowIsoLocal` 과 다를 수 있다 (EC-97 날짜 지정 기록).

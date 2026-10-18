# Phase 7: 테스트 케이스

## 테스트 커버리지 목표

70% 는 참고 수치다 — 통과 기준이 아니다.

## 검증할 동작

모든 자동화 테스트는 `tests/unit/today/done.test.ts` 에 작성한다.

---

### `recordedToday`

- **동작**: 히스토리가 빈 배열이면 빈 배열을 반환한다 | **계층**: unit
- **동작**: 다른 날짜의 기록은 포함하지 않는다 | **계층**: unit
- **동작**: 다른 종목의 기록은 포함하지 않는다 | **계층**: unit
- **동작**: `kind === 'free'` 기록은 제외한다 | **계층**: unit
- **동작**: `kind === 'work'` 기록은 포함한다 | **계층**: unit
- **동작**: `outcome === 'abandoned'` (`kind === 'work'`) 기록은 포함한다 | **계층**: unit
- **동작**: `kind === 'consolidation'` 기록은 포함한다 | **계층**: unit
- **동작**: 오늘 같은 종목의 기록이 두 개이면 삽입 순서로 두 개를 반환한다 | **계층**: unit
- **동작**: `work` + `consolidation` + `free` 가 섞여 있으면 `free` 를 제외한 두 개만 반환한다 | **계층**: unit

---

### `doneResultLabel`

- **동작**: `promotedTo` 가 있는 기록 → `"{progName}: {step}단계 → {promotedTo}단계 (승급)"` 를 반환한다 | **계층**: unit
- **동작**: `blockedBy === 'rpe'` 인 기록 → `"{progName}: {step}단계 (보류 · rpe)"` 를 반환한다 | **계층**: unit
- **동작**: `blockedBy === 'master'` 인 기록 → `"{progName}: {step}단계 (보류 · master)"` 를 반환한다 | **계층**: unit
- **동작**: `outcome === 'abandoned'` 인 기록 → `"{progName}: {step}단계 중단"` 을 반환한다 | **계층**: unit
- **동작**: 위 조건에 해당하지 않는 기록 → `"{progName}: {step}단계 기록"` 을 반환한다 | **계층**: unit
- **동작**: 함수 호출 후 `record` 인자가 변경되지 않는다 | **계층**: unit

---

### `doneSetShortfall`

- **동작**: `record.target` 이 없으면 `null` 을 반환한다 | **계층**: unit
- **동작**: `record.target.work[i]` 가 존재하고 `sets[i] >= target.work[i]` 이면 `null` 을 반환한다 | **계층**: unit
- **동작**: `sets[i] < target.work[i]` 이면 `'/ 목표 {target} · 미달'` 형식의 문자열을 반환한다 | **계층**: unit
- **동작**: `i` 가 `target.work` 범위를 벗어나면 `null` 을 반환한다 | **계층**: unit

---

### `syncDoneDrafts`

- **동작**: 오늘 정규 기록이 없는 종목의 draft 는 액션에 포함하지 않는다 | **계층**: unit
- **동작**: 오늘 정규 기록이 있는 종목의 `work` draft 에 세트가 있으면 `move-sets` 와 `remove-draft` 액션을 반환한다 | **계층**: unit
- **동작**: `move-sets` 의 `toStep` 은 마지막 정규 기록의 `performedStep` 이다 | **계층**: unit
- **동작**: 세트가 없고 `abandoned` 가 아닌 draft → `remove-draft` 액션만 반환한다 | **계층**: unit
- **동작**: `abandoned: true` 이고 세트가 없는 draft → `remove-draft` 액션만 반환한다 | **계층**: unit
- **동작**: `abandoned: true` 이고 세트가 있는 draft → `move-sets` + `remove-draft` 액션을 반환한다 | **계층**: unit
- **동작**: 같은 종목의 `free` draft 가 같은 단계로 이미 있으면 `move-sets` 액션을 반환한다 (기존 free 칸에 세트를 추가하는 의도) | **계층**: unit
- **동작**: 같은 종목의 `free` draft 가 다른 단계로 있으면 `report(step-mismatch)` 액션을 반환하고 draft 를 건드리지 않는다 | **계층**: unit
- **동작**: 수렴 — 반환된 액션 목록이 적용된 drafts 로 다시 호출하면 빈 배열을 반환한다 (멱등) | **계층**: unit
- **동작**: 세트는 잃지 않는다 — `move-sets` 액션의 `sets` 가 원래 draft 의 `workSets` 와 동일하다 | **계층**: unit

---

### `InProgressStore.applySync`

테스트 파일: `tests/unit/session/inprogress.test.ts`

- **동작**: `actions` 가 빈 배열이면 즉시 반환하고 `persist` 를 호출하지 않는다 | **계층**: unit
- **동작**: `remove-draft` 액션이 있으면 해당 키의 draft 가 `drafts` 에서 제거된다 | **계층**: unit
- **동작**: `move-sets` 액션에서 자유 운동 칸이 없으면 새로 생성하고 세트를 추가한다 | **계층**: unit
- **동작**: `move-sets` 액션에서 같은 단계의 자유 운동 칸이 이미 있으면 기존 칸에 세트를 추가한다 | **계층**: unit
- **동작**: `report` 액션만 있을 때 `drafts` 가 변경되지 않는다 | **계층**: unit
- **동작**: 여러 액션(`move-sets` + `remove-draft`)을 단 한 번의 `persist` 호출로 저장한다 | **계층**: unit
- **동작**: 세트는 잃지 않는다 — `move-sets` 적용 후 자유 운동 칸의 세트 목록이 원래 draft 의 `workSets` 와 동일하다 | **계층**: unit

---

### `planFinish` 연동 (FR-46.3)

테스트 파일: `tests/unit/today/done.test.ts`

- **동작**: `syncDoneDrafts`/`applySync` 가 생성한 자유 운동 칸에 대해 `planFinish` 를 실행하면 해당 칸이 기록의 `performedStep` 과 동일한 단계의 `free` op 를 포함한다 | **계층**: unit

---

## 이 페이즈에 실제로 해당하는 엣지 케이스

- EC-102: 마치기 뒤 같은 날 같은 종목 — 카드가 「완료」로 전환되고 추가 세트는 자유 운동 칸에 쌓인다.
- EC-103: 오늘 정규 기록이 두 개인 종목 — `recordedToday` 가 둘 다 반환하고, `syncDoneDrafts` 는 마지막 기록의 `performedStep` 을 기준으로 한다.
- EC-104: 오늘 자유 운동 기록만 있는 종목 — `recordedToday` 가 빈 배열을 반환해 「완료」 카드가 아닌 일반 카드로 표시된다.

## 자동화 회귀

- **동작**: `pnpm test` 전부 통과 (기존 베이스라인 920 이상) | **계층**: unit

## 검증 결과 (2026-10-12)

- `pnpm check`: 0 errors, 0 warnings (541 files)
- `pnpm test`: 1013 tests passed, 58 files (all behaviors confirmed)
- `pnpm build`: success
- hex grep: clean (no hardcoded colors in `.svelte` files outside `<meta name="theme-color">`)

All behaviors listed above are covered by `tests/unit/today/done.test.ts` and `tests/unit/session/inprogress.test.ts`.

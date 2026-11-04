# Move Record Date (0.5.1) - Global Documentation

## Feature Overview

**Purpose**: Let the user move one recorded session in the History tab (day view) to a different date, so a record saved under the wrong date can be corrected.

**Problem**: `record.date` is fixed at recording time. A record saved under the wrong day cannot be fixed, and the engine judges progression by array order (`progress.ts:94,98`) with `adjustedAtSessionIndex` anchors stored as history indices (`steps.ts:49-51`), so a naive date edit would shift indices and silently change judging.

**Solution**: A pure domain function `moveRecordDate(state, recordIndex, toDate, today)` in a new `src/lib/domain/records.ts` returns a result type (success with new `AppState`, or a rejection reason). It repositions the record by an AD-3 rule, corrects the shifted anchors (AD-4), and rejects moves that would change judging. The History tab gets a per-session form (`RecordMoveForm`) wired through `DayRow` -> `DayList` -> `HistoryView`, which applies the result with `appState.apply`.

---

## Architecture Decision

### AD-1: Result type, no exceptions
`src/lib/domain/records.ts` (new), exported through `index.ts` as type exports like `GateResult` (`index.ts:4`); `types.ts` untouched.
```
export type MoveRecordRejection = 'invalid-index' | 'invalid-date' | 'future' | 'same-date' | 'crosses-same-progression' | 'crosses-adjustment';
export type MoveRecordResult = { ok: true; state: AppState } | { ok: false; reason: MoveRecordRejection };
```
**Options Considered**: 1. Throw on rejection. 2. Result union.
**Decision**: Option 2. Matches `storage.ts:538-540` and `importJson.ts:34-40`.
**Rationale**: SPEC FR-3 forbids exceptions.

### AD-2: Fixed check order, first failure wins
1. `invalid-index`: `!Number.isInteger(i) || i < 0 || i >= history.length`.
2. `invalid-date`: regex `^\d{4}-\d{2}-\d{2}$` and `addDays(toDate, 0) === toDate` (`date.ts:34`); rejects `2026-02-30` and `''`.
3. `future`: `toDate > today` (string compare, precedent `src/lib/ui/history/range.ts:48-49`).
4. `same-date`.
5. `crosses-same-progression`.
6. `crosses-adjustment`.
**Rationale**: A deterministic order makes each reason independently testable and the UI message predictable.

### AD-3: Position rule, no global sort
Remove the record at `i`. `j` = (last index in the remaining array whose `date <= toDate`) + 1, or `0` if none.
**Options Considered**: 1. Re-sort the whole history by date. 2. Positional insert (above).
**Decision**: Option 2.
**Rationale**: On ascending input the result is ascending and the record lands after the target date's last record (SPEC FR-2). Inverted input exists in practice (`session.ts:92` has no validation, `evaluate.ts:161` appends, `finish.ts:283,304` stale drafts); the rule adds no new inversion behind the moved record and leaves existing ones in place. `sort()` rejected: it reorders other records, changes judging, and breaks FR-4.

### AD-4: Anchor math (pinned)
`lo = min(i,j)`, `hi = max(i,j)`. Anchor `a` is crossed exactly when `lo < a <= hi`. `i === j` crosses nothing. A crossed anchor becomes `a-1` when `i<j`, `a+1` when `j<i`. Others unchanged. An anchor means "index >= a is in scope" (`progress.ts:94,98`; `proposal.ts:53` via `effectiveFloorIndex`, `proposal.ts:104`).

| Direction | Anchor a | In scope before -> after | New anchor | Own-progression anchor |
|-----------|----------|--------------------------|------------|------------------------|
| forward i<j | a <= i (incl a=i) | yes -> yes | a | allowed |
| forward i<j | a = i+1 | no -> yes | i | reject |
| forward i<j | a = j | no -> yes | j-1 | reject |
| forward i<j | a = j+1 (incl a=n when j=n-1) | no -> no | a | allowed |
| backward j<i | a = j (incl a=0) | yes -> yes | j | allowed |
| backward j<i | a = j+1 | yes -> no | j+2 | reject |
| backward j<i | a = i | yes -> no | i+1 | reject |
| backward j<i | a > i | no -> no | a | allowed |

(Rows list representative boundary anchors; every anchor satisfying `lo < a <= hi` is crossed, every other is unchanged.)

- Own anchor: rejected (`crosses-adjustment`) only when the moved record is non-free and its own progression's anchor is crossed. A free record never rejects; its progression's anchor shifts like any other.
- Absent `adjustedAtSessionIndex` stays absent; an absent key stays absent (`steps.ts:54`).
- `crosses-same-progression`: for a non-free moved record, any non-free record of the same progression at old indices `(i,j]` forward or `[j,i)` backward. Free records never block; consolidation records do.
- FR-4 sufficiency: other progressions' judged order never changes; the moved progression's is unchanged because of rejection; setback+1 (`proposal.ts:101`) is recomputed from the array; `steps` is never written. Date-based `floorDate` counting changes only for a moved record crossing a stint boundary, accepted in SPEC Assumptions. `adjustedAtSessionIndex` is the only stored history index.
- Evidence: brute force over 388,800 cases gave 0 FR-4 failures and 0 wrongful rejections with the exclusive `lo < a` form; the inclusive `j <= a` form wrongly rejected 13,765.

### AD-5: Pure, non-mutating
`moveRecordDate` builds a new history, `{...record, date: toDate}`, and `...state`. `records.ts` imports only `./date.ts` and `./types.ts` with relative `.ts` paths (domain convention, `structure.test.ts`).

### AD-6: `recordIndices` on the day view model
Add `recordIndices: number[]` to the `DayRow` interface (`dayList.ts:20-35`), aligned with `review.performed`, computed in `buildDayRows` (~`dayList.ts:50-57`) as history indices where `r.date === date` (same filter as `src/lib/domain/calendar.ts:88`, `dayList.ts:83`).
**Rejected**: `history.indexOf(r)` in the component (depends on `$state` proxy identity).

### AD-7: RecordMoveForm component
`src/lib/ui/history/RecordMoveForm.svelte` (new). Props `{ date: IsoDate; recordIndex: number; today: IsoDate; onMove: (recordIndex: number, toDate: IsoDate) => MoveRecordResult }`. Local `$state`: `open`, `toDate`, `error: MoveRecordRejection | null`. `toDate` is seeded to `date` in the open handler (no `$effect`). Success or cancel sets `open = false`, `error = null` (required because the `{#each ...(i)}` key at `DayRow.svelte:136` reuses instances). Collapse is CSS-only: `data-record-move-form={open ? 'open' : 'closed'}` with `[data-record-move-form='closed'] { display: none }` (precedents `ExerciseCard.svelte:419`, `settings/+page.svelte:396-405`). The trigger button is hidden by CSS while open. The error element uses `{#if}` (`ImportDialog.svelte:124`, `FreeExerciseForm.svelte:113`) with `data-record-move-error={error}`.

### AD-8: Rejection messages
An exhaustive `switch` inside the component, no `default`, returning a string so `pnpm check` fails on a missing case (pattern `statusLabel`, `DayRow.svelte:21-28`).
- invalid-index: 기록을 찾을 수 없습니다.
- invalid-date: 날짜가 올바르지 않습니다.
- future: 미래 날짜로는 옮길 수 없습니다.
- same-date: 지금과 같은 날짜입니다.
- crosses-same-progression: 같은 종목의 다른 기록을 건너뛸 수 없습니다.
- crosses-adjustment: 이 종목의 단계 조정 시점을 건너뛸 수 없습니다.

### AD-9: Handler lives in HistoryView
`HistoryView` calls `moveRecordDate(appState, index, toDate, today)` and `appStateStore.apply(r.state)` when `r.ok`, then returns `r`. Store import as `ExportBar.svelte:25,79`: `import { appState as appStateStore } from '$lib/ui/state/state.svelte'`. `today` comes from `todayClock.today` at `src/routes/history/+page.svelte:29`; the route file is not modified. `onMove` and `today` pass HistoryView -> DayList -> DayRow -> RecordMoveForm; each has one caller (`DayList.svelte:19`, `HistoryView.svelte:75`), so required props are safe.

### AD-10: No component-mount tests
No precedent exists and `vitest.config.ts` is not set up for it. Logic is covered by unit tests; UI wiring by code-validator reading, `pnpm check`, and an orchestrator browser check.

### Known limitation (follow-up, not in this work)
Stale-draft recording can itself produce an inverted `history` (`finish.ts:283,304`); that is not fixed here. AD-3 handles inverted input, and the SPEC's ordering guarantee (NFR-1, FR-2) holds relative to the input: ascending in gives ascending out; inverted in is never made worse behind the moved record. A follow-up should address the inversion at recording time.

---

## Data Model

### Entity: AppState (unchanged, schema envelope v5)
```
AppState.history: SessionRecord[]       // date ascending (engine contract, importJson.ts:45)
SessionRecord.date: IsoDate             // the only field moveRecordDate changes
AppState.steps[progression].adjustedAtSessionIndex?: number   // history index anchor, shifted by AD-4
```

### Entity: MoveRecordResult (new, see AD-1)

### Entity: DayRow (extended, AD-6)
```
DayRow.recordIndices: number[]   // aligned with review.performed; history indices
```

### Relationships
```
DayRow.recordIndices[k] -> state.history[...] === DayRow.review.performed[k]
RecordMoveForm(recordIndex) -> HistoryView.onMove -> moveRecordDate -> appState.apply
```

No stored-structure change, no migration (SPEC Data Migration: Not applicable).

---

## File Structure

### Files to Create
```
src/lib/domain/records.ts                      # moveRecordDate, MoveRecordResult, MoveRecordRejection
src/lib/ui/history/RecordMoveForm.svelte       # per-session move form
tests/unit/records.test.ts                     # domain unit tests
```

### Files to Modify
```
src/lib/domain/index.ts                        # export moveRecordDate and types (lines ~33-35)
src/lib/ui/history/dayList.ts                  # DayRow.recordIndices (20-35, 50-63)
src/lib/ui/history/DayRow.svelte               # props, render form per session li (15-19, 136-155)
src/lib/ui/history/DayList.svelte              # pass onMove, today (10-14, 19)
src/lib/ui/history/HistoryView.svelte          # handler, pass props (11-17, 48-50, 75)
tests/unit/history-dayList.test.ts             # recordIndices tests (108-146)
tests/unit/history-roundtrip.test.ts           # move + export/import round trip (27-31)
CLAUDE.md                                      # exception sentence (155-157), hook list (after 127), 0.5.1 document-map row
```

---

## Phase Overview

| Phase | Description | Requirements | Status | Dependencies |
|-------|-------------|--------------|--------|--------------|
| 1 | Domain function `moveRecordDate` and its tests | FR-2, FR-4, NFR-1, NFR-3 | Not Started | - |
| 2 | History tab UI, view model, wiring, docs hooks | FR-1, FR-3, FR-5, NFR-2, NFR-4 | Not Started | Phase 1 |

FR-3 is split: the domain half (rejection reasons) is built and tested in Phase 1; the requirement is completed in Phase 2 (UI shows each reason, nothing applied on rejection).

**Status values**: `Not Started`, `In Progress`, `Complete`, `Skipped` (validation failed after the attempt limit in `_contract.md`; see the phase's validator report), `Blocked` (waiting on a user decision or an external dependency; the reason is in the phase's PLAN Notes).

---

## Phase Dependencies

```
Phase 1 ──→ Phase 2
```

---

## Risk Mitigation

### Risk 1: Moving a record silently changes judging
**Impact**: High
**Mitigation**: AD-4 anchor correction and rejections; table-driven and exhaustive FR-4 tests using the real `stepStreak` and `maintenanceCount`.

### Risk 2: Off-by-one at anchor boundaries (a=0, a=n, a=i, a=j)
**Impact**: High
**Mitigation**: The exclusive `lo < a <= hi` form is pinned by brute force; Phase 1 tests cover every AD-4 row explicitly.

### Risk 3: No component-mount tests (AD-10)
**Impact**: Medium
**Mitigation**: View-model logic in `dayList.ts` is unit-tested; code-validator reads the wiring; orchestrator verifies in a real browser against `pnpm build && pnpm preview` before release.

### Risk 4: Inverted history from stale-draft recording
**Impact**: Low
**Mitigation**: AD-3 is defined on inverted input and tested; root cause left to a follow-up (Known limitation).

---

## Completion Criteria

Overall feature is complete when:
- [ ] All phases marked Complete
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Code reviewed

---

## Next Steps

1. ⏳ Phase 1: implement `records.ts` and its tests
2. Phase 2: view model, `RecordMoveForm`, wiring, CLAUDE.md hooks and document map
3. Orchestrator browser verification, then release 0.5.1

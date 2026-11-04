# Phase 1: move-record-date

## Objective

Add the pure domain function `moveRecordDate(state, recordIndex, toDate, today)` that moves one record to another date, repositions it (GLOBAL AD-3), corrects shifted `adjustedAtSessionIndex` anchors (AD-4), and returns a `MoveRecordResult` (AD-1) with a rejection reason for each invalid or judging-changing move. Pinned decisions: GLOBAL.md AD-1 to AD-5. This phase builds the domain half of FR-3; Phase 2 completes FR-3 in the UI.

## Requirements

- FR-2
- FR-4
- NFR-1
- NFR-3

Note: FR-3 domain half built here; completed in Phase 2 (see GLOBAL.md).

---

## Prerequisites

- None (first phase).
- Read GLOBAL.md AD-1 to AD-5 before starting; the anchor table in AD-4 is exact.

---

## Scope

### In Scope
- New `src/lib/domain/records.ts` with `moveRecordDate`, `MoveRecordResult`, `MoveRecordRejection`.
- Export from `src/lib/domain/index.ts`.
- Unit tests in `tests/unit/records.test.ts`; an export/import round-trip case in `tests/unit/history-roundtrip.test.ts`.
- CLAUDE.md exception sentence update.

### Out of Scope
- Any UI, view model, or component (Phase 2).
- Any other domain file; `types.ts` is untouched; `CURRENT_SCHEMA_VERSION` unchanged.
- Fixing inverted history at recording time (GLOBAL Known limitation).

---

## Instructions

### Step 1: Create records.ts

Create `src/lib/domain/records.ts`. Imports only `./date.ts` (for `addDays`) and `./types.ts`, relative paths with `.ts`; no `$lib`, no `Date.now`, no `new Date` (`tests/unit/structure.test.ts` enforces the import rules; it has no clock check, so `tests/unit/records.test.ts` checks the clock).

**Files**: `src/lib/domain/records.ts`

**Action**: Define the two exported types exactly as GLOBAL AD-1. Implement `moveRecordDate` applying checks in the AD-2 order, first failure wins:
1. `invalid-index` for non-integer, negative, or `>= history.length`.
2. `invalid-date` when `toDate` fails `^\d{4}-\d{2}-\d{2}$` or `addDays(toDate, 0) !== toDate`.
3. `future` when `toDate > today`.
4. `same-date` when it equals the record's current date.
5. `crosses-same-progression`, 6. `crosses-adjustment` after computing `j` (Step 2).

### Step 2: Position and anchor computation

**Files**: `src/lib/domain/records.ts`

**Action**:
- Compute `j` by AD-3 on the history with the record at `i` removed: last remaining index with `date <= toDate`, plus one; `0` if none. Do not sort.
- Compute `lo`, `hi`. If `i !== j`, `crosses-same-progression`: for a non-free moved record, reject when any non-free record of the same progression lies at old indices `(i, j]` (forward) or `[j, i)` (backward). Free records never block; consolidation records do. A free moved record never rejects here.
- `crosses-adjustment`: reject only when the moved record is non-free and its own progression's anchor `a` satisfies `lo < a <= hi`.
- Build the new history: remove, then insert `{...record, date: toDate}` at `j`. Only `date` changes; `completedAt`, `promotedTo`, `blockedBy` and the rest are copied.
- Build the new top-level `adjustedAtSessionIndex` (not under `steps`): for every progression whose anchor `a` satisfies `lo < a <= hi` (and `i !== j`), write `a-1` when `i<j`, `a+1` when `j<i`. Leave all others unchanged. Where `adjustedAtSessionIndex` is absent, do not add the key (`steps.ts:49-51`).
- Return `{ ok: true, state: {...state, history, adjustedAtSessionIndex} }`. Never mutate the input (AD-5). Do not write `steps`; only anchor shifts change.

### Step 3: Export from index

**Files**: `src/lib/domain/index.ts`

**Action**: Add the `moveRecordDate` value export and the two types as type exports, next to the existing export groups (around lines 33-35; type exports follow the `GateResult` precedent at line 4). No other domain file changes: `git diff --stat -- src/lib/domain` must list only `records.ts` and `index.ts`.

### Step 4: Unit tests

**Files**: `tests/unit/records.test.ts` (new), `tests/unit/history-roundtrip.test.ts`

**Action**: Write `records.test.ts` using `catalog`, `stateAt`, `rec` from `tests/unit/helpers.ts:12,18,28`, fixed dates only. Cover every row of `PHASE_1_TEST.md`. Include a table-driven test for every AD-4 row (a=0 with j=0, a=n, a=i, a=j), computing `stepStreak` and `maintenanceCount` with the real functions, and an exhaustive test over a small fixture (all records, all anchors, all i/j targets, dates spread so each target position is reachable) asserting that every accepted move leaves `stepStreak` for all progressions, `state.steps` (never touched by the move), and `maintenanceCount` equal. In `history-roundtrip.test.ts` (near lines 27-31) add a case: after moves on ascending input, export then `parseImport` returns `ok: true` and deep-equal state.

### Step 5: CLAUDE.md exception sentence

**Files**: `CLAUDE.md`

**Action**: In the "도메인 계층 불가침" paragraph (lines ~155-157), extend the exception sentence that lists 0.5.0's scope so it also states the 0.5.1 scope: `records.ts` 신설 and the `index.ts` export addition only; existing domain files unchanged. Edit in place; keep the 0.5.0 text.

---

## Implementation Notes

### Anchor semantics
An anchor `a` means history indices `>= a` are in the progression's judging scope. Crossed means `lo < a <= hi` exactly (exclusive low, inclusive high). The inclusive `j <= a` variant is wrong (13,765 wrongful rejections in the brute force).

### Inverted input
With input like `[d10, d9]`, moving the d9 record to `d11` or `d10` follows AD-3 literally; assert FR-4 still holds and that no global sort happened (other records keep relative order).

### Free and consolidation records
Free records never block and never reject but their progression's anchor shifts like any other. Consolidation records are non-free and block.

---

## Completion Checklist

- [x] `records.ts` exports `moveRecordDate(state, recordIndex, toDate, today)` and the two types; `index.ts` re-exports; no other domain file differs: verified in records.ts:38,86; index.ts:36
- [x] Imports are relative with `.ts`, no `$lib`, no `Date.now` / `new Date`: verified in records.ts:1-2
- [x] All six reason codes are returned in the AD-2 order; on rejection `ok: false` and the input state is unchanged: verified in records.ts:42-68
- [x] Invalid inputs -1, `history.length`, 1.5, NaN, `''`, `2026-2-3`, `2026-02-30` are rejected: verified in records.test.ts:197,206
- [x] Success changes only the moved record's `date`; `completedAt`, `promotedTo`, `blockedBy` preserved; input not mutated; other state fields preserved: verified in records.ts:72-73; records.test.ts:118
- [x] Position follows AD-3 (after the target date's last record, forward and backward; `i === j` changes only the date): verified in records.ts:24-29,52,72
- [x] Anchors shift per the AD-4 table, using exclusive `lo < a <= hi`; absent `adjustedAtSessionIndex` stays absent: verified in records.ts:56,76-84; records.test.ts:343,389
- [x] `crosses-adjustment` applies only to a non-free moved record's own anchor; `crosses-same-progression` ignores free records and counts consolidation records: verified in records.ts:59-68
- [x] Table-driven AD-4 test and exhaustive FR-4 test exist with real `stepStreak` / `maintenanceCount`: verified in records.test.ts:343,443
- [x] Inverted-input cases `[d10, d9]` covered: verified in records.test.ts:156-176
- [x] Ascending order kept after moves; export then `parseImport` round trip deep-equal; `CURRENT_SCHEMA_VERSION` unchanged: verified in history-roundtrip.test.ts:70, storage.test.ts:388
- [x] CLAUDE.md exception sentence names the 0.5.1 scope: verified in CLAUDE.md:157-158

---

## Verification

### Manual Verification
```bash
pnpm test
pnpm check
git diff --stat -- src/lib/domain
```

### Expected Output
```
tests pass; svelte-check 0 errors;
src/lib/domain/index.ts and src/lib/domain/records.ts only
```

---

## Notes

- Brute-force reference: 388,800 cases, 0 FR-4 failures, 0 wrongful rejections with the exclusive form.
- Date-based `floorDate` counting can change when the moved record crosses a stint boundary; accepted in SPEC Assumptions.

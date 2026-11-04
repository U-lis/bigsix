# Phase 1: Test Matrix

| Behavior | FR | Partition | Layer | Test ref | Pinned line |
|----------|----|-----------|-------|----------|-------------|
| Moving a record to an earlier date (e.g. today to yesterday) changes only its `date`, keeps the array ascending, and leaves input unmutated | FR-2 | normal | unit | - | - |
| Moving into a date that has records places the record after that date's last record, forward and backward | FR-2 | boundary | unit | - | - |
| `i === j` changes the date only; order and anchors unchanged | FR-2 | boundary | unit | - | - |
| `completedAt`, `promotedTo`, `blockedBy` and other state fields are preserved on success | FR-2 | normal | unit | - | - |
| Inverted input `[d10,d9]`: moving d9 to d11 or d10 follows the position rule with no global sort | FR-2 | boundary | unit | - | - |
| Out-of-range or non-integer index (-1, length, 1.5, NaN) returns `invalid-index`, state unchanged | FR-3 | invalid | unit | - | - |
| Malformed date (`''`, `2026-2-3`, `2026-02-30`) returns `invalid-date`, state unchanged | FR-3 | invalid | unit | - | - |
| `toDate` after `today` returns `future` | FR-3 | boundary | unit | - | - |
| `toDate` equal to the record's date returns `same-date` | FR-3 | boundary | unit | - | - |
| Crossing another non-free record of the same progression (incl. consolidation) returns `crosses-same-progression` | FR-3 | boundary | unit | - | - |
| Crossing only a free record is allowed | FR-3 | boundary | unit | - | - |
| Non-free record crossing a free record of its own progression is allowed | FR-3 | boundary | unit | - | - |
| Crossing the moved record's own progression anchor returns `crosses-adjustment` | FR-3 | boundary | unit | - | - |
| Check order: a case failing several checks returns the earliest reason | FR-3 | boundary | unit | - | - |
| Crossing another progression's anchor shifts that anchor (a-1 forward, a+1 backward); its `stepStreak` is unchanged | FR-4 | boundary | unit | - | - |
| Every AD-4 table row (a=0 with j=0, a=n, a=i, a=j, a=i+1, a=j+1) gives the stated new anchor and allow/reject | FR-4 | boundary | unit | - | - |
| Free record crossing a same-progression record and its own anchor is allowed, anchor shifted, `stepStreak` equal | FR-4 | boundary | unit | - | - |
| Absent `adjustedAtSessionIndex` stays absent after a move | FR-4 | boundary | unit | - | - |
| Moving a `promotedTo` record leaves `steps` and `stepStreak` unchanged | FR-4 | normal | unit | - | - |
| Exhaustive: for all records, anchors, i/j over a small fixture, every accepted move keeps `stepStreak` for all progressions, `steps`, and `maintenanceCount` equal | FR-4 | normal | unit | - | - |
| Export then `parseImport` after moves returns `ok: true`, deep-equal; `CURRENT_SCHEMA_VERSION` unchanged | NFR-1 | normal | integration | - | - |
| `records.ts` has relative `.ts` imports, no `$lib`, no system-time call | NFR-3 | normal | unit | - | - |

---

## Mock / Stub Requirements

- None; tests use real `stepStreak`, `maintenanceCount`, `parseImport`, and the fixtures `catalog`, `stateAt`, `rec` in `tests/unit/helpers.ts:12,18,28` with fixed dates.

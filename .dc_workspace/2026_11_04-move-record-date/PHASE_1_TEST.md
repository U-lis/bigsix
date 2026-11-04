# Phase 1: Test Matrix

| Behavior | FR | Partition | Layer | Test ref | Pinned line |
|----------|----|-----------|-------|----------|-------------|
| Moving a record to an earlier date (e.g. today to yesterday) changes only its `date`, keeps the array ascending, and leaves input unmutated | FR-2 | normal | unit | `records.test.ts:61` | `records.ts:72` |
| Moving into a date that has records places the record after that date's last record, forward and backward | FR-2 | boundary | unit | `records.test.ts:81`, `records.test.ts:93` | `records.ts:26` |
| `i === j` changes the date only; order and anchors unchanged | FR-2 | boundary | unit | `records.test.ts:104` | `records.ts:56` |
| `completedAt`, `promotedTo`, `blockedBy` and other state fields are preserved on success | FR-2 | normal | unit | `records.test.ts:118` | `records.ts:72`, `records.ts:73` |
| Inverted input `[d10,d9]`: moving d9 to d11 or d10 follows the position rule with no global sort | FR-2 | boundary | unit | `records.test.ts:156`, `records.test.ts:162`, `records.test.ts:168`, `records.test.ts:176` | `records.ts:26`, `records.ts:28`, `records.ts:72` |
| Out-of-range or non-integer index (-1, length, 1.5, NaN) returns `invalid-index`, state unchanged | FR-3 | invalid | unit | `records.test.ts:197` | `records.ts:42` |
| Malformed date (`''`, `2026-2-3`, `2026-02-30`) returns `invalid-date`, state unchanged | FR-3 | invalid | unit | `records.test.ts:206` | `records.ts:20`, `records.ts:45` |
| `toDate` after `today` returns `future` | FR-3 | boundary | unit | `records.test.ts:214` | `records.ts:46` |
| `toDate` equal to the record's date returns `same-date` | FR-3 | boundary | unit | `records.test.ts:220` | `records.ts:49` |
| Crossing another non-free record of the same progression (incl. consolidation) returns `crosses-same-progression` | FR-3 | boundary | unit | `records.test.ts:224`, `records.test.ts:232`, `records.test.ts:243`, `records.test.ts:251` | `records.ts:61`, `records.ts:62`, `records.ts:64` |
| Crossing only a free record is allowed | FR-3 | boundary | unit | `records.test.ts:259` | `records.ts:62` |
| Non-free record crossing a free record of its own progression is allowed | FR-3 | boundary | unit | `records.test.ts:268` | `records.ts:62` |
| Crossing the moved record's own progression anchor returns `crosses-adjustment` | FR-3 | boundary | unit | `records.test.ts:352` | `records.ts:67` |
| Check order: a case failing several checks returns the earliest reason | FR-3 | boundary | unit | `records.test.ts:286`, `records.test.ts:289`, `records.test.ts:292`, `records.test.ts:296`, `records.test.ts:299` | `records.ts:42`, `records.ts:45`, `records.ts:46`, `records.ts:49`, `records.ts:64` |
| Crossing another progression's anchor shifts that anchor (a-1 forward, a+1 backward); its `stepStreak` is unchanged | FR-4 | boundary | unit | `records.test.ts:343` | `records.ts:78`, `records.ts:81` |
| Every AD-4 table row (a=0 with j=0, a=n, a=i, a=j, a=i+1, a=j+1) gives the stated new anchor and allow/reject | FR-4 | boundary | unit | `records.test.ts:343`, `records.test.ts:352` | `records.ts:56`, `records.ts:67`, `records.ts:81` |
| Free record crossing a same-progression record and its own anchor is allowed, anchor shifted, `stepStreak` equal | FR-4 | boundary | unit | `records.test.ts:365`, `records.test.ts:374` | `records.ts:59`, `records.ts:81` |
| Absent `adjustedAtSessionIndex` stays absent after a move | FR-4 | boundary | unit | `records.test.ts:389`, `records.test.ts:395` | `records.ts:76` |
| Moving a `promotedTo` record leaves `steps` and `stepStreak` unchanged | FR-4 | normal | unit | `records.test.ts:414` | `records.ts:72` |
| Exhaustive: for all records, anchors, i/j over a small fixture, every accepted move keeps `stepStreak` for all progressions, `steps`, and `maintenanceCount` equal | FR-4 | normal | unit | `records.test.ts:443` | `records.ts:64`, `records.ts:67`, `records.ts:81` |
| Export then `parseImport` after moves returns `ok: true`, deep-equal; `CURRENT_SCHEMA_VERSION` unchanged | NFR-1 | normal | integration | `history-roundtrip.test.ts:70`, `storage.test.ts:388` | `records.ts:72`, `records.ts:56` |
| `records.ts` has relative `.ts` imports, no `$lib`, no system-time call | NFR-3 | normal | unit | `structure.test.ts:183`, `records.test.ts:499`, `records.test.ts:509` | `records.ts:1`, `records.ts:46` |

---

## Mock / Stub Requirements

- None; tests use real `stepStreak`, `maintenanceCount`, `parseImport`, and the fixtures `catalog`, `stateAt`, `rec` in `tests/unit/helpers.ts:12,18,28` with fixed dates.

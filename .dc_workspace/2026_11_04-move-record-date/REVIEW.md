# Review: move-record-date

## Phase 1

BLOCKERS: 0. Correctness, scope, safety checked by hand trace against AD-2, AD-3, AD-4.

| # | Severity | Location | Finding | Disposition |
|---|----------|----------|---------|-------------|
| 4 | Minor | src/lib/domain/records.ts:18 | Comments are English; other domain files are Korean | Convert to Korean in Phase 2 to match the file's neighbours |
| 5 | Minor | PHASE_1_PLAN:44,77 | PLAN wording disagrees with code | Fix in Phase 2 |
| 6 | Major | tests/unit/records.test.ts:174 | Inverted-input tests never reposition, so AD-3's last-index rule is unpinned | Add a real reposition case in Phase 2 |
| 7 | Minor | tests/unit/history-roundtrip.test.ts:99 | Schema version assertion repeats existing pins | Remove in Phase 2 |
| 8 | Minor | tests/unit/records.test.ts:503 | Source-text test overlaps structure.test.ts | Keep only the clock check, in Phase 2 |
| 9 | Minor | tests/unit/records.test.ts:267 | Test overlap | Remove in Phase 2 |

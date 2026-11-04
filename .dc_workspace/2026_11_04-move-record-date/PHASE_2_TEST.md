# Phase 2: Test Matrix

| Behavior | FR | Partition | Layer | Test ref | Pinned line |
|----------|----|-----------|-------|----------|-------------|
| `buildDayRows` gives `recordIndices` so `review.performed[k] === state.history[recordIndices[k]]` for every row | FR-1 | normal | unit | `history-dayList.test.ts:175`, `:189`, `:200`, `:212` | `dayList.ts:62` |
| Multiple records on the same day get distinct, ordered `recordIndices` | FR-1 | boundary | unit | `history-dayList.test.ts:175` | `dayList.ts:62` |
| A day with only a no-stint free record still has a correct `recordIndices` | FR-1 | boundary | unit | `history-dayList.test.ts:189` | `dayList.ts:62` |
| Inverted history still maps each performed entry to its true history index | FR-1 | boundary | unit | `history-dayList.test.ts:200` | `dayList.ts:62` |
| Open the date input, then 취소: form closes, error cleared, `onMove` not called, state unchanged | FR-1 | normal | scenario | no automated test (AD-10): reading, `pnpm check`, browser check | `RecordMoveForm.svelte:46-51`, `:69` |
| Each session row renders the form with its own `recordIndex` and the row's date | FR-1 | normal | scenario | no automated test (AD-10): reading, `pnpm check`, browser check | `DayRow.svelte:160-161` |
| A future-date rejection leaves the state unchanged and shows the matching message | FR-3 | boundary | scenario | no automated test (AD-10): reading, `pnpm check`, browser check; reason from `records.test.ts:214` | `RecordMoveForm.svelte:31`, `:55`, `:66`; `HistoryView.svelte:58-62` |
| An invalid-index rejection leaves the state unchanged and shows the matching message | FR-3 | invalid | scenario | no automated test (AD-10): reading, `pnpm check`, browser check; reason from `records.test.ts:197` | `RecordMoveForm.svelte:29`, `:55`, `:66`; `HistoryView.svelte:58-62` |
| A successful move calls `appState.apply` with the new state; the form closes | FR-5 | normal | scenario | no automated test (AD-10): reading, `pnpm check`, browser check | `HistoryView.svelte:60-61`; `DayRow.svelte:160` |
| After a successful move, `reviewDay` shows the source day and target day updated | FR-5 | normal | unit | `history-dayList.test.ts:212` | `dayList.ts:62`, `records.ts:72` |
| Hooks present, 44px min-height, tokens only, no hex, runes only, factual text, CSS-only collapse | NFR-2 | normal | scenario | no automated test (AD-10): reading, `pnpm check`, browser check | `RecordMoveForm.svelte:60-73`, `:83-86`, `:100`, `:121` |

---

## Mock / Stub Requirements

- No component-mount tests (GLOBAL AD-10). Rows marked scenario are verified by code-validator reading, `pnpm check`, and the orchestrator's real-browser check against `pnpm build && pnpm preview`; rows marked unit run in Vitest against `dayList.ts` and domain functions.

---

## Real-browser verification (orchestrator's run)

The scenario rows above were verified in real Chrome against `pnpm build && pnpm preview`: 34/34 checks passed. Covered: 3 records with 2 open forms (the `moveGeneration` remount), focus handling, 44px touch targets, no horizontal scroll at 360px, rejection of future date, same date, crossing a same-progression record, and crossing an adjustment, and persistence after reload. This result comes from the orchestrator's run, not from the code-validator.

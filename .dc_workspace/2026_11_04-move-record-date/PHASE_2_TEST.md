# Phase 2: Test Matrix

| Behavior | FR | Partition | Layer | Test ref | Pinned line |
|----------|----|-----------|-------|----------|-------------|
| `buildDayRows` gives `recordIndices` so `review.performed[k] === state.history[recordIndices[k]]` for every row | FR-1 | normal | unit | - | - |
| Multiple records on the same day get distinct, ordered `recordIndices` | FR-1 | boundary | unit | - | - |
| A day with only a no-stint free record still has a correct `recordIndices` | FR-1 | boundary | unit | - | - |
| Inverted history still maps each performed entry to its true history index | FR-1 | boundary | unit | - | - |
| Open the date input, then 취소: form closes, error cleared, `onMove` not called, state unchanged | FR-1 | normal | scenario | - | - |
| Each session row renders the form with its own `recordIndex` and the row's date | FR-1 | normal | scenario | - | - |
| A future-date rejection leaves the state unchanged and shows the matching message | FR-3 | boundary | scenario | - | - |
| An invalid-index rejection leaves the state unchanged and shows the matching message | FR-3 | invalid | scenario | - | - |
| A successful move calls `appState.apply` with the new state; the form closes | FR-5 | normal | scenario | - | - |
| After a successful move, `reviewDay` shows the source day and target day updated | FR-5 | normal | unit | - | - |
| Hooks present, 44px min-height, tokens only, no hex, runes only, factual text, CSS-only collapse | NFR-2 | normal | scenario | - | - |

---

## Mock / Stub Requirements

- No component-mount tests (GLOBAL AD-10). Rows marked scenario are verified by code-validator reading, `pnpm check`, and the orchestrator's real-browser check against `pnpm build && pnpm preview`; rows marked unit run in Vitest against `dayList.ts` and domain functions.

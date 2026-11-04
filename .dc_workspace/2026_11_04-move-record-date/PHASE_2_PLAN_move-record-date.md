# Phase 2: move-record-date

## Objective

Add the History tab (day view) UI that lets the user move a session's date: extend the day view model with `recordIndices`, create `RecordMoveForm`, wire `onMove` and `today` through `HistoryView` -> `DayList` -> `DayRow`, apply successful results with `appState.apply`, show rejection reasons, and update CLAUDE.md. Pinned decisions: GLOBAL.md AD-6 to AD-10. This phase completes FR-3 (the rejection reasons from Phase 1 are shown to the user and nothing is applied on rejection).

## Requirements

- FR-1
- FR-3
- FR-5
- NFR-2
- NFR-4

---

## Prerequisites

- Phase 1 completed (`moveRecordDate`, `MoveRecordResult`, `MoveRecordRejection` exported from `$lib/domain`).
- Read GLOBAL.md AD-6 to AD-10 and CLAUDE.md "화면을 만들거나 고칠 때".

---

## Scope

### In Scope
- `recordIndices` in the day view model and its tests.
- `RecordMoveForm.svelte` and prop wiring through DayRow, DayList, HistoryView.
- CLAUDE.md hook list block and the 0.5.1 document-map row.

### Out of Scope
- Any change to `src/lib/domain/**` (Phase 1 is final) and to `src/routes/history/+page.svelte`.
- Component-mount tests (AD-10).
- Fixing inverted history at recording time.

---

## Instructions

### Step 1: View model recordIndices

**Files**: `src/lib/ui/history/dayList.ts`, `tests/unit/history-dayList.test.ts`

**Action**: Add `recordIndices: number[]` to the `DayRow` interface (lines 20-35), aligned with `review.performed`. Compute it in `buildDayRows` (lines ~50-63) as the history indices whose `r.date === date`, using the same filter as `src/lib/domain/calendar.ts:88` and `dayList.ts:83`, so `review.performed[k] === state.history[recordIndices[k]]`. Add tests near `history-dayList.test.ts:108-146` (see PHASE_2_TEST.md).

### Step 2: RecordMoveForm component

**Files**: `src/lib/ui/history/RecordMoveForm.svelte` (new)

**Action**: Create per AD-7: props `date`, `recordIndex`, `today`, `onMove`; local `$state` `open`, `toDate`, `error`. Elements with hooks: trigger button `data-record-move` with text 날짜 옮기기; form root `data-record-move-form` valued `open`/`closed` and collapsed by CSS (`display: none`), never `{#if}`; `input type="date"` `data-record-move-date` with `max={today}`; 옮기기 button `data-record-move-apply`; 취소 button `data-record-move-cancel`; error element `data-record-move-error={error}` rendered under `{#if}`. Opening seeds `toDate = date` in the click handler (no `$effect`). Apply calls `onMove(recordIndex, toDate)`; on `ok` the parent remounts all forms closed (`moveGeneration`); on rejection set `error` to the reason. Cancel closes, clears error, and does not call `onMove`. Message text comes from an exhaustive `switch` with no `default` (AD-8), following `statusLabel` at `DayRow.svelte:21-28`. Styling: all buttons and the date input at least 44px min-height, text labels only, colors from `app.css` tokens (no hex), runes only, factual text.

### Step 3: Render in DayRow

**Files**: `src/lib/ui/history/DayRow.svelte`

**Action**: Add `onMove` and `today` to the props (lines 15-19). In the session `li` (line 137), render `RecordMoveForm` between line 154 and `</li>` at 155, with `recordIndex={row.recordIndices[i]}` and `date={row.review.date}`. DayRow must not import the store or `moveRecordDate`; it only passes the callback up.

### Step 4: Pass through DayList

**Files**: `src/lib/ui/history/DayList.svelte`

**Action**: Add required props `onMove` and `today` (lines 10-14) and pass them to `DayRow` (line 19).

### Step 5: Handler in HistoryView

**Files**: `src/lib/ui/history/HistoryView.svelte`

**Action**: Add a `today` prop (lines 11-17) and a handler (near 48-50): call `moveRecordDate(appState, index, toDate, today)` from `$lib/domain`; when `r.ok`, call `appStateStore.apply(r.state)`; return `r`. Import the store as `import { appState as appStateStore } from '$lib/ui/state/state.svelte'` (as `ExportBar.svelte:25,79`). Pass `onMove` and `today` to `DayList` (line 75). `today` is already `todayClock.today` at `src/routes/history/+page.svelte:29`; do not modify the route file and do not call `todayClock` or any system time in new UI code.

### Step 6: CLAUDE.md

**Files**: `CLAUDE.md`

**Action**: After line 127 in the hook list, add a 0.5.1 block listing the six hooks: `data-record-move`, `data-record-move-form` (`'open'|'closed'`), `data-record-move-date`, `data-record-move-apply`, `data-record-move-cancel`, `data-record-move-error` (value: rejection reason). Add a document-map row for `.dc_workspace/2026_11_04-move-record-date/SPEC.md` (0.5.1, 기록 날짜 옮기기). Edit in place; keep existing rows and the 0.5.0 text.

---

## Implementation Notes

### Instance reuse
The `{#each ...(i)}` key at `DayRow.svelte:136` reuses component instances, so a successful move closes all open forms by remounting them (`moveGeneration` in HistoryView, `{#key}` in DayRow); otherwise a stale form state shows on the next record in that slot.

### Why indices, not indexOf
`$state` proxies break identity, so `history.indexOf(r)` is unreliable; use `recordIndices` (AD-6).

### Collapse
CSS-only collapse keeps hydration and focus stable (CLAUDE.md "접기는 CSS 로 한다"). The trigger is hidden by CSS while the form is open.

---

## Completion Checklist

- [x] `DayRow` view model has `recordIndices` aligned with `review.performed`: `DayRow` in `src/lib/ui/history/dayList.ts`, `buildDayRows` - verified in dayList.ts:39,62
- [x] Tests for same-day multiple records, a no-stint free record, inverted history, and `review.performed[k] === state.history[recordIndices[k]]`: `tests/unit/history-dayList.test.ts` - verified in history-dayList.test.ts:159-215
- [x] `RecordMoveForm` has hooks `data-record-move` (text 날짜 옮기기), `data-record-move-form` (open/closed), `data-record-move-date` (`type=date`, `max={today}`), `data-record-move-apply` (옮기기), `data-record-move-cancel` (취소), `data-record-move-error` (value = reason): `src/lib/ui/history/RecordMoveForm.svelte` - verified in RecordMoveForm.svelte:61-74 (trigger :74, form :61, date :64, error :67, cancel :70, apply :71)
- [x] Collapse is CSS-only; the form root is not inside `{#if}`: `src/lib/ui/history/RecordMoveForm.svelte` - verified in RecordMoveForm.svelte:61 (form root outside {#if}; only error under {#if} at :66-67; CSS collapse :84-87)
- [x] Cancel closes, clears error, and does not call `onMove`: `RecordMoveForm.svelte` cancel handler - verified in RecordMoveForm.svelte:46-51,69
- [x] Each session `li` renders the form with `recordIndex={row.recordIndices[i]}` and `date={row.review.date}`: `src/lib/ui/history/DayRow.svelte` - verified in DayRow.svelte:160-161 (inside `{#key moveGeneration}`)
- [x] `DayRow` does not import the store or `moveRecordDate`: `src/lib/ui/history/DayRow.svelte` - verified in DayRow.svelte:9-15 (no store or moveRecordDate import)
- [x] `HistoryView` calls `moveRecordDate` with the `today` prop and applies only when `ok`; no `todayClock` or system time in new UI code: `src/lib/ui/history/HistoryView.svelte` - verified in HistoryView.svelte:58-62
- [x] All six rejection reasons covered by an exhaustive `switch` without `default`; on rejection nothing is applied and the text shows: `RecordMoveForm.svelte`, `HistoryView.svelte` - verified in RecordMoveForm.svelte:27-36,55,66; HistoryView.svelte:58-62
- [x] 44px min-height, text labels, `app.css` tokens only, runes only, factual text: `RecordMoveForm.svelte` - verified in RecordMoveForm.svelte:83-135
- [x] CLAUDE.md hook list has the 0.5.1 block with six hooks after line 127, and the document map has the 0.5.1 row: `CLAUDE.md` - verified in CLAUDE.md:23,129-133

---

## Verification

### Manual Verification
```bash
pnpm test
pnpm check
grep -rnE '#[0-9a-fA-F]{3,6}\b' src --include='*.svelte'
```

### Expected Output
```
tests pass; svelte-check 0 errors;
hex grep shows only the +layout.svelte theme-color line
```

---

## Notes

- Real-browser verification is done by the orchestrator against `pnpm build && pnpm preview` before release, because there are no component-mount tests (AD-10). This is not a coder or code-validator item.
- Known limitation: stale-draft recording can invert `history`; handled by AD-3, not fixed here (follow-up).

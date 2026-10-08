# Phase 5: stale-and-boot

## 목표

StaleBanner 를 신설하고 `+page.svelte` 맨 위에 연결한다. `boot.ts` 와 `reset.ts` 의
`inProgress` 관련 코드를 새 API 에 맞게 갱신하고, `ExportBar` 의 가져오기 차단 조건을 확장한다.
FR-44, FR-45.4/5, EC-97/98 구현.

## 선행 조건

Phase 4 완료.

## 지침

### 1. `StaleBanner.svelte` 신설 (`src/lib/ui/session/StaleBanner.svelte`)

- `staleDrafts(inProgress.drafts, today)` 가 반환하는 날짜별 묶음이 있으면 표시한다.
- `data-stale-drafts` 속성 값: `YYYY-MM-DD`.
- 날짜별로 아래 두 버튼을 제공한다:
  - 「그 날짜로 기록」 — `data-stale-record`. 클릭 시 `inProgress.finish(state, catalog, nowIsoLocal, { kind: 'date', date })` 호출 후 결과 표시 (FR-44.2).
  - 「버리기」 — `data-stale-discard`. 2단 확인 후 그 날짜의 칸 전부를 `inProgress.discardDraft(key)` 로 제거 (FR-44.3).
- 답하기 전까지 오늘 칸과 섞이지 않는다 (FR-44.4): `+page.svelte` 에서 오늘 카드는
  `draft.startedAt === today` 인 칸만 렌더링한다.
- `isStaleStartedAt` 이 이미 제거됐음을 확인한다. `data-stale` 훅은 사용하지 않는다.

### 2. `+page.svelte` 갱신

- 기존 「이 세션은 {날짜} 세션입니다」 stale 안내를 `StaleBanner` 로 교체한다.
- 맨 위 컴포넌트 순서: `StaleBanner` → 오늘 계획 카드 목록 → `FinishBar` → `FreeExerciseForm`.
- 오늘 계획 카드 필터: `agenda` 의 각 `plan` 에 대해 `inProgress.getDraft(id, kind, today)` 로 오늘 칸만 바인딩한다.
  `startedAt < today` 인 칸은 `StaleBanner` 를 통해서만 접근 가능하다 (FR-44.4).

### 3. `boot.ts` 확인 및 정리

Phase 2 에서 `BootResult.inProgress` 타입이 `Record<string, SessionDraft> | null` 로 바뀌었음을 확인한다.
`tests/unit/boot.test.ts` 에 v4→v5 마이그레이션 경로 테스트를 추가한다.

### 4. `reset.ts` 갱신 (`src/lib/ui/state/reset.ts`)

- `inProgress.discard()` → `inProgress.discardAll()` 로 교체한다 (FR-45.5).
- 단일 칸 API(`discard()`)가 제거됐으므로 `discardAll()` 만 남아야 한다.

### 5. `ExportBar.svelte` 갱신 (`src/lib/ui/history/ExportBar.svelte`)

- `hasInProgress` 조건을 `Object.keys(inProgress.drafts).length > 0` 으로 교체한다 (FR-45.4).
- 칸이 하나라도 있으면 가져오기 버튼을 `disabled` 처리하고 `data-import-block="inprogress"` 를 붙인다.

## 완료 체크리스트

- [ ] `StaleBanner` 구현, `data-stale-drafts`, `data-stale-record`, `data-stale-discard` 훅 있음
- [ ] 「그 날짜로 기록」이 `scope: { kind: 'date', date }` 로 `finish` 를 호출함 (FR-44.2)
- [ ] 「버리기」가 2단 확인 후 해당 날짜 칸을 삭제함 (FR-44.3)
- [ ] `+page.svelte` 오늘 카드가 `startedAt === today` 인 칸만 보임 (FR-44.4)
- [ ] `reset.ts` 가 `discardAll()` 을 호출함 (FR-45.5)
- [ ] `ExportBar` 의 가져오기 차단 조건이 drafts 비어 있는지 검사함 (FR-45.4)
- [ ] `tests/unit/reset.test.ts` 통과
- [ ] `tests/unit/history-importJson.test.ts` 의 가져오기 차단 케이스 통과
- [ ] `pnpm check` 오류 0
- [ ] `pnpm test` 전부 통과 (베이스라인 920)

## 비고

- `data-stale` 훅과 `isStaleStartedAt` 함수가 코드 어디에도 남지 않아야 한다.
- StaleBanner 내 「버리기」 2단 확인은 `{#if}` 없이 CSS 로 단계를 토글한다 (CLAUDE.md 접기 규칙).

## 비고 (Phase 2 검증에서 추가)

### `staleDrafts` 키 파생

`staleDrafts(drafts, today)` 가 돌려주는 `Record<IsoDate, SessionDraft[]>` 의 각 원소에는
draft 키가 직접 포함되지 않는다. `StaleBanner` 가 「버리기」 (`discardDraft(key)`) 나
「그 날짜로 기록」 (`finish(..., { kind: 'date', date })`) 을 호출할 때 키가 필요하다.
키는 `draftKey(d.progressionId, d.kind)` 로 파생한다 — `draftKey` 는 `$lib/ui/state/storage` 에서
import 해 쓴다. `StaleBanner` 구현 시 이 파생을 사용하거나, 필요하다면 스토어에
`staleDraftEntries(today): { key: string; draft: SessionDraft }[]` getter 를 추가해도 된다.

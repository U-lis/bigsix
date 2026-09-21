# Phase 6 — 내보내기 (JSON + CSV)

**목표**
FR-26. 「JSON 내보내기」·「CSV 내보내기」 두 버튼이 실제 파일을 만든다.

## SPEC 참조

- FR-26.1~4: JSON · CSV 두 버튼. 파일 스키마와 22열 CSV. 파일명 `bigsix-YYYY-MM-DD.{json|csv}`.
- FR-26.5: `Blob` + `<a download>` → Web Share API fallback → 둘 다 안 되면 문구.
- FR-26.6: 내보내기는 상태를 바꾸지 않는다.
- EC-59: 진행 중 세션은 담지 않는다.
- EC-61: 둘 다 안 되면 문구로 알린다.
- EC-69: CSV 값의 쉼표·따옴표 인용 (RFC 4180).
- EC-70: 세트 0개 세션은 세트 없는 한 줄.

## 변경 파일

- `src/lib/ui/history/exportJson.ts`:
  - `interface ExportMeta { app; version; commit; exportedAt; schemaVersion }`.
  - `buildExportJson({ state, catalog, meta }): { meta; appState; catalog }` — 자세한 스키마는 GLOBAL (B.3).
  - `catalog` 는 종목 id → 한국어명 · steps 배열(n · nameKo · unit · perSide · beginner · intermediate · progression?/elite?).
- `src/lib/ui/history/exportCsv.ts`:
  - `interface CsvRow { ...22 columns as GLOBAL (B.4) }`.
  - `buildCsvRows(state, catalog): CsvRow[]` — history 를 순회. 세트마다 한 줄. 세트 0개 세션은 `set_index/value/set_rpe/target/target_mode` 빈 칸으로 한 줄 (EC-70).
  - `formatCsv(rows: CsvRow[]): string`:
    - 첫 문자 `﻿`.
    - 헤더 한 줄 (22개, 순서 고정).
    - 각 값에 RFC 4180 인용 (`,` · `"` · `\r` · `\n` 포함하면 `"..."` 감싸고 내부 `"` 는 `""`).
    - 줄 종결은 `\r\n` (RFC 4180 권장).
  - `stintAt`, `dayNumber`, `getProgram`, `getProgression`, `getStep` 은 `$lib/domain` 경유.
- `src/lib/ui/history/download.svelte.ts`:
  - `saveFile({ name, mime, content }): Promise<'downloaded' | 'shared' | 'unavailable'>`.
  - 시도 순서:
    1. `Blob` 생성 → `URL.createObjectURL` → `<a download={name}>` 를 body 에 붙여 클릭 → `revokeObjectURL`. 예외 없으면 `'downloaded'`.
    2. Blob 지원 없거나 `<a download>` 무시 감지되면 (`navigator.canShare?.({ files: [testFile] })` true 이면) `navigator.share({ files: [file] })` 로 넘김. 예외 없으면 `'shared'`.
    3. 둘 다 실패 시 `'unavailable'`.
- `src/lib/ui/history/ExportBar.svelte`:
  - 두 버튼 (「JSON 내보내기」/「CSV 내보내기」) — 아이콘 + 라벨. `data-export-json`, `data-export-csv`.
  - 눌렀을 때 `buildExportJson` / `buildExportCsv` → `formatCsv` 로 문자열 → `saveFile` 호출.
  - 결과 문구 (`saveFile` 반환값) 를 `data-export-status` 로 표시. `'unavailable'` 이면 「내려받기 · 공유가 모두 안 됩니다」 안내.
  - 아이콘: GLOBAL 「아이콘」 절 참조 — FA Free 우선, Lucide/Tabler fallback, 직접 그리기.
  - About 에 CC BY 4.0 표기 추가 (FA 채택 시).
- `src/lib/ui/history/HistoryView.svelte` — ExportBar 를 하단(UI-1 순서상 맨 아래)에 배치. Phase 4 에서 잡아둔 placeholder 자리 채움.
- `tests/unit/history-exportJson.test.ts` (신규).
- `tests/unit/history-exportCsv.test.ts` (신규).
- `tests/unit/history-download.test.ts` (신규, `// @vitest-environment happy-dom`).

## 커밋 경계 (4개)

1. `feat(history): 내보내기 JSON 조립` — exportJson.ts + tests.
2. `feat(history): 내보내기 CSV 조립` — exportCsv.ts + tests.
3. `feat(history): 파일 저장 얇은 층` — download.svelte.ts + tests.
4. `feat(history): 내보내기 버튼 배선` — ExportBar + HistoryView.

## 완료 기준

- 「JSON 내보내기」 → `bigsix-YYYY-MM-DD.json` 다운로드.
- 「CSV 내보내기」 → `bigsix-YYYY-MM-DD.csv` 다운로드. UTF-8 BOM 시작.
- 감지 실패 환경에서 문구 표시 (EC-61).
- 상태 변경 없음 (state 참조 동등 테스트).
- 아이콘 라이브러리 결정 · 라이선스 표기 완료.
- `pnpm check` 0/0, `pnpm test` 전부 통과.

## 임시 배포

이 페이즈에 포함하지 않는다.

## Completion Checklist

### exportJson.ts (FR-26.2, EC-59)
- [x] `ExportMeta` 인터페이스: `app`, `version`, `commit`, `exportedAt`, `schemaVersion` — GLOBAL B.3 meta 필드와 정확히 일치. Verified in `src/lib/ui/history/exportJson.ts:30-36`.
- [x] `ExportFile` 최상위 구조 `{ meta, appState, catalog }` — GLOBAL B.3 와 일치. Verified in `exportJson.ts:103-107`.
- [x] `CatalogProjection.progressions[id]` → `{ nameKo, steps[] }`. `StepProjection`: `n, nameKo, unit, perSide, beginner, intermediate, progression?, elite?` — GLOBAL B.3 단계 필드와 정확히 일치. Verified in `exportJson.ts:44-53`.
- [x] `buildExportJson({ state, catalog, meta })` — `state` 참조 그대로 담음 (불변, FR-26.6). Verified in `exportJson.ts:118-128`.
- [x] 진행 중 세션 배제 — 함수 시그니처가 `inProgress` 를 받지 않음 (EC-59). Verified in `exportJson.ts:118`.
- [x] 종목 6개(`pushup, squat, pullup, legraise, bridge, hspu`) — `BIG_SIX` 상수. Verified in `exportJson.ts:65-67`.
- [x] `tests/unit/history-exportJson.test.ts` 신규 작성 (14개 테스트 케이스). Verified by `pnpm test` 774 passed.

### exportCsv.ts (FR-26.3, EC-69, EC-70)
- [x] `CSV_HEADERS` 22열, 순서 GLOBAL B.4 와 정확히 일치: `date, completed_at, program, day_number, progression, step, performed_step, step_name, unit, kind, outcome, set_index, value, set_rpe, session_rpe, goal_label, goal_sets, goal_value, target, target_mode, promoted_to, blocked_by`. Verified in `exportCsv.ts:25-48`.
- [x] `target` / `target_mode` 열 분리 — 커밋 `006c97f` 확정 반영. 숫자 문자열 / `fixed|max`. `>=` 접두어 없음. Verified in `exportCsv.ts:150-151`.
- [x] 세트 0개 세션 → 한 줄, `set_index/value/set_rpe/target/target_mode` 빈 칸 (EC-70). Verified in `exportCsv.ts:132-140`.
- [x] RFC 4180: `,`, `"`, `\r`, `\n` 인용 — `csvQuote`. `""` 이스케이프. `\r\n` 줄 종결. UTF-8 BOM. Verified in `exportCsv.ts:77-82, 176-182`.
- [x] 진행 중 세션 배제 — `state.history` 만 순회 (EC-59). Verified in `exportCsv.ts:162-165`.
- [x] `session_rpe`, `promoted_to`, `blocked_by`, `goal_*` 가 모든 세트 줄에 반복 — `sessionCommon()` 패턴. Verified in `exportCsv.ts:90-118`.
- [x] `buildExportCsv(state, catalog)` 편의 함수 추가 (계획 외, 타당성 확인됨 — 아래 주석 참조). Verified in `exportCsv.ts:187-189`.
- [x] `tests/unit/history-exportCsv.test.ts` 신규 작성 (다수 케이스). Verified by `pnpm test` 774 passed.

> **buildExportCsv 편의 함수 (계획 외 추가)**: `formatCsv(buildCsvRows(state, catalog))` 의 1줄 래퍼. `ExportBar.svelte` 에서 사용. 범위를 늘리지 않고 DRY 만 확보하는 안전한 추가 — 승인.

### download.svelte.ts (FR-26.5, EC-61, RISK-5)
- [x] `saveFile({ name, mime, content }): Promise<'downloaded'|'shared'|'unavailable'>` 구현. Verified in `download.svelte.ts:120-125`.
- [x] 사전 판정(`canDownloadAnchor()`) + 예외 catch — 1단계 두 겹 (RISK-5). Verified in `download.svelte.ts:34-93`.
- [x] 사전 판정(`canShareFile()`) + 예외 catch — 2단계 두 겹 (RISK-5). Verified in `download.svelte.ts:51-113`.
- [x] 둘 다 실패 시 `'unavailable'` (EC-61). Verified in `download.svelte.ts:125`.
- [x] `tests/unit/history-download.test.ts` 신규 (`// @vitest-environment happy-dom`). Verified by `pnpm test` 774 passed.

### ExportBar.svelte (FR-26.1~5)
- [x] 두 버튼 `data-export-json`, `data-export-csv` — 아이콘 + 텍스트 라벨 병기. Verified in `ExportBar.svelte:68-112`.
- [x] `data-export-status` 속성 — `downloaded`/`shared`/`unavailable`. Verified in `ExportBar.svelte:115`.
- [x] `unavailable` 시 「내려받기 · 공유가 모두 안 됩니다.」 안내 문구 (EC-61). Verified in `ExportBar.svelte:117`.
- [x] 아이콘: FA Free/Lucide/Tabler 우선 검토 후 **직접 그리기** 선택 — 기존 상단 바 24×24 `stroke="currentColor"` 스타일과 일치, CC BY 4.0 표기 의무 없음. 결정 타당 (아래 아이콘 절 참조).
- [x] FR-26.6 상태 불변 — `$state(null)` 에 결과값만 기록, `appState` 는 읽기 전용. Verified in `ExportBar.svelte:34`.
- [x] 파일명 `bigsix-${today}.json` / `.csv` — `today` prop 사용, `new Date()` 직접 호출 없음 (ADR-24). Verified in `ExportBar.svelte:52,63`.

### 아이콘 결정 (GLOBAL 「아이콘」 절)
코더는 GLOBAL 아이콘 우선순위 3항 「직접 그리기」를 선택했다. FA Free 후보(`file-arrow-down`, `file-csv`)가 존재하지만, 기존 상단 바 아이콘이 모두 24×24 선형(stroke) SVG 스타일이고 FA Free 는 filled 계열이어서 시각 불일치가 발생한다. GLOBAL B항 2호 「FA 의 형태가 상단 바 아이콘 톤과 어긋나면 Lucide/Tabler」, 3호 「그래도 마땅한 것이 없으면 직접 그린다」를 순서대로 거쳐 직접 그리기를 택한 것으로 판단 — **타당**. CC BY 4.0 표기 의무 없음.

### NFR-25
- [x] `pnpm check`: 0 errors / 0 warnings (2026-09-22 실측).
- [x] `pnpm test`: 774 tests passed (36 files) — 기준선 737 대비 37개 증가 (2026-09-22 실측).

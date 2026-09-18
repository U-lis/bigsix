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

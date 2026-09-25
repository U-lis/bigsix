# Phase 6 — TEST 체크리스트

## exportJson.ts (FR-26.2, EC-59)

- [x] `tests/unit/history-exportJson.test.ts` — 결과 `meta.schemaVersion === 4`, `meta.app === 'bigsix'`.
- [x] `tests/unit/history-exportJson.test.ts` — `meta.exportedAt` 이 로컬 오프셋 포함 ISO 문자열.
- [x] `tests/unit/history-exportJson.test.ts` — `meta.commit` 이 문자열 (테스트에서는 `__COMMIT_HASH__` stub).
- [x] `tests/unit/history-exportJson.test.ts` — `appState` 가 입력 state 와 깊은 동등 (참조는 다름).
- [x] `tests/unit/history-exportJson.test.ts` — 진행 중 세션 봉투와 무관 (별도 저장이므로 자동 배제). 함수 자체가 inProgress 를 받지 않는다.
- [x] `tests/unit/history-exportJson.test.ts` — `catalog.progressions` 에 종목 6개, 각 단계별 `nameKo · unit · perSide · beginner · intermediate · progression?/elite?`.

## exportCsv.ts (FR-26.3, EC-69, EC-70)

- [x] `tests/unit/history-exportCsv.test.ts` — `formatCsv([])` 첫 문자가 `﻿`.
- [x] `tests/unit/history-exportCsv.test.ts` — 헤더가 22개 열 순서와 정확히 일치: `date, completed_at, program, day_number, progression, step, performed_step, step_name, unit, kind, outcome, set_index, value, set_rpe, session_rpe, goal_label, goal_sets, goal_value, target, target_mode, promoted_to, blocked_by`.
- [x] `tests/unit/history-exportCsv.test.ts` — 세트별 한 줄 (long): sets.length 만큼 줄 생성.
- [x] `tests/unit/history-exportCsv.test.ts` — 세트 0개 세션 → 한 줄, `set_index` · `value` · `set_rpe` · `target` · `target_mode` 빈 칸 (EC-70).
- [x] `tests/unit/history-exportCsv.test.ts` — 쉼표 · 따옴표 · 개행 포함 값이 RFC 4180 규칙으로 인용 (EC-69).
- [x] `tests/unit/history-exportCsv.test.ts` — `session_rpe`, `promoted_to`, `blocked_by`, `goal_*` 이 같은 세션의 모든 세트 줄에 반복.
- [x] `tests/unit/history-exportCsv.test.ts` — `target` 열이 숫자 문자열 (예: `"25"`), `target_mode` 는 `"fixed"` 또는 `"max"`. 어느 열에도 `>=` 접두어 없음.
- [x] `tests/unit/history-exportCsv.test.ts` — 목표 스냅샷 없는 세션은 `goal_*` · `target` · `target_mode` 5개 열이 빈 칸.
- [x] `tests/unit/history-exportCsv.test.ts` — `program` 컬럼이 `stintAt(state, date)` 이 null 이면 빈 칸, 있으면 `getProgram(catalog, id).name.ko`.

## download.svelte.ts (FR-26.5, EC-61)

- [x] `tests/unit/history-download.test.ts` — happy-dom. `URL.createObjectURL` 스텁 성공 시 `'downloaded'`.
- [x] `tests/unit/history-download.test.ts` — `<a>` 클릭이 예외 없이 진행되고 revoke 가 호출됨.
- [x] `tests/unit/history-download.test.ts` — Blob 지원 없음(생성자 스텁 실패) 이고 `navigator.canShare({ files: [...] })` 가 true 면 `navigator.share` 로 넘김 → `'shared'`.
- [x] `tests/unit/history-download.test.ts` — 둘 다 실패 시 `'unavailable'`.

## FR-26.6 (상태 불변)

- [x] `tests/unit/history-exportJson.test.ts` — `buildExportJson(state, ...)` 호출 후 `state === originalState` (참조 동등) 검증.
- [x] `tests/unit/history-exportCsv.test.ts` — 같은 방식.

## UI (수동 — 배포 후 확인)

- [ ] 「JSON 내보내기」 클릭 → 실제 브라우저에서 `bigsix-YYYY-MM-DD.json` 다운로드. **배포 후 확인**
- [ ] 「CSV 내보내기」 클릭 → `bigsix-YYYY-MM-DD.csv` 다운로드. 엑셀에서 열어 한글이 안 깨진다. **배포 후 확인**
- [ ] `data-export-status` 가 결과에 따라 `downloaded`/`shared`/`unavailable`. **배포 후 확인**
- [ ] `unavailable` 시 「내려받기 · 공유가 모두 안 됩니다」 안내 문구. **배포 후 확인**
- [ ] 두 버튼 모두 아이콘 + 텍스트 라벨 병기 (아이콘만 없음). **배포 후 확인**
- [x] FA Free 채택 시 About 에 CC BY 4.0 표기 등재 — **해당 없음**: 직접 그리기 경로를 채택해 FA Free 를 사용하지 않음. CC BY 4.0 표기 의무 없음. Phase 8 라이선스 표기 범위에서도 제외 (GLOBAL 아이콘 절 Phase 6 항목 참조).

## NFR-25

- [x] `pnpm check` 0/0. (2026-09-22 실측: 0 errors / 0 warnings)
- [x] `pnpm test` 전부 통과. 신규 케이스 30개 안팎. (2026-09-22 실측: 774 tests passed, 36 files — 기준선 737 대비 +37)

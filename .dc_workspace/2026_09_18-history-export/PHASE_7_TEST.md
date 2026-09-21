# Phase 7 — TEST 체크리스트

## importJson.ts (FR-27.2, EC-63/64/65)

- [x] `tests/unit/history-importJson.test.ts` — 텍스트가 JSON 아니면 `{ok: false, reason: 'not-json'}`.
- [x] `tests/unit/history-importJson.test.ts` — `meta` 없거나 `meta.schemaVersion` 이 숫자 아니면 `{ok: false, reason: 'schema-missing'}`.
- [x] `tests/unit/history-importJson.test.ts` — `appState` 필드 없거나 `isAppStateShape` 실패면 `{ok: false, reason: 'shape'}` (EC-64).
- [x] `tests/unit/history-importJson.test.ts` — `meta.schemaVersion > 4` 이면 `{ok: false, reason: 'future-version', detail: '5'}` (EC-63).
- [x] `tests/unit/history-importJson.test.ts` — v1/v2/v3 파일도 마이그레이션 체인 통과 후 정상 (EC-65).
- [x] `tests/unit/history-importJson.test.ts` — 정상 파일 → `{ok: true, appState, counts}`. `counts.current === current.history.length`, `counts.incoming === parsed.appState.history.length`.
- [x] `tests/unit/history-importJson.test.ts` — `counts.currentRange` 가 첫/마지막 `record.date`. history 없으면 null.

## 왕복 (NFR-27)

- [x] `tests/unit/history-roundtrip.test.ts` — 임의 state → `buildExportJson` → `JSON.stringify` → `JSON.parse` → `parseImport` → 결과 `appState` 가 원본과 깊은 동등.
- [x] `tests/unit/history-roundtrip.test.ts` — 빈 state (기록/구간 0개) 도 왕복 후 동등.
- [x] `tests/unit/history-roundtrip.test.ts` — `adjustedAtSessionIndex` 있는 state 도 왕복 후 동등.

## FR-27.4 진행 중 세션 차단 (EC-62, 수동)

- [ ] 진행 중 세션 스토어가 non-null 인 상태에서 「JSON 가져오기」 를 눌러도 파일 입력이 열리지 않는다. (배포 후 확인)
- [ ] `data-import-block="inprogress"` 로 안내 문구 표시. (배포 후 확인)
- [ ] 세션을 완료/취소한 뒤 다시 시도 시 정상 진입. (배포 후 확인)

## FR-27.3 확인 창 (수동)

- [ ] 정상 파일 선택 → Confirm 다이얼로그가 열림. (배포 후 확인)
- [ ] 본문에 "현재 기록: N건 (from ~ to)" · "가져올 기록: M건 (from ~ to)" · "먼저 「JSON 내보내기」 로 백업하세요" 안내. (배포 후 확인)
- [ ] 취소 → 상태 불변. (배포 후 확인)
- [ ] 확인 → `appState` 가 imported 로 교체되고 화면이 새 상태로 즉시 갱신. (배포 후 확인)

## FR-27.2 에러 문구 (수동)

- [ ] JSON 아닌 파일 → "JSON 이 아닙니다". (배포 후 확인)
- [ ] `meta` 없는 파일 → "이 파일은 bigsix 내보내기 형식이 아닙니다". (배포 후 확인)
- [ ] 형태 어긋난 파일 → "저장 형태가 맞지 않습니다". (배포 후 확인)
- [ ] 미래 버전 → "앱이 이 파일보다 오래됐습니다. 앱을 갱신하세요". (배포 후 확인)
- [ ] `data-import-error="{reason}"` 훅 확인. (배포 후 확인)

## NFR-28

- [x] `grep -rnE "@html" src/lib/ui/history` 결과 없음. (주석 내 언급만 있고 실제 사용 없음, 2026-09-22)

## NFR-25

- [x] `pnpm check` 0/0. (2026-09-22: 0 errors, 0 warnings)
- [x] `pnpm test` 전부 통과. 797 passed (신규 23건: importJson 20건 + roundtrip 4건 - 중복 1건). (2026-09-22)

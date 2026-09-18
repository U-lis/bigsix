# Phase 7 — TEST 체크리스트

## importJson.ts (FR-27.2, EC-63/64/65)

- [ ] `tests/unit/history-importJson.test.ts` — 텍스트가 JSON 아니면 `{ok: false, reason: 'not-json'}`.
- [ ] `tests/unit/history-importJson.test.ts` — `meta` 없거나 `meta.schemaVersion` 이 숫자 아니면 `{ok: false, reason: 'schema-missing'}`.
- [ ] `tests/unit/history-importJson.test.ts` — `appState` 필드 없거나 `isAppStateShape` 실패면 `{ok: false, reason: 'shape'}` (EC-64).
- [ ] `tests/unit/history-importJson.test.ts` — `meta.schemaVersion > 4` 이면 `{ok: false, reason: 'future-version', detail: '5'}` (EC-63).
- [ ] `tests/unit/history-importJson.test.ts` — v1/v2/v3 파일도 마이그레이션 체인 통과 후 정상 (EC-65).
- [ ] `tests/unit/history-importJson.test.ts` — 정상 파일 → `{ok: true, appState, counts}`. `counts.current === current.history.length`, `counts.incoming === parsed.appState.history.length`.
- [ ] `tests/unit/history-importJson.test.ts` — `counts.currentRange` 가 첫/마지막 `record.date`. history 없으면 null.

## 왕복 (NFR-27)

- [ ] `tests/unit/history-roundtrip.test.ts` — 임의 state → `buildExportJson` → `JSON.stringify` → `JSON.parse` → `parseImport` → 결과 `appState` 가 원본과 깊은 동등.
- [ ] `tests/unit/history-roundtrip.test.ts` — 빈 state (기록/구간 0개) 도 왕복 후 동등.
- [ ] `tests/unit/history-roundtrip.test.ts` — `adjustedAtSessionIndex` 있는 state 도 왕복 후 동등.

## FR-27.4 진행 중 세션 차단 (EC-62, 수동)

- [ ] 진행 중 세션 스토어가 non-null 인 상태에서 「JSON 가져오기」 를 눌러도 파일 입력이 열리지 않는다.
- [ ] `data-import-block="inprogress"` 로 안내 문구 표시.
- [ ] 세션을 완료/취소한 뒤 다시 시도 시 정상 진입.

## FR-27.3 확인 창 (수동)

- [ ] 정상 파일 선택 → Confirm 다이얼로그가 열림.
- [ ] 본문에 "현재 기록: N건 (from ~ to)" · "가져올 기록: M건 (from ~ to)" · "먼저 「JSON 내보내기」 로 백업하세요" 안내.
- [ ] 취소 → 상태 불변.
- [ ] 확인 → `appState` 가 imported 로 교체되고 화면이 새 상태로 즉시 갱신.

## FR-27.2 에러 문구 (수동)

- [ ] JSON 아닌 파일 → "JSON 이 아닙니다".
- [ ] `meta` 없는 파일 → "이 파일은 bigsix 내보내기 형식이 아닙니다".
- [ ] 형태 어긋난 파일 → "저장 형태가 맞지 않습니다".
- [ ] 미래 버전 → "앱이 이 파일보다 오래됐습니다. 앱을 갱신하세요".
- [ ] `data-import-error="{reason}"` 훅 확인.

## NFR-28

- [ ] `grep -rnE "@html" src/lib/ui/history` 결과 없음.

## NFR-25

- [ ] `pnpm check` 0/0.
- [ ] `pnpm test` 전부 통과. 신규 케이스 15개 안팎.

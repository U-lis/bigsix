# Phase 7 — 가져오기

**목표**
FR-27. 「JSON 가져오기」 버튼으로 파일을 골라 확인 후 덮어쓴다.

## SPEC 참조

- FR-27.1: 「JSON 가져오기」 버튼. FR-26.2 형식의 파일 하나.
- FR-27.2: 저장 계층 재사용 — 마이그레이션 체인 + 형태 검증. 새 경로 없음. 미래 버전 · 형태 불일치 · 파싱 실패는 거절.
- FR-27.3: 덮어쓰기. 확인 창에 현재/가져올 기록 수와 날짜 범위. 기존 `Confirm` 사용.
- FR-27.4: 진행 중 세션 있으면 막는다 (EC-62).
- FR-27.5: 되돌리기 수단 없음. "먼저 현재 기록을 내보내 두라" 안내.
- EC-60: 새 기기 · 빈 상태에서도 가능.
- EC-63/64/65: 미래 버전 거절, 형태 이상 거절, v1~v3 파일은 마이그레이션 체인 통과.
- NFR-27: 왕복 테스트 — 내보내기 → 가져오기 결과가 원본과 깊은 동등.
- NFR-28: `{@html}` 금지.

## 변경 파일

- `src/lib/ui/history/importJson.ts`:
  - `parseImport(text: string, current: AppState): ImportResult` — 판별 유니온 (GLOBAL (B.5)).
  - 흐름:
    1. `JSON.parse(text)` → 실패 시 `{ok: false, reason: 'not-json'}`.
    2. `meta.schemaVersion` 이 숫자 아니면 `{ok: false, reason: 'schema-missing'}`.
    3. `envelope = { schemaVersion: file.meta.schemaVersion, appState: file.appState }` 조립.
    4. `validateAndMigrateAppStateEnvelope(envelope)` 호출 → `future-version` / `corrupt` → 사유 매핑 (`corrupt` → `shape`).
    5. 성공 시 counts 계산: `current.history.length`, `incoming.history.length`, 각 range (첫/마지막 `date`).
- `src/lib/ui/history/ImportDialog.svelte`:
  - `<input type="file" accept="application/json">` — 값 잡히면 `text()` 로 문자열 얻고 `parseImport` 호출.
  - `data-import-dialog` 루트.
  - `data-import-block="inprogress"` — 진행 중 세션 있으면 파일 입력 자체를 비활성화하고 안내 문구 표시.
  - 결과가 `ok === true` 이면 `Confirm.svelte` 로 확인 창 열기. 본문에:
    - 현재 기록: N건 (from ~ to).
    - 가져올 기록: M건 (from ~ to).
    - 안내: "기존 데이터는 사라집니다. 필요하면 먼저 「JSON 내보내기」 로 백업하세요." (FR-27.5).
  - 결과가 `ok === false` 이면 `data-import-error="{reason}"` 로 사유 표시:
    - `not-json`: "JSON 이 아닙니다."
    - `schema-missing`: "이 파일은 bigsix 내보내기 형식이 아닙니다."
    - `shape`: "저장 형태가 맞지 않습니다."
    - `future-version`: "앱이 이 파일보다 오래됐습니다. 앱을 갱신하세요."
  - 확인 시 `appState.replace(imported)` 호출 → 저장 → 화면 갱신.
- `src/lib/ui/state/state.svelte.ts`:
  - `replace(newState: AppState): void` 훅 (없으면 추가). 내부에서 `writeAppState(newState)` + `$state` 갱신. 기존 API 확인 후 이름 결정 (예: `initFromBoot` 재사용도 가능하나 명확히 `replace` 추천).
- `src/lib/ui/history/ExportBar.svelte`:
  - 「JSON 가져오기」 버튼 추가. `data-import`. 아이콘 + 라벨.
  - 눌렀을 때 ImportDialog 열기.
- `tests/unit/history-importJson.test.ts` (신규).
- `tests/unit/history-roundtrip.test.ts` (신규) — NFR-27.

## 커밋 경계 (2개)

1. `feat(history): 가져오기 검증 (storage 재사용)` — importJson.ts + tests + roundtrip.
2. `feat(history): 가져오기 확인 다이얼로그와 덮어쓰기` — ImportDialog + ExportBar + state replace.

## 완료 기준

- 정상 파일: 확인 창에 현재/가져올 기록 수와 날짜 범위. 확인 시 덮어써짐.
- 진행 중 세션 있으면 파일 입력 자체 비활성 + 안내 (EC-62).
- 미래 버전 / 형태 이상 / JSON 아님 각각의 사유 문구.
- 왕복 테스트 통과 (NFR-27).
- 텍스트는 Svelte 텍스트 바인딩으로만 그려지고 `{@html}` 은 없다 (NFR-28).
- `pnpm check` 0/0, `pnpm test` 전부 통과.

## 임시 배포

이 페이즈에 포함하지 않는다.

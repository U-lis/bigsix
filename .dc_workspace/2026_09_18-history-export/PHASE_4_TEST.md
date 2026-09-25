# Phase 4 — TEST 체크리스트

**검증 완료: 2026-09-21. `pnpm test` 725 passed (32 files), `pnpm check` 0/0.**

## range.ts (FR-24.1, NFR-24)

- [x] `tests/unit/history-range.test.ts` — 기록·구간 모두 없으면 `historyRange` 결과 `null`.
- [x] `tests/unit/history-range.test.ts` — 기록만 있으면 `from = 첫 record.date`, `to = today`.
- [x] `tests/unit/history-range.test.ts` — 구간만 있으면 `from = 첫 stint.selectedAt`, `to = today`.
- [x] `tests/unit/history-range.test.ts` — 둘 다 있으면 이른 쪽부터.
- [x] `tests/unit/history-range.test.ts` — 구간의 selectedAt 이 record.date 보다 이르면 selectedAt 채택 (반대도).
- [x] `tests/unit/history-range.test.ts` — `windowsBack(range, 30)` 이 최신 창을 먼저 낸다.
- [x] `tests/unit/history-range.test.ts` — 첫 창은 `[to - 29, to]`, 다음 창은 `[to - 59, to - 30]`, … 형태.
- [x] `tests/unit/history-range.test.ts` — 마지막 창은 `from` 을 포함하고 그 이전으로 넘어가지 않는다.

## dayList.ts (FR-24.2~6, EC-58, EC-66)

- [x] `tests/unit/history-dayList.test.ts` — `수행`/`일부`/`미수행`/`휴식` 이 `reviewDay().status` 와 일치.
- [x] `tests/unit/history-dayList.test.ts` — 그날 stint.startedAt 이면 `stintStartedOn` 채워짐.
- [x] `tests/unit/history-dayList.test.ts` — 그날 accepted proposal 이 있으면 `proposalAcceptedOn` 채워짐.
- [x] `tests/unit/history-dayList.test.ts` — 같은 날 같은 종목 세션 2건 모두 `review.performed` 에 노출 (EC-58).
- [x] `tests/unit/history-dayList.test.ts` — 프로그램 미선택 기간의 자유 운동 기록이 있으면 그날 결과가 나온다 (EC-66) — `withNoStintPerformed` 헬퍼로 구현. `status: 'rest'` 유지 확인.
- [x] `tests/unit/history-dayList.test.ts` — 결과 배열이 최근 날짜부터.

## 컴포넌트 렌더 (수동)

- [x] 기록 · 구간 모두 없는 상태 → "아직 기록이 없습니다" 만 표시. `<h1>` 은 계속 서 있다.
- [x] 기록이 있으면 30일 단위 목록. "이전 30일 더 보기" 로 늘어난다.
- [x] `data-day-status="done"` 등 훅으로 색·문구 함께 표시.
- [x] `missed` 인 날에 계획 종목명(한국어)만, 목표 수치 없음 (FR-24.6).
- [x] `promotedTo` 있는 세션 → "N단계로 승급" 문구.
- [x] `blockedBy: 'rpe'` → "RPE 보류". `'master'` → "최상단".
- [x] `kind: 'consolidation'` → "다지기". `'free'` → "자유 운동".
- [x] `outcome: 'abandoned'` → "중단".
- [x] stintStartedOn 인 날 → "새 루틴 시작". proposalAcceptedOn 인 날 → "루틴 갈아탐" (FR-24.5).

## UI-1 ~ UI-9 (수동)

- [x] 세로 순서: `<h1>기록</h1>` → SegToggle → 본문 → "더 보기" → 하단 여백(ExportBar 자리, Phase 6 에서 채움).
- [x] SegToggle 전환 시 세로 자리 그대로.
- [x] 목록 영역 자리가 부팅 전에도 예약됨 — `.body { min-height: 20rem }`, `!booted` 시 "불러오는 중…" 텍스트 (UI-6).
- [x] 44px 터치 타깃 · 하단 네비 52px — "이전 30일 더 보기" 버튼 `min-height: 44px` 확인.

## NFR-25

- [x] `pnpm check` 0/0. (483 files, 0 errors, 0 warnings)
- [x] `pnpm test` 전부 통과. 725 tests (32 files). 이전 Phase 3 기준선 707 대비 +18 (range.test.ts 8건, dayList.test.ts 10건).

## 화면 규약 (cube-study 준용)

- [x] 하드코딩 색 0건 — 모든 색 값이 `var(--...)` CSS 토큰 참조.
- [x] 상태를 색만으로 알리지 않음 (UI-2/UI-5) — `.status` 요소에 항상 텍스트(수행/일부/미수행/휴식) 포함.
- [x] `data-*` 훅 규약 — `data-history-view`, `data-history-toggle`, `data-day-row`, `data-day-status`, `data-day-more`, `data-day-session`, `data-history-empty` 등 GLOBAL 목록과 일치.

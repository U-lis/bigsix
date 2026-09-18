# Phase 4 — TEST 체크리스트

## range.ts (FR-24.1, NFR-24)

- [ ] `tests/unit/history-range.test.ts` — 기록·구간 모두 없으면 `historyRange` 결과 `null`.
- [ ] `tests/unit/history-range.test.ts` — 기록만 있으면 `from = 첫 record.date`, `to = today`.
- [ ] `tests/unit/history-range.test.ts` — 구간만 있으면 `from = 첫 stint.selectedAt`, `to = today`.
- [ ] `tests/unit/history-range.test.ts` — 둘 다 있으면 이른 쪽부터.
- [ ] `tests/unit/history-range.test.ts` — 구간의 selectedAt 이 record.date 보다 이르면 selectedAt 채택 (반대도).
- [ ] `tests/unit/history-range.test.ts` — `windowsBack(range, 30)` 이 최신 창을 먼저 낸다.
- [ ] `tests/unit/history-range.test.ts` — 첫 창은 `[to - 29, to]`, 다음 창은 `[to - 59, to - 30]`, … 형태.
- [ ] `tests/unit/history-range.test.ts` — 마지막 창은 `from` 을 포함하고 그 이전으로 넘어가지 않는다.

## dayList.ts (FR-24.2~6, EC-58, EC-66)

- [ ] `tests/unit/history-dayList.test.ts` — `수행`/`일부`/`미수행`/`휴식` 이 `reviewDay().status` 와 일치.
- [ ] `tests/unit/history-dayList.test.ts` — 그날 stint.startedAt 이면 `stintStartedOn` 채워짐.
- [ ] `tests/unit/history-dayList.test.ts` — 그날 accepted proposal 이 있으면 `proposalAcceptedOn` 채워짐.
- [ ] `tests/unit/history-dayList.test.ts` — 같은 날 같은 종목 세션 2건 모두 `review.performed` 에 노출 (EC-58).
- [ ] `tests/unit/history-dayList.test.ts` — 프로그램 미선택 기간의 자유 운동 기록이 있으면 그날 결과가 나온다 (EC-66) — 구간 없이도 date 가 범위에 들어 있으면.
- [ ] `tests/unit/history-dayList.test.ts` — 결과 배열이 최근 날짜부터.

## 컴포넌트 렌더 (수동)

- [ ] 기록 · 구간 모두 없는 상태 → "아직 기록이 없습니다" 만 표시. `<h1>` 은 계속 서 있다.
- [ ] 기록이 있으면 30일 단위 목록. "이전 30일 더 보기" 로 늘어난다.
- [ ] `data-day-status="done"` 등 훅으로 색·문구 함께 표시.
- [ ] `missed` 인 날에 계획 종목명(한국어)만, 목표 수치 없음 (FR-24.6).
- [ ] `promotedTo` 있는 세션 → "N단계로 승급" 문구.
- [ ] `blockedBy: 'rpe'` → "RPE 보류". `'master'` → "최상단".
- [ ] `kind: 'consolidation'` → "다지기". `'free'` → "자유 운동".
- [ ] `outcome: 'abandoned'` → "중단".
- [ ] stintStartedOn 인 날 → "새 루틴 시작". proposalAcceptedOn 인 날 → "루틴 갈아탐" (FR-24.5).

## UI-1 ~ UI-9 (수동)

- [ ] 세로 순서: `<h1>기록</h1>` → SegToggle → 본문 → "더 보기" → 하단 여백(ExportBar 자리, Phase 6 에서 채움).
- [ ] SegToggle 전환 시 세로 자리 그대로.
- [ ] 목록 영역 자리가 부팅 전에도 예약됨 (스켈레톤 또는 min-height).
- [ ] 44px 터치 타깃 · 하단 네비 52px.

## NFR-25

- [ ] `pnpm check` 0/0.
- [ ] `pnpm test` 전부 통과, 이전 페이즈 이상. 신규 케이스 15개 안팎.

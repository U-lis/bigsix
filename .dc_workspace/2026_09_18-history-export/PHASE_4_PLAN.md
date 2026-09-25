# Phase 4 — 기록 탭 뼈대 + 날짜별 목록

**목표**
FR-23, FR-24, UI-1~9 (아이콘 제외). 기록 탭이 열리면 날짜별 목록이 30일 단위로 그려진다. 종목별 추이는 Phase 5, 내보내기/가져오기는 Phase 6~7 이 붙인다.

## SPEC 참조

- FR-23.2: `날짜별` / `종목별` 두 보기 전환. 기본 날짜별. `ChipGroup` 을 쓴다 (SPEC 원문) — 다만 UI-3 명시로 SegToggle 을 씀 (실제 사용, 이 GLOBAL ADR-26 참조).
- FR-23.3: 기록 · 구간 모두 없으면 "아직 기록이 없습니다" + 내보내기/가져오기 영역만.
- FR-24.1~7: 날짜 하나당 한 줄, 오늘부터 과거로, 30일 단위 페이지.
- UI-1~9: 세로 순서 · h1 하나 · 상태 색+글자 · 자리 예약.

## 변경 파일

- `src/lib/ui/common/SegToggle.svelte` — cube-study 에서 이식 (`~/Documents/cube-study/src/lib/ui/SegToggle.svelte`). 주석 포함 그대로.
- `src/lib/ui/history/range.ts`:
  - `historyRange(state, today): { from, to } | null` — 첫 stint.selectedAt · 첫 history.date 중 이른 날 ~ today. 둘 다 없으면 null.
  - `windowsBack(range, chunkDays = 30): Array<{ from, to }>` — 최신 창부터 30일 단위 창들.
- `src/lib/ui/history/dayList.ts`:
  - `interface DayRow { review: DayReview; weekday: Weekday; stintStartedOn: ProgramStint | null; proposalAcceptedOn: SwitchProposal | null; }`
  - `buildDayRows(state, catalog, window): DayRow[]` — window 안의 각 날짜에 대해 `reviewDay` 호출 + stint startedAt 일치 + accepted proposal.resolvedAt 일치 검사. 결과는 최근 날짜부터.
- `src/lib/ui/history/HistoryView.svelte`:
  - `<h1>기록</h1>` 첫 자리.
  - SegToggle 두 개 옵션 (`날짜별` / `종목별`), 상태 `$state('day')`.
  - 본문: `day` 이면 DayList, `progression` 이면 Phase 5 에서 배치할 placeholder.
  - 하단: "이전 30일 더 보기" 버튼 (windowsBack 결과에서 다음 창을 가져와 append), 그 아래 Phase 6 의 ExportBar placeholder 자리.
  - 빈 상태(range === null) 처리 — "아직 기록이 없습니다" 한 줄. ExportBar 자리는 남긴다.
  - `booted` 이전에도 스켈레톤 자리 (UI-6).
- `src/lib/ui/history/DayList.svelte`:
  - `data-history-view="day"` 그룹.
  - `DayRow[]` 를 순회하며 각 줄 렌더.
- `src/lib/ui/history/DayRow.svelte`:
  - `data-day-row="{YYYY-MM-DD}"`, `data-day-status="{status}"`.
  - 헤더 한 줄: 날짜 · 요일 · 프로그램명(있으면) · N일차 · 상태 문구 (`수행`/`일부`/`미수행`/`휴식`) — 색은 `data-day-status` 로 CSS 토큰 참조.
  - stintStartedOn 이면 "새 루틴 시작" 문구, proposalAcceptedOn 이면 "루틴 갈아탐" 문구 (FR-24.5).
  - 그날 세션 목록: `review.performed` 를 순회, 각 세션마다 `data-day-session`.
    - 종목명 · 수행 단계명 · 세트 값 · (있으면) 목표 표기 · session_rpe.
    - `kind === 'consolidation'` → "다지기", `'free'` → "자유 운동", `outcome === 'abandoned'` → "중단" (FR-24.3).
    - `promotedTo` → "N단계로 승급" (FR-24.4).
    - `blockedBy === 'rpe'` → "RPE 보류", `'master'` → "최상단" (FR-24.4).
  - 미수행일: `review.status === 'missed'` 이면 `review.planned` 배열의 종목명(한국어)만 나열. 목표 수치는 노출하지 않는다 (FR-24.6).
- `src/routes/history/+page.svelte` — stub 을 `<HistoryView />` 마운트로 교체.
- `tests/unit/history-range.test.ts` (신규).
- `tests/unit/history-dayList.test.ts` (신규).

## 커밋 경계 (3개)

1. `feat(common): SegToggle 이식` — 단일 파일, 룰만 그대로.
2. `feat(history): range · dayList 순수 함수` — 계산 층 + 테스트만.
3. `feat(history): 날짜별 목록 화면` — HistoryView · DayList · DayRow · 라우트 배선.

## 완료 기준

- [x] 기록 · 구간 모두 없는 상태에서 "아직 기록이 없습니다" 문구만 뜬다.
- [x] 기록이 있으면 오늘부터 최근 30일 목록이 뜬다.
- [x] "이전 30일 더 보기" 버튼으로 창이 늘어난다.
- [x] 상태 (`수행`/`일부`/`미수행`/`휴식`) 가 색 + 문구로 함께 표시.
- [x] 승급/보류/자유/다지기/중단/루틴 갈아탄 날이 문구로 표시.
- [x] 미수행일에 계획 종목명만 노출 (목표 수치 없음).
- [x] 같은 날 같은 종목 세션 2개가 모두 표시 (EC-58).
- [x] `pnpm check` 0/0, `pnpm test` 전부 통과.

## 검증 시 확인 사항 (2026-09-21)

### 1. `withNoStintPerformed` 헬퍼 (EC-66)

`dayList.ts` 에 PLAN 외 추가된 private 헬퍼. 승인.

- **(a) EC-66 해석 타당성**: 타당하다. `reviewDay`는 stint가 없는 날에 `noStintReview(date)`를 반환하고(`calendar.ts:84`), `noStintReview`는 항상 `performed: []`를 반환한다(`calendar.ts:46-56`). 자유 운동 기록이 있어도 도메인은 의도적으로 빈 배열을 반환한다 — 「계획 없는 날」이 도메인 판정 로직이다. `withNoStintPerformed`는 화면 목록에 이 기록을 표시해야 한다는 EC-66 요구를 UI 계층에서 처리한다.
- **(b) 도메인 판정(status) 오염**: 없다. 헬퍼는 `review.programId !== null`이면 즉시 반환하므로 stint가 있는 날에는 절대 개입하지 않는다. stint 없는 날도 `status` 를 건드리지 않는다 (코드 주석: "status 판정은 그대로 두어 rest 로 남는다").
- **(c) 도메인 중복 계산 여부**: 중복 아니다. `reviewDay`의 stint=null 경로는 `performed`를 채우지 않는다. `withNoStintPerformed`는 도메인이 주지 않는 값을 UI 계층에서 보완한다. stint가 있는 날은 `programId !== null` 체크로 개입을 방지하므로 도메인 로직과 충돌 없다.

### 2. SegToggle 동일성

`diff ~/Documents/cube-study/src/lib/ui/SegToggle.svelte src/lib/ui/common/SegToggle.svelte` — 출력 없음. 완전 동일.

### 3. HistoryView prop 이름 `appState`

GLOBAL.md ADR-20 (line 69)에 이미 `appState`로 명시. Svelte 5에서 `state`를 prop 이름으로 쓰면 svelte-check가 `$state` rune 충돌 경고를 낸다. `appState`로 변경한 것은 타당하며, PLAN 명세와도 일치한다. `pnpm check` 0/0 확인.

### 4. 테스트 픽스처 프로그램 ID

`progressions.json`에 `classic` 없음. `veterano` (id: "veterano") 존재. `good_behavior` 스케줄(월수금 운동, 화목토일 휴식) 실제 데이터 일치 확인. `MON=2026-08-31(월)` 기준 요일 계산 정확.

## 임시 배포

이 페이즈에 포함하지 않는다.

# Phase 4 — TEST (FR-17)

## 테스트 러너

- `pnpm test`
- 순수 함수 중심 (`node` 환경). 컴포넌트 마운트 없음 (NFR-14).

---

## Commit 1 — `nextDoableTrainingDay` 신규

### `tests/unit/program.test.ts` 확장

- [ ] "프로그램 미선택이면 null 반환"
  - state: `initialState()` (stints 빔)
  - `nextDoableTrainingDay(state, catalog, '2026-09-07')` === null

- [ ] "오늘이 이미 수행 가능한 운동일이면 오늘 반환"
  - state: `selectProgram(initialState(), catalog, 'new_blood', '2026-09-07')` (월요일)
  - `nextDoableTrainingDay(state, catalog, '2026-09-07')` === `'2026-09-07'` (월요일이 운동일 · 종목 열림)

- [ ] "휴식일이면 다음 수행 가능한 날 반환"
  - `new_blood` 는 월수금 → 화요일에서 시작하면 수요일 반환

- [ ] **EC-38 / FR-17.4**: "잠긴 종목만 배정된 날을 건너뛴다"
  - state: veterano 선택 · 빅4 전부 2단계 (bridge/hspu 잠김)
  - veterano 화요일이 bridge 단독, 수요일이 hspu 단독이라면
  - `nextDoableTrainingDay(state, catalog, '2026-09-08')` (화) === 목요일 또는 첫 열린 운동일 (실 요일표에 맞춰)

- [ ] **EC-43 / FR-17.4a**: "7일 안에 수행할 것이 있는 날 없으면 null 반환 — 예외 아님"
  - 인위적 카탈로그·상태로 검증하거나, "존재 가능한 시나리오" 로 세팅
  - 예: 존재 가능한 시나리오가 없다면 → 카탈로그 patch (테스트 fixture) 로 만든 프로그램에서 전 요일 잠긴 종목만 배치

- [ ] "순수 함수 — state 를 변형하지 않는다"
  - state 깊은 복사 후 함수 실행 → state 원본과 동일 (deepEqual)

- [ ] "기존 firstTrainingDay 는 시그니처가 유지되고 잠금을 여전히 무시한다 (ADR-19 회귀 방지)"
  - state: veterano + bridge/hspu 잠김
  - `firstTrainingDay(catalog, 'veterano', '2026-09-08')` — 원래 규약대로 화요일(요일표 첫 운동일) 반환
  - `nextDoableTrainingDay(state, catalog, '2026-09-08')` — 잠긴 종목 건너뛴 다른 날 반환
  - 두 결과가 다를 수 있음을 확인 (두 함수의 계약 차이 시각화)

---

## Commit 2 — 오늘 화면 4상태 파생

### `tests/unit/todayScreen.test.ts` (신규)

- [ ] "no-program: 프로그램 미선택이면 { kind: 'no-program' }"
  - state: `initialState()` (stints 빔)
  - expect: `deriveTodayScreen(state, catalog, '2026-09-07').kind === 'no-program'`

- [ ] **EC-39**: "no-program 이어도 리다이렉트가 아니라 안내 상태를 돌려준다"
  - 위 케이스와 사실상 같음. `deriveTodayScreen` 은 goto 를 호출하지 않는다 (순수 함수)

- [ ] "rest: 요일표가 비어 있으면 { kind: 'rest', nextTrainingDate }"
  - state: `new_blood` (월수금), from = 화요일
  - expect: `screen.kind === 'rest'`, `screen.nextTrainingDate === '2026-09-09' (수)`

- [ ] "rest 이고 향후 7일 안에 수행 가능한 날 없으면 nextTrainingDate === null"

- [ ] **EC-37 / FR-17.5**: "no-doable: rest === false 인데 exercises 가 비어 있음"
  - state: veterano · 빅4 전부 2단계 (bridge/hspu 잠김)
  - date: 화요일 (bridge 단독)
  - expect: `screen.kind === 'no-doable'`, `screen.locked.length === 1`, `screen.locked[0].progressionId === 'bridge'`, `screen.nextTrainingDate` 는 다음 열린 날

- [ ] "training: exercises 가 있음 → { kind: 'training', agenda }"
  - state: `new_blood` 월요일
  - expect: `screen.kind === 'training'`, `screen.agenda.exercises.length > 0`

- [ ] "순수 함수 — state 를 변형하지 않는다"

- [ ] "planOn 을 한 번만 호출한다" (성능 힌트 — 여러 번 호출로 인한 부작용 방지)
  - 호출 카운터 검증하려면 planOn 모의 필요. 선택적.

### 라우팅 리다이렉트 제거 검증

- [ ] 자동 테스트 없음. 다음을 육안 확인:
  - 초기 상태 (프로그램 미선택) 로 앱 부팅 → `/` 에 남아 안내 표시
  - 첫 실행이 아니면(needsFirstRun === false) `/steps` 로 가지 않음
  - 상단 URL 이 `/` 유지 (자동 이동 없음)

---

## 검사 절차

### Commit 1 종료 후

1. `pnpm test` — program.test 신규 케이스 통과
2. `pnpm run check` 0/0
3. `grep -n "nextDoableTrainingDay" src/lib/domain/program.ts src/lib/domain/index.ts` — 정의 1건, export 1건
4. `firstTrainingDay` 시그니처 무변경 확인:
   - `git diff src/lib/domain/program.ts | grep -E "^[-+]export function firstTrainingDay"` — 삭제 라인이 없음

### Commit 2 종료 후

1. `pnpm test` 전부 통과 (예상 570~585개)
2. `pnpm run check` 0/0
3. 수동 확인 시나리오:
   - **no-program**: `localStorage.clear()` 후 앱 부팅 → 첫 실행 화면(/steps) 진입 후 넘어가면 오늘 화면 → 안내 + 「프로그램 선택하기」
   - **rest**: `new_blood` 선택 후 화요일에 앱 켬 → "오늘은 휴식일입니다. 다음 루틴은 …" 표시
   - **no-doable**: veterano 선택 후 화요일에 앱 켬 (bridge 잠김) → 잠긴 종목 사유 + 다음 열린 날 안내
   - **training**: `new_blood` 월요일 → 종목 카드 표시

---

## Edge Case 커버

| EC | 처리 |
|---|---|
| EC-37 | Commit 2 todayScreen.test 신규 (잠긴 종목만 배정) |
| EC-38 | Commit 1 program.test 신규 (nextDoableTrainingDay 건너뛰기) |
| EC-39 | Commit 2 todayScreen.test 신규 (no-program 안내 반환) |
| EC-43 | Commit 1 program.test 신규 (7일 없으면 null) · Commit 2 todayScreen.test (nextTrainingDate === null) |

## 통과 기준

- [ ] `pnpm test` 전부 통과
- [ ] `pnpm run check` 0/0
- [ ] FR-17 전 하위 항목 반영
- [ ] `firstTrainingDay` 시그니처 유지 확인 (ADR-19)
- [ ] no-program 리다이렉트 제거 확인 (수동)

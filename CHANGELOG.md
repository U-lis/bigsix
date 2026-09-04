# Changelog

이 파일의 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 를 따르고,
버전 표기는 [유의적 버전](https://semver.org/lang/ko/)을 따른다.

## [0.1.0] - 2026-09-04

첫 기능 릴리스. 종목별 단계 진행만 계산하던 엔진에 **프로그램(루틴) 개념과 달력 날짜**가 들어갔다.
이제 "오늘이 며칠차이고 무엇을 하는 날인가" 를 엔진이 답한다.

### Added

**프로그램 선택과 전환** (`src/program.ts`)
- `describePrograms` / `describeProgram` — 프로그램 5종(New Blood / Good Behavior / Veterano /
  Solitary Confinement / Supermax)의 빈도·운동일수·휴식일수·등장 종목·보조 운동을 조회한다.
  모든 필드는 카탈로그에서 파생 계산하며 `data/progressions.json` 에 중복 저장하지 않는다.
- `selectProgram` / `switchProgram` — 사용자가 고른 날부터 그 루틴대로 수행한다.
  선택일이 그 루틴의 휴식일이면 **첫 운동일이 1일차**다 (`firstTrainingDay`).
- 수행 구간(`ProgramStint`)을 `AppState.stints` 에 시간순으로 쌓는다. 구간끼리 겹치지 않는다.
  중간에 다른 루틴으로 갈아탈 수 있고, 같은 루틴으로 되돌아와도 이전 구간을 잇지 않고
  새 구간으로 일차를 다시 센다.
- `currentStint` / `stintAt` / `dayNumber` / `dayNumberOn` — 구간 조회와 일차 계산.
- 과거 구간 이력은 무제한 보존한다. 잘라내는 코드가 없다.

**자동 전환 제안** (`src/proposal.ts`)
- `proposeSwitch` / `proposeSwitchForCurrent` — 현 루틴에 배치된 모든 종목이 승급했고,
  승급 이후 그 종목 세션이 강등 없이 3회(`MAINTENANCE_SESSIONS`) 쌓이면 다음 루틴을 제안한다.
- 판정과 제안 생성은 **월요일에만** 한다. 생성된 제안은 승인·거절 전까지 매일 노출된다
  (`activeProposal`, `DayAgenda.proposal`).
- 잠긴 종목(브리지·핸드스탠드)은 판정 대상에서 제외한다.
- `PROGRAM_ORDER` 로 다음 루틴을 정한다. 마지막 루틴에서는 제안하지 않는다.
- `acceptProposal` (`src/index.ts`) — 승인 시 제안을 `accepted` 로 표시하고 그날부터 새 구간을 연다.
  승인일은 월요일이 아니어도 된다. 월요일 제약은 생성에만 붙는다.
- `declineProposal` — 거절 이력을 `AppState.proposals` 에 남긴다.
  이 이력은 재제안을 막는 데 쓰지 않는다.

**실제 달력 날짜 기반 진입점** (`src/calendar.ts`, `src/date.ts`)
- `planOn(state, catalog, date)` — 실제 날짜로 그날 계획을 낸다. 요일·일차·휴식 여부·
  잠긴 종목·보조 운동·미결 제안을 한 번에 돌려준다.
- 프로그램 미선택 상태에서 예외를 던지지 않는다. `DayAgenda` 는 `kind: 'no-program' | 'plan'`
  판별 유니온이고 호출자가 `kind` 로 분기한다.
- `weekdayOf` / `addDays` / `diffDays` / `dateRange` / `isMonday` — 순수 날짜 유틸.
  엔진은 시스템 시각을 읽지 않는다. 날짜는 항상 인자로 받는다.

**수행 기록 조회** (`src/calendar.ts`)
- `reviewDay` / `reviewRange` — 날짜별로 어떤 루틴 며칠차에 무엇을 했는지 조회한다.
  조회는 상태를 바꾸지 않는다.
- 상태 4가지: `done` / `partial` / `missed` / `rest`.
  미수행일은 저장하지 않는다. 그날의 계획에서 그날의 기록을 뺀 차집합으로 계산한다.

**세션 진행 흐름** (`src/session.ts`)
- `abandonChallenge` — 도전 중 '불가능' 을 누르면 그날 바로 이전 단계 다지기로 전환한다.
  현재 훈련 단계(`state.steps`)는 유지한다.
- 1단계에서는 내려갈 단계가 없어 그대로 유지한다.
- `recordSession` / `recordConsolidation` — 정규 세션과 다지기 세션 기록.

**승급 사실 기록** (`src/types.ts`, `src/evaluate.ts`)
- `SessionRecord.promotedTo` — 그 세션 결과로 올라간 단계. 승급하지 않았으면 필드가 없다.
- `SessionRecord.blockedBy` — 기준은 채웠으나 승급이 막힌 사유. `rpe`(RPE 거부권으로 보류) 또는
  `master`(10단계라 더 올라갈 곳이 없음).
- 두 필드는 `applySession` 만 채운다. 호출자가 직접 채우지 않는다.

**좌우 기록 고지** (`src/plan.ts`)
- perSide 16단계(푸시업·스쿼트·풀업·핸드스탠드의 7~10단계)는 약한 쪽 기준으로 기록한다.
- `PlannedExercise.sideNote` 에 "양쪽 다 수행하고 적게 한 쪽을 입력한다" 는 고지를 담는다.
  부위 명칭은 스쿼트가 '다리', 나머지는 '팔'. 표시용 문구이며 목표 수치 계산에 관여하지 않는다.
- 다지기 계획의 고지는 실제 수행 단계(이전 단계) 기준으로 낸다.

### Changed

- `AppState` 스키마에 `stints` 와 `proposals` 필드가 추가됐다. `initialState()` 는 둘 다 빈 배열로
  시작하며, **`stints` 가 빈 배열인 것이 프로그램 미선택 상태**를 뜻한다.
- `applySession` 이 `SessionInput` 을 받아 파생 필드를 붙인 `SessionRecord` 를 만든다.
  반환값에 `record` 가 추가됐다. 호출자는 더 이상 파생 필드를 채우지 않는다.
- `applySession` 이 상태를 스프레드로 복사한다. 기존 구현은 `steps` 와 `history` 만 재구성해
  `stints` / `proposals` 를 잃었다.
- `evaluateSession` 의 인자 타입이 `SessionRecord` 에서 `SessionInput` 으로 완화됐다.
  판정에는 파생 필드가 필요 없다.

### Fixed

- 유지 세션 카운트가 날짜를 비교해, 승급 당일에 이뤄진 두 번째 세션부터를 세지 않았다.
  하루에 두 번 운동하면 그 종목의 전환 조건을 영영 채우지 못했다. history 인덱스 비교로 바꿨다.
- `SwitchProposal` 의 불변식 주석이 사실과 달랐다. 미결 제안은 전역 최대 1개가 아니라
  **구간당 최대 1개**다. 미결 상태에서 수동 전환하면 이전 구간의 미결 제안이 남는 것이 의도된 설계다.

### Notes

- 테스트 474개 통과. 커버리지 line 100% / branch 94.95% / funcs 100%.
- 외부 의존성 0. Node 24 내장 타입 스트리핑과 내장 테스트 러너만 쓴다.

[0.1.0]: https://github.com/U-lis/bigsix/releases/tag/v0.1.0

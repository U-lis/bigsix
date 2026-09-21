# Changelog

이 파일의 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 를 따르고,
버전 표기는 [유의적 버전](https://semver.org/lang/ko/)을 따른다.

## [Unreleased]

### Added

- **기록 탭** (`/history`): 하단 네비에 「기록」 탭이 추가됐다. 날짜별 목록과 종목별 추이 두 가지 보기를 제공한다.
  - **날짜별 목록**: 오늘부터 과거로 날짜 한 줄씩, 루틴명·며칠차·상태(수행/일부/미수행/휴식)를 보여준다.
    각 날짜를 펼치면 종목별 세트 값, 목표(있으면), RPE 를 확인할 수 있다. 기본 범위 30일, 더 보기로 확장.
    승급·보류·루틴 전환일을 그 날짜 줄에 함께 표시한다.
  - **종목별 추이**: 6종 중 하나를 선택하면 그 종목의 세션을 최근 것부터 한 줄씩 보여준다.
    단계 경계(승급·다지기 전환 지점)가 행 사이에서 시각적으로 구분된다.
    목표 충족 여부는 세션 당시 저장된 목표로만 판정하며, 목표가 없는 이전 기록은 "—" 로 표시된다.
- **JSON 내보내기**: 완결된 기록 전체를 `bigsix-YYYY-MM-DD.json` 으로 내보낸다.
  최상위는 `meta`(앱 버전·커밋·내보낸 시각·스키마 버전)·`appState`·`catalog`(AI 분석용 이름표)로 구성된다.
- **CSV 내보내기**: 세트 한 줄(long format) `bigsix-YYYY-MM-DD.csv` 로 내보낸다.
  22열(`date, completed_at, program, day_number, progression, step, performed_step, step_name, unit,
  kind, outcome, set_index, value, set_rpe, session_rpe, goal_label, goal_sets, goal_value,
  target, target_mode, promoted_to, blocked_by`). UTF-8 BOM 포함(엑셀 한글 깨짐 방지).
- **JSON 가져오기**: 이전에 내보낸 JSON 파일로 현재 기록을 복원한다.
  진행 중 세션이 있으면 가져오기를 막는다. 검증은 기존 마이그레이션 체인을 재사용한다.
- **세션 기록 보강**: 스키마 v4 로 올리면서 세션 입력(`SessionInput`)에 세 필드가 추가됐다.
  - `target`: 세션 시작 당시 목표 스냅샷(goal·sets·value + 세트별 목표).
  - `setRpes`: 세트별 RPE. 입력하지 않은 세트는 `null`.
  - `completedAt`: 완료(또는 중단) 시각. ISO 8601 로컬 오프셋 포함.
- **동작 설명** (Phase 2.5): 오늘 화면 운동 카드에서 그 단계의 자세·방법을 펼쳐 읽을 수 있다.
  본문은 `data/progressions.json` 의 `Step.summary` 를 그대로 노출한다(책 원문이 아닌 자체 요약).

### Changed

- **하단 네비 3→4탭**: 오늘 · 프로그램 · 단계에 「기록」 탭이 추가됐다 (FR-23.1). `src/lib/ui/shell/nav.ts` 의 `TABS` 한 곳만 바꿨다.
- **저장 스키마 v3 → v4**: `CURRENT_SCHEMA_VERSION` 을 4 로 올렸다. v3 → v4 마이그레이션은 **no-op** — 옛 기록은 새 세 필드가 없는 채로 읽힌다. 과거 기록을 재계산으로 채우지 않는다.
- **`src/lib/ui/` 역할별 하위 폴더 재배치** (Phase 1): 평평한 18개 파일을 `shell`·`state`·`common`·`today`·`session`·`history` 6개 하위 폴더로 나눴다. `src/lib/ui/` 직속에는 파일이 없다.

### Refactored

- **도메인 참조 `$lib/domain` 경유 통일** (R-1): UI·라우트에서 도메인 내부 파일을 직접 import 하던 6곳을 `$lib/domain` 공개 API 경유로 정정했다.
- **Import 표기 통일** (R-2): 층을 넘는 import 는 `$lib/...` 별칭, 같은 층은 상대 경로. `.ts` 확장자 표기를 제거했다. (`src/lib/domain/**` 은 plain Node 실행 보장을 위해 상대 경로 + `.ts` 확장자를 유지한다.)

### Testing

- **구조 규약 재발 방지 단위 테스트** (`tests/unit/structure.test.ts`): 네 가지 규약을 정적으로 검사한다.
  (a) UI·라우트에서 도메인 내부 파일 직접 참조 0건,
  (b) `src/` 안 `.ts` 확장자 import 0건 (`src/lib/domain/**` 제외),
  (c) 층을 넘는 상대 경로 0건,
  (d) `src/lib/ui/` 직속 파일 0건·하위 폴더는 정해진 6개뿐.
- **`vitest.config.ts` `$lib` 별칭 추가**: `$lib/domain` 등을 직접 import 하는 파일을 tests 러너가 transitive import 할 때 별칭을 풀 수 있도록 vitest 설정에 명시했다.
- **`formatIsoLocal` 순수 포매터 export** (`ui/state/today.svelte.ts`): `nowIsoLocal()` 내부 로직을 분리해 오프셋 계산을 프로세스 TZ 강제 없이 단위 테스트로 검증할 수 있게 했다.

### Known limitations

- **RISK-4**: `completedAt` 이 로컬 오프셋 포함 문자열이므로, 세션 도중 타임존을 이동(비행 등)한 경우 표시 시각이 어긋날 수 있다. 도메인은 이 값을 판정에 쓰지 않으므로 기능에는 영향이 없고 표시상 이슈에 그친다.
- **수동 단계 조정 이력 미표시**: `/steps` 에서 단계를 수동으로 바꾼 사실은 기록 탭에 남지 않는다. 추이에서 설명되지 않는 단계 변화로 보일 수 있다.

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

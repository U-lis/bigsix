<!-- dotclaude-config
working_directory: .dc_workspace
base_branch: main
language: ko_KR
worktree_path: ../bigsix-feature-move-record-date
doc_dir: 2026_11_04-move-record-date
target_version: 0.5.1
github_issue: 15
stage: local_test
approved_at: 2026-11-04T06:34:16Z
approved_hash: 6e93be44408be4f24458d00a02c973926d2a92d4606c098083be562860f43d2d
decisions: ["user-go-through-release"]
handoff: ""
-->
# 저장된 기록 날짜 옮기기 - Specification

## Overview

**Purpose**: 기록 탭 날짜별 보기에서 이미 저장된 세션 기록의 날짜를 다른 날로 옮길 수 있게 한다 (0.5.1, GitHub issue #15).

**Problem**: 자정을 넘겨 첫 세트를 입력하면 기록 날짜가 칸을 연 날(다음 날짜)로 들어가고, 전날 계획은 미수행으로 남는다 (`src/lib/ui/session/ExerciseCard.svelte:103`, `src/lib/ui/session/finish.ts:283`). 저장된 기록의 날짜를 고칠 방법이 없다.

**Solution**: 도메인에 순수 함수 `moveRecordDate` 를 신설해 `record.date` 를 바꾸고 `history` 의 날짜 오름차순과 종목별 조정 앵커를 보정한다. 기록 탭의 세션마다 「날짜 옮기기」 버튼과 날짜 입력을 더해 이 함수를 부른다. 같은 종목의 다른 판정 대상 기록을 건너뛰는 이동은 막는다 (사용자 결정).

---

## Functional Requirements

### Core Features
- [x] FR-1: 기록 탭 날짜별 보기(`DayRow`)의 세션마다 「날짜 옮기기」 버튼을 둔다. 누르면 그 자리에 날짜 입력(`input type=date`, `max` = 오늘), 「옮기기」·「취소」 버튼이 열린다. 「취소」는 입력을 닫고 상태를 바꾸지 않는다. `DayRow` 는 표시 전용이므로 적용은 콜백 prop 으로 상위(`DayList` / `HistoryView`)에 올린다.
- [x] FR-2: 도메인 순수 함수 `moveRecordDate(state, recordIndex, toDate, today)` 를 `src/lib/domain/records.ts` 에 신설하고 `src/lib/domain/index.ts` 에서 export 한다. 성공하면 해당 기록의 `date` 를 `toDate` 로 바꾸고 `history` 를 날짜 오름차순으로 유지하도록 재배치한다. 같은 날짜의 기록들 사이에서는 옮겨 간 기록이 대상 날짜의 마지막 뒤에 선다. 이 함수만 `record.date` 를 바꾼다. `completedAt`·`promotedTo`·`blockedBy` 등 다른 필드는 그대로 둔다. 입력 `state` 는 바꾸지 않고 새 `AppState` 를 돌려준다.
- [x] FR-3: 다음 사유는 예외가 아니라 거부 결과로 돌려주고, 거부되면 `state` 는 그대로다.
  - `'future'`: `toDate > today`
  - `'same-date'`: `toDate` 가 기록의 현재 날짜와 같음
  - `'crosses-same-progression'`: 비자유 기록의 이동이 같은 종목의 다른 비자유 기록을 건너뜀
  - `'crosses-adjustment'`: 비자유 기록의 이동이 자기 종목의 `adjustedAtSessionIndex` 앵커를 건너뜀
  - 잘못된 `recordIndex`(범위 밖·정수 아님) 또는 `toDate` 형식 오류 (사유 코드는 설계 단계에서 정한다)

  자유 운동(`kind: 'free'`)은 승급·유지·강등 판정에 쓰이지 않으므로 같은 종목 기록을 건너뛰는 제한이 없다. UI 는 거부 사유를 사실 문구로 보인다 (`data-record-move-error`).
- [x] FR-4: 재배치로 인덱스가 밀리면 다른 종목의 `adjustedAtSessionIndex` 를 함께 보정해 각 종목의 판정 대상 기록 집합이 그대로이게 한다 (`src/lib/domain/progress.ts:94,98` 가 앵커 이후 배열 순서로 판정, `src/lib/domain/steps.ts:49-51` 이 앵커를 `history.length` 로 기록). 이동 전후 모든 종목의 `stepStreak` 와 `state.steps` 가 같아야 한다. 승급 기록(`promotedTo`)을 옮겨도 마찬가지다.
- [x] FR-5: 이동이 성공하면 `appState.apply` 로 상태를 적용해 `localStorage` 에 저장한다 (`src/routes/steps/+page.svelte:81` 의 패턴). 그날과 옮겨 간 날의 표시(수행·미수행 등)는 `reviewDay` 로 자연히 갱신된다.

---

## Non-Functional Requirements

### Compatibility
- [x] NFR-1: 저장 스키마를 바꾸지 않는다 (봉투 v5 유지). 가져오기가 요구하는 `history` 날짜 오름차순 엔진 계약(`src/lib/ui/history/importJson.ts:45`)을 이동 후에도 지킨다.

### UI Conventions
- [x] NFR-2: CLAUDE.md 화면 규약을 따른다. 색은 `app.css` 토큰만, 터치 타깃 44px 이상, 아이콘만 있는 버튼 금지, 문구는 사실만(백분율·격려 금지), 오늘 날짜는 `todayClock.today`. 상태·정체는 `data-*` 훅으로 낸다: `data-record-move`(버튼), `data-record-move-form`(폼 루트), `data-record-move-date`(날짜 입력), `data-record-move-apply`(옮기기), `data-record-move-cancel`(취소), `data-record-move-error`(거부 사유). 훅을 추가한 뒤 CLAUDE.md 의 훅 목록을 갱신한다.

### Architecture
- [x] NFR-3: 도메인은 시스템 시각을 읽지 않고 `today` 를 인자로 받는다. 「도메인 계층 불가침」의 예외 범위는 `src/lib/domain/records.ts` 신설과 `src/lib/domain/index.ts` 의 export 추가뿐이다. 기존 도메인 파일은 고치지 않는다. CLAUDE.md 의 예외 문장(0.5.0 범위를 적은 곳)에 이 범위를 갱신해 적는다.

### Quality
- [x] NFR-4: 단위 테스트는 고정 날짜를 쓴다. `pnpm test`, `pnpm check`, CLAUDE.md 의 hex grep 이 통과한다.

---

## Constraints

### Technical Constraints
- Language/Framework: TypeScript, SvelteKit 2 + Svelte 5 룬(`export let`·`$:`·`on:click`·`<slot>`·`svelte/store` 금지), adapter-static
- Database: 없음. 클라이언트 `localStorage` 봉투 v5
- External Dependencies: 없음
- `src/lib/domain/**` 은 상대 경로 + `.ts` 확장자를 유지하고 `$lib` 를 쓰지 않는다. UI 는 `$lib/domain` 으로만 도메인을 부른다.
- `DayRow` 는 표시 전용이다. 상태 변경은 콜백 prop 으로 올린다.

### Business Constraints
- Timeline: 범위 확정 후 테스트 통과 시 0.5.1 릴리스까지 진행 (사용자 지시)
- Budget: 해당 없음

---

## Data Migration

Not applicable. 저장 스키마·기본값 변경이 없고 backfill 도 없다 (봉투 v5 유지, NFR-1). 기존 `AppState` 필드(`history[].date`, `adjustedAtSessionIndex`)의 값만 이동 시점에 바뀐다. 롤백은 기능 되돌림이며 이미 옮긴 기록은 같은 기능으로 다시 옮겨 되돌린다.

---

## Edge Cases

| FR | Partition | Case | Expected |
|----|-----------|------|----------|
| FR-2 | normal | 오늘 기록을 어제로 옮김 | `date` 변경, 배열 오름차순 유지. 어제는 수행, 오늘은 계획이 있으면 미수행으로 `reviewDay` 규칙대로 표시 |
| FR-2 | boundary | 같은 날짜 기록들이 있는 날로 이동 | 대상 날짜의 마지막 뒤에 선다 (안정 위치) |
| FR-3 | boundary | 내일(`toDate > today`)로 이동 | `'future'` 거부 |
| FR-3 | boundary | 현재 날짜와 같은 날짜로 이동 | `'same-date'` 거부 |
| FR-3 | invalid | 범위 밖 인덱스, 잘못된 날짜 형식 | 거부, `state` 그대로 |
| FR-3 | boundary | 같은 종목의 다른 비자유 기록을 건너뜀 | `'crosses-same-progression'` 거부 |
| FR-3 | boundary | 자유 운동 기록을 건너뜀 | 허용 (판정 대상이 아님. 실패 경로가 위와 다르다) |
| FR-3 | boundary | 자기 종목 앵커를 건너뜀 | `'crosses-adjustment'` 거부 (조정 후 집계 범위가 바뀜) |
| FR-4 | boundary | 다른 종목의 앵커를 건너뜀 | 그 종목 앵커 보정, 해당 종목 `stepStreak` 동일 |
| FR-4 | normal | 승급 기록(`promotedTo`)을 옮김 | `steps`·`stepStreak` 이동 전과 동일 |
| FR-1 | normal | 날짜 입력을 연 뒤 「취소」 | 입력이 닫히고 변화 없음 |

---

## Out of Scope

The following are explicitly NOT part of this work:
- 하루 경계(자정) 설정 변경
- 기록 마치기 다이얼로그에서의 날짜 선택
- 세트 값 수정
- 기록 삭제
- 종목별 보기에서의 옮기기
- 달력 작업(`feature/calendar-view`, 0.6.0, 미구현)과의 연동. 후속에서 일간 보기가 이 함수를 재사용할 수 있다.

---

## Assumptions

기본값(사용자가 따로 정하지 않아 정한 것):
- 옮길 날짜의 하한은 없다. 프로그램 구간 시작 전 날짜로 옮기면 그날은 프로그램 없는 날의 기록으로 표시된다 (`src/lib/ui/history/dayList.ts` `withNoStintPerformed`).
- 같은 날 같은 종목 기록이 이미 있어도 순서만 안 바뀌면 허용한다. 둘 다 표시된다 (알려진 중복 한계).
- 프로그램 구간 경계를 넘는 이동은 허용한다. 영향은 전환 제안 횟수 세기(`src/lib/domain/proposal.ts:60` `floorDate` 날짜 비교)뿐이며 이미 낸 제안은 바꾸지 않는다.
- 진행 중 칸(draft)은 건드리지 않는다.
- 확인 다이얼로그 없이 「옮기기」 버튼으로 바로 적용한다. 다시 옮기면 되돌릴 수 있다.

전제:
- 달력 표시(`src/lib/domain/calendar.ts:88`)의 `performed` 는 `history` 원소 참조이므로, 새 `AppState` 를 적용하면 파생이 다시 계산된다.

---

## Open Questions

- [x] 잘못된 인덱스·날짜 형식 거부의 사유 코드 이름 (예: `'invalid-index'`, `'invalid-date'`) 은 설계 단계에서 정한다. (GLOBAL AD-1 에서 결정)
- [x] 반환 형태 (`{ ok: true, state } | { ok: false, reason }` 등) 는 설계 단계에서 코드베이스의 기존 결과 타입 관례에 맞춰 정한다. (GLOBAL AD-1 에서 결정)

---

## Decisions Required

없음. 사용자가 범위를 정했고 위 기본값은 Assumptions 에 적었다.

---

## References

- GitHub issue #15
- `src/lib/ui/history/DayRow.svelte:137` (세션 `li`), `DayList.svelte`, `HistoryView.svelte`
- `src/lib/domain/progress.ts:94,98`, `src/lib/domain/steps.ts:49-51`, `src/lib/domain/proposal.ts:60`
- `src/lib/ui/history/importJson.ts:45`, `src/lib/domain/calendar.ts:88`
- `src/lib/ui/session/ExerciseCard.svelte:103`, `src/lib/ui/session/finish.ts:283`
- `src/routes/steps/+page.svelte:81` (`appState.apply` 사용례)
- `/home/ulismoon/Documents/bigsix/CLAUDE.md` (화면·도메인 규약)

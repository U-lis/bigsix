# Phase 3.5: Merge Parallel Branches

## Objective

Phase 3A / 3B / 3C 의 병렬 브랜치를 `feature/program-session` 으로 병합하고,
세 모듈이 만나는 두 지점을 배선한다.

1. **export 통합** — 세 Phase 가 의도적으로 미룬 `src/index.ts` 갱신
2. **`acceptProposal` 배선** — 3B 의 `markAccepted` + 3A 의 `switchProgram` (FR-4.8)
3. **EC-7 결합** — 3B 의 카운트 `floorDate` 에 3A 의 `currentStint.startedAt` 주입

이 Phase 없이는 3A 와 3B 가 서로를 모르는 반쪽 상태로 남는다.

---

## Merge Targets

| Branch | Phase | Status |
|--------|-------|--------|
| `feature/program-session-3A` | Phase 3A (프로그램 구간) | 🔴 Not Merged |
| `feature/program-session-3B` | Phase 3B (전환 제안) | 🔴 Not Merged |
| `feature/program-session-3C` | Phase 3C (세션 흐름) | 🔴 Not Merged |

**Base Branch**: `feature/program-session`

**주의**: Phase 3A/3B/3C 를 순차 실행했다면 브랜치 분리가 없을 수 있다.
그 경우 Merge Order 절을 건너뛰고 **Instructions 절부터** 수행한다.

---

## Expected Conflict Areas

Designer 의 병렬화 검증(GLOBAL.md) 결과, 파일 겹침은 아래 한 곳뿐이다.

| File | Reason | Resolution Strategy |
|------|--------|---------------------|
| `src/schedule.ts` | 3A 와 3B 가 **둘 다** `LABEL_TO_ID` 를 export 로 바꾼다 | **동일 내용 충돌.** 한쪽을 취하면 끝. 두 브랜치의 변경이 같은 줄, 같은 내용인지 확인 후 채택 |
| `src/index.ts` | 세 Phase 전부 export 추가를 **금지**당했다 | **충돌이 없어야 정상.** 충돌이 나면 규칙 위반 — 해당 브랜치의 `index.ts` 변경을 되돌리고 이 Phase 에서 일괄 처리 |
| `test/helpers.ts` | 세 Phase 전부 수정을 **금지**당했다 | **충돌이 없어야 정상.** 충돌 시 위와 동일하게 처리 |

**충돌이 예상보다 많이 나면 병렬화 규칙이 지켜지지 않은 것이다.**
그 경우 각 브랜치의 `git diff --name-only feature/program-session` 을 확인해
금지된 파일을 건드린 브랜치를 식별한다.

---

## Merge Order

파일 겹침이 없으므로 순서는 사실상 무관하다. 다만 **의존 방향을 따라** 3A 를 먼저 넣는다 —
`acceptProposal` 배선이 3A 의 `switchProgram` 을 필요로 하기 때문에,
3A 가 먼저 들어가 있으면 배선 작업 중 참조가 이미 존재한다.

1. **`feature/program-session-3A`** → `feature/program-session`
   - 예상 충돌: 없음 (`src/schedule.ts` 는 3B 와 함께 병합될 때만)
   - 비고: `src/program.ts`, `test/program.test.ts` 신규 + `src/schedule.ts` 의 export 한 줄

2. **`feature/program-session-3B`** → `feature/program-session`
   - 예상 충돌: `src/schedule.ts` (`LABEL_TO_ID` export — 동일 내용)
   - 해소: 두 변경이 같은 내용인지 `git diff` 로 확인 후 한쪽 채택

3. **`feature/program-session-3C`** → `feature/program-session`
   - 예상 충돌: 없음 (`src/session.ts`, `test/session.test.ts` 신규만)

---

## Merge Commands

```bash
cd /home/ulismoon/Documents/bigsix-feature-program-session
git checkout feature/program-session

git merge feature/program-session-3A
# 충돌 시: git diff --name-only --diff-filter=U 로 확인 → 해소 → git add . → git commit

git merge feature/program-session-3B
# src/schedule.ts 충돌 예상 — LABEL_TO_ID export. 동일 내용이면 한쪽 채택

git merge feature/program-session-3C

# 병합 직후 회귀 확인 (배선 전이므로 index.ts 관련 테스트는 아직 없다)
node --experimental-strip-types --test test/
```

---

## Instructions

### Step 1: `src/index.ts` export 통합

**Files**: `src/index.ts`

**Action**: 3A / 3B / 3C 의 공개 함수를 전부 export 한다.

```
export { describeProgram, describePrograms, firstTrainingDay,
         selectProgram, switchProgram, currentStint, stintAt,
         dayNumber, dayNumberOn, type ProgramDescription } from './program.ts';
export { proposeSwitch, commitProposal, activeProposal,
         declineProposal, markAccepted, PROGRAM_ORDER, nextProgramId } from './proposal.ts';
export { abandonChallenge, recordSession, recordConsolidation } from './session.ts';
```

기존 `planDay` / `planWeek` export 줄의 주석(ADR-1, Phase 1 Step 9)이 남아 있는지 확인한다.

### Step 2: `proposeSwitch` 편의 래퍼 — 3A 의 구간 정보 주입 (EC-7)

**Files**: `src/proposal.ts`

**Action**: 3B 는 `proposeSwitch(state, catalog, date, opts: { floorDate, programId })` 형태로
구간 정보를 **파라미터로 받도록** 설계되었다. 이제 그 값을 `currentStint` 에서 뽑는 래퍼를 추가한다.

```
proposeSwitchForCurrent(state, catalog, date: IsoDate): SwitchProposal | null
```

1. `currentStint(state)` 를 호출한다. `null` 이면 (프로그램 미선택) → `null` 반환
2. `proposeSwitch(state, catalog, date, {
     floorDate: stint.startedAt,
     programId: stint.programId,
   })` 를 호출해 결과를 그대로 반환한다

**이것이 EC-7 이 성립하는 유일한 지점이다.** `floorDate = stint.startedAt` 이므로
프로그램을 전환하면 새 구간의 `startedAt` 이 하한이 되어
이전 구간에서 쌓인 승급·유지 세션이 카운트에서 자동으로 빠진다.
**전용 리셋 코드가 없다** (ADR-7).

**주의**: 이제 `src/proposal.ts` 가 `src/program.ts` 를 import 한다.
Phase 3B 에서 금지했던 의존이 여기서 처음 허용된다. 방향은 `proposal → program` 단방향이며
`program.ts` 는 `proposal.ts` 를 import 하지 않는다 (순환 없음).

### Step 3: `acceptProposal` 배선 (FR-4.8)

**Files**: `src/index.ts` (또는 신규 배선 지점)

**Action**: 3B 의 `markAccepted` 와 3A 의 `switchProgram` 을 잇는다.

```
acceptProposal(state, catalog, onDate: IsoDate): AppState
```

1. `activeProposal(state)` 를 가져온다. `null` 이면 상태를 그대로 반환 (no-op)
2. `markAccepted(state, onDate)` 로 제안을 `accepted` 로 갱신한다
3. 그 결과에 `switchProgram(..., catalog, proposal.toProgramId, onDate)` 를 적용한다
4. 최종 상태를 반환한다

**FR-4.8 의 핵심**: 승인 시점이 **월요일이 아니어도** 승인한 그날부터 새 루틴이 시작된다.
`onDate` 에 요일 검사를 **넣지 않는다.** 월요일 제약은 제안 *생성*(FR-4.6)에만 적용된다.

새 구간의 `startedAt` 은 `switchProgram` 이 FR-2.6 규칙으로 계산한다 —
승인일이 새 루틴의 휴식일이면 다음 첫 운동일이 `startedAt` 이 된다.

**순서가 중요하다**: `markAccepted` 를 먼저 하고 `switchProgram` 을 나중에 한다.
반대로 하면 `activeProposal` 이 가리키는 대상이 바뀔 여지가 생긴다.

### Step 4: `test/helpers.ts` 공통 픽스처 추가

**Files**: `test/helpers.ts`

**Action**: Phase 3A/3B/3C 가 각자 로컬로 만든 픽스처 중 **통합 테스트가 공유해야 하는 것**을
`helpers.ts` 로 올린다. 세 Phase 의 로컬 픽스처는 그대로 둔다 (그 파일들을 수정하지 않는다).

최소한 아래를 제공한다.
- `stintFixture(programId, selectedAt, startedAt, endedAt)` — `ProgramStint` 생성
- `promoted(id, step, date)` — `promotedTo` 가 채워진 `SessionRecord`
- `plainSession(id, step, date)` — 유지 세션

**주의**: Phase 1 에서 확정한 `stateAt` 의 4인자 시그니처를 바꾸지 않는다.
기존 테스트들이 그것에 의존한다.

### Step 5: `test/integration.test.ts` 작성

**Files**: `test/integration.test.ts` (신규)

**Action**: 세 모듈이 만나야만 검증 가능한 시나리오를 테스트한다.
상세는 `PHASE_3.5_TEST.md` 참조. 핵심은 **EC-7** 이다 —
3A 의 `startedAt` 과 3B 의 카운트가 만나는 유일한 지점이므로 단독 Phase 에서는 검증할 수 없었다.

---

## Post-Merge Validation

### Quality Checks
```bash
cd /home/ulismoon/Documents/bigsix-feature-program-session

# 타입 체크 (타입 스트리핑 모드에서 실행 자체가 1차 검증)
node --experimental-strip-types --test test/

# 커버리지
node --experimental-strip-types --test --experimental-test-coverage test/

# 순환 의존 확인 — program.ts 가 proposal.ts 를 import 하면 안 된다
grep -n "proposal" src/program.ts

# NFR-5 재확인
grep -rn "new Date()" src/
```

### Integration Verification
- [ ] 3A / 3B / 3C 의 기능이 함께 동작한다
- [ ] `src/index.ts` 에서 세 모듈의 공개 함수가 전부 export 된다
- [ ] `proposeSwitchForCurrent` 가 `currentStint.startedAt` 을 `floorDate` 로 주입한다 (EC-7)
- [ ] `acceptProposal` 이 제안 승인과 구간 전환을 한 번에 처리한다 (FR-4.8)
- [ ] 기존 기능 회귀 없음 — Phase 1/2 시점 테스트 전량 통과
- [ ] `program.ts` → `proposal.ts` 역방향 import 없음 (순환 없음)

---

## Worktree Cleanup

병합이 성공하고 통합 테스트가 통과한 후에만 수행한다.

```bash
git worktree remove ../bigsix-feature-program-session-3A
git worktree remove ../bigsix-feature-program-session-3B
git worktree remove ../bigsix-feature-program-session-3C

git branch -d feature/program-session-3A
git branch -d feature/program-session-3B
git branch -d feature/program-session-3C
```

원격에 push 했다면:
```bash
git push origin --delete feature/program-session-3A
git push origin --delete feature/program-session-3B
git push origin --delete feature/program-session-3C
```

---

## Completion Checklist

- [ ] 3A / 3B / 3C 브랜치 전부 병합
- [ ] 충돌 전부 해소 (`src/schedule.ts` 외 충돌이 있었다면 원인 기록)
- [ ] `src/index.ts` 에 세 모듈 export 통합
- [ ] `proposeSwitchForCurrent` 추가 — `currentStint.startedAt` 을 `floorDate` 로 주입 (EC-7)
- [ ] `acceptProposal` 배선 — `markAccepted` → `switchProgram` 순서 (FR-4.8)
- [ ] `acceptProposal` 에 요일 검사 **없음** (FR-4.8: 월요일이 아니어도 승인 가능)
- [ ] `test/helpers.ts` 공통 픽스처 추가, `stateAt` 시그니처 불변
- [ ] `test/integration.test.ts` 작성 — **EC-7 포함**
- [ ] `program.ts` 가 `proposal.ts` 를 import 하지 않음 (순환 없음)
- [ ] 전체 테스트 통과
- [ ] 타입 체크 통과
- [ ] 워크트리 및 브랜치 정리

---

## Conflict Resolution Log

### `src/schedule.ts`
- **Conflict type**: (기입) 3A·3B 동시 `LABEL_TO_ID` export 변경 예상
- **Resolution**: (기입)

### (추가 충돌 기입)
- **Conflict type**:
- **Resolution**:

---

## Merge Commits

| Merge | Commit Hash | Timestamp |
|-------|-------------|-----------|
| Phase 3A | - | - |
| Phase 3B | - | - |
| Phase 3C | - | - |

*Updated upon completion*

---

## Notes

- 이 Phase 는 병합 작업 + **실제 코드 배선 2건**이 섞여 있다. 순수 병합 Phase 가 아니다.
  `proposeSwitchForCurrent` 와 `acceptProposal` 은 새로 작성하는 코드이며 테스트가 필요하다.
- **EC-7 은 이 Phase 에서만 검증 가능하다.** 3A 는 `startedAt` 을 정확히 세팅하는 것까지,
  3B 는 `floorDate` 를 존중하는 것까지만 증명했다. 둘이 실제로 연결되었는지는 여기서 본다.
- Phase 4 의 `planOn` 이 `activeProposal` 을 읽으므로, 이 Phase 에서 export 가 완료되어야 한다.

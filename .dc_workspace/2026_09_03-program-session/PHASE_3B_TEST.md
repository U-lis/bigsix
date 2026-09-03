# Phase 3B: Test Cases

## Test Coverage Target

**Minimum**: 70%. `src/proposal.ts` 전 함수 및 `proposeSwitch` 의 6개 조기 반환 경로 전부 커버.

**픽스처 규칙**: `test/helpers.ts` 수정 금지. 고유 픽스처는 `test/proposal.test.ts` 안에 로컬로.

**날짜 기준점**: `2026-09-07`(월) / `2026-09-14`(월) / `2026-09-21`(월),
비월요일 `2026-09-08`(화) ~ `2026-09-13`(일)

---

## Unit Tests

### `nextProgramId` (FR-4.7)

- [ ] Test case: 고정 순서를 따른다
  - Input: `new_blood` → Expected `good_behavior`
  - Input: `good_behavior` → Expected `veterano`
  - Input: `veterano` → Expected `solitary_confinement`
  - Input: `solitary_confinement` → Expected `supermax`
- [ ] Test case: `supermax` 에서는 제안하지 않는다
  - Input: `supermax`
  - Expected: `null`
- [ ] Test case: 알 수 없는 id → `null` (예외 아님)
- [ ] Test case: `PROGRAM_ORDER` 가 카탈로그의 5종 id 와 정확히 일치한다
  - Verify: 집합 비교. 누락·오타가 없음

### `lastSetbackDate` (FR-4.3, EC-5)

- [ ] Test case: 강등 기록이 없으면 `null`
- [ ] Test case: `outcome: 'abandoned'` 의 날짜를 반환한다
- [ ] Test case: `kind: 'consolidation'` 의 날짜를 반환한다
- [ ] Test case: 강등이 2개면 **가장 늦은** 것을 반환한다
  - Setup: `09-09` `abandoned`, `09-15` `consolidation`
  - Expected: `'2026-09-15'`
- [ ] Test case: `floorDate` 이전의 강등은 무시된다
- [ ] Test case: 다른 종목의 강등은 무시된다

### `effectiveFloor` (EC-5 하한 승격 — C-1 수정의 핵심)

- [ ] Test case: 강등이 없으면 `floorDate` 를 그대로 반환한다
- [ ] Test case: 강등이 있으면 **강등 다음날**을 반환한다
  - Setup: `floorDate = '2026-09-01'`, 강등 `'2026-09-09'`
  - Expected: `'2026-09-10'`
- [ ] Test case: 강등이 `floorDate` 보다 이르면 `floorDate` 가 이긴다
  - Setup: `floorDate = '2026-09-14'`, 강등 `'2026-09-09'`
  - Expected: `'2026-09-14'` (강등이 `floorDate` 이전이라 애초에 조회되지 않는다)
- [ ] Test case: 강등이 여러 개면 마지막 것 기준이다
  - Setup: 강등 `09-09`, `09-15`
  - Expected: `'2026-09-16'`

### `promotionBaseline` (ADR-7, EC-5, EC-6, EC-11)

- [ ] Test case: 승급 레코드가 없으면 `null`
  - Setup: `promotedTo` 없는 세션만 3개
  - Expected: `null`
- [ ] Test case: 승급 레코드 1개의 날짜를 반환한다
- [ ] Test case: **EC-6** 승급이 2개면 **가장 이른** 것이 기준점이다
  - Setup: `09-07` 승급, `09-09` 세션, `09-11` 승급
  - Expected: `'2026-09-07'` (`'2026-09-11'` 이 아니다)
  - **이것이 "추가 승급이 카운트를 리셋하지 않는다"(FR-4.4)의 구현이다**
- [ ] Test case: `floorDate` 이전의 승급은 무시된다
  - Setup: `09-01` 승급, `floorDate = '2026-09-07'`
  - Expected: `null`
- [ ] Test case: **EC-5** 강등 이전의 승급은 기준점이 되지 않는다
  - Setup: `09-07` 승급, `09-09` `abandoned`, `09-20` 재승급. `floorDate = '2026-09-01'`
  - Expected: `'2026-09-20'` (`'2026-09-07'` 이 아니다)
  - **`effectiveFloor` 가 `09-10` 으로 밀려 강등 이전 승급이 조회 범위 밖이다**
- [ ] Test case: `floorDate` 당일의 승급은 포함된다 (경계 포함)
- [ ] Test case: 다른 종목의 승급은 무시된다
  - Setup: `pushup` 승급만 있고 `squat` 을 조회
  - Expected: `null`
- [ ] Test case: **EC-11** RPE 보류 세션은 기준점이 되지 않는다
  - Setup: `blockedBy: 'rpe'`, `promotedTo: undefined` 인 세션
  - Expected: `null`
  - **`proposal.ts` 에 RPE 관련 조건문이 없어도 통과해야 한다**
- [ ] Test case: `blockedBy: 'master'` 세션도 기준점이 되지 않는다

### `maintenanceCount` (FR-4.1, FR-4.2)

- [ ] Test case: 승급이 없으면 0
- [ ] Test case: 승급 후 세션 3회면 3
  - Setup: `09-07` 승급, `09-09`/`09-11`/`09-14` 세션
  - Expected: `3`
- [ ] Test case: 승급 세션 자신은 카운트에 포함되지 않는다
  - Setup: `09-07` 승급 1개뿐
  - Expected: `0`
- [ ] Test case: **FR-4.2** 카운트 필터에 `kind` 조건이 없다
  - Verify: 코드 리뷰. `baseline` 이 강등 이후로 밀리므로 실제로 `consolidation` 이
    카운트 구간에 들어올 여지는 거의 없지만, 필터 문언 자체가 FR-4.2 를 따라야 한다
- [ ] Test case: **FR-4.2 / EC-4** 같은 날 2회 세션은 2로 센다
  - Setup: `09-09` 에 같은 종목 세션 2개
  - Expected: `2` (날짜 기준 1 이 아니다)
- [ ] Test case: **EC-5** 승급 직후 `abandoned` 가 있고 **재승급이 없으면** 0
  - Setup: `09-07` 승급, `09-09` `abandoned`, `09-11`/`09-14`/`09-16` 세션 (재승급 없음)
  - Expected: `0` (**세션 3회를 채웠어도 무효 — 카운트가 리셋되었다**)
- [ ] Test case: **EC-5** 승급 직후 `consolidation` 이 있고 재승급이 없으면 0
- [ ] Test case: **EC-5 — 강등 후 재승급하면 카운트가 0 이 아니라 새로 시작된다** ★ C-1 회귀 방지
  - Setup: `09-07` 승급 → `09-09` `abandoned` → `09-20` 재승급 → `09-22`/`09-24`/`09-26` 세션.
    `floorDate = '2026-09-01'`
  - Expected: `3` (**`0` 이 아니다**)
  - Verify: `effectiveFloor === '2026-09-10'`, `baseline === '2026-09-20'`
  - **강등을 사후 무효화로 구현하면 이 케이스가 0 이 되어 그 구간에서 제안이 영영 생성되지 않는다.
    SPEC EC-5 는 "리셋" 이지 "구간 내 영구 무효화" 가 아니다**
- [ ] Test case: **EC-5** 재승급 후 세션이 2회뿐이면 2 (3 미만)
  - Verify: 재계수가 정상 동작하되 임계를 넘지 못한 경우
- [ ] Test case: **EC-5** 강등 → 재승급 → 또 강등 → 또 재승급 도 정상 재계수된다
  - Setup: 강등·재승급 2회 반복 후 세션 3회
  - Expected: `3`. **하한이 마지막 강등 기준으로 계속 갱신된다**
- [ ] Test case: **EC-6** 카운트 도중 추가 승급이 있어도 유지된다
  - Setup: `09-07` 승급, `09-09` 세션, `09-11` 승급(=세션), `09-14` 세션
  - Expected: `3` (`09-07` 기준으로 이후 세션 3개). **리셋되지 않았다**
- [ ] Test case: **EC-7 전제** `floorDate` 를 뒤로 옮기면 카운트가 0 이 된다
  - Setup: 위 EC-6 시나리오에서 `floorDate = '2026-09-20'`
  - Expected: `0`
  - **Phase 3.5 에서 이 자리에 `currentStint.startedAt` 이 들어간다**
- [ ] Test case: 다른 종목의 세션은 세지 않는다

### `proposeSwitch` — 조기 반환 경로 (FR-4.10)

- [ ] Test case: **FR-4.6** 화요일에는 `null`
  - Setup: 조건이 완전히 충족된 상태
  - Input: `date = '2026-09-08'` (화)
  - Expected: `null`
- [ ] Test case: **FR-4.6** 수·목·금·토·일 5일도 전부 `null`
  - Input: `'2026-09-09'` ~ `'2026-09-13'`
  - Expected: 전부 `null`
- [ ] Test case: **FR-4.6** 같은 조건에서 월요일에는 제안이 생긴다
  - Input: `date = '2026-09-14'` (월)
  - Expected: `SwitchProposal` (`null` 이 아니다)
  - **화요일 케이스와 유일한 차이가 날짜임을 보여준다**
- [ ] Test case: **FR-4.7** `supermax` 에서는 월요일이어도 `null`
- [ ] Test case: **FR-4.6b** 이미 `pending` 이 있으면 `null`
  - Setup: `proposals` 에 `pending` 1개
  - Expected: `null`
- [ ] Test case: 종목 하나라도 3회 미달이면 `null`
  - Setup: `good_behavior` 의 4종목 중 3개는 3회, 1개는 2회
  - Expected: `null`
- [ ] Test case: 전 종목이 3회 이상이면 제안 생성
  - Expected: `status === 'pending'`, `resolvedAt === null`
- [ ] Test case: 생성된 제안의 필드가 정확하다
  - Expected: `proposedAt === date`, `fromProgramId === opts.programId`,
    `toProgramId === nextProgramId(opts.programId)`

### `proposeSwitch` — 잠긴 종목 (FR-4.5)

- [ ] Test case: **FR-4.5** 잠긴 `bridge`/`hspu` 는 판정 대상에서 제외된다
  - Setup: 빅4 가 6단계 미만이라 `bridge`/`hspu` 가 잠김.
    `good_behavior`(빅6 전부 다룸)에서 **해금된 빅4 만** 3회씩 충족
  - Expected: 제안이 생성된다 (`null` 이 아니다)
  - **잠긴 종목 때문에 제안이 영영 안 뜨는 상황을 막는다**
- [ ] Test case: 해금된 상태에서는 `bridge`/`hspu` 도 판정 대상이다
  - Setup: 빅4 전부 7단계 → `bridge`/`hspu` 해금. 빅4만 3회 충족, `bridge` 는 0회
  - Expected: `null`
- [ ] Test case: `new_blood` 는 빅4만 다루므로 잠금과 무관하다
  - Verify: 빅4 4종목만 판정 대상

### `proposeSwitch` — 순수성 (FR-4.10, NFR-2)

- [ ] Test case: 호출 후 `state.proposals` 가 변하지 않는다
  - Verify: 길이·내용 동일. **저장하지 않는다**
- [ ] Test case: 같은 인자로 두 번 호출하면 같은 결과
  - Verify: 결정적

### 상태 전이 함수 (ADR-6)

#### `commitProposal`
- [ ] Test case: `proposals` 에 push 된다
  - Expected: 길이 +1, 마지막이 `pending`
- [ ] Test case: 원본 `state` 불변 (NFR-2)
- [ ] Test case: **FR-4.6b** 이미 `pending` 이 있으면 예외
  - Verify: 불변식 위반을 조용히 넘기지 않는다

#### `activeProposal` (FR-4.6a)
- [ ] Test case: `pending` 이 있으면 반환
- [ ] Test case: `pending` 이 없으면 `null`
- [ ] Test case: `accepted`/`declined` 만 있으면 `null`
- [ ] Test case: **FR-4.6a** 시그니처에 날짜 인자가 없다
  - Verify: `activeProposal(state)` 1인자. **매일 노출됨이 구조로 보장된다**
- [ ] Test case: **FR-4.6a** 월요일에 생성된 제안이 화·수·목에도 그대로 반환된다
  - Setup: `09-07`(월) 에 `commitProposal`
  - Action: 날짜를 바꿔가며 `activeProposal` 호출 — 함수가 날짜를 안 받으므로 결과가 동일
  - Verify: 항상 같은 제안

#### `declineProposal` (FR-4.9)
- [ ] Test case: `status` 가 `'declined'` 로, `resolvedAt` 이 `onDate` 로 갱신된다
- [ ] Test case: 이후 `activeProposal` 이 `null`
- [ ] Test case: `pending` 이 없으면 no-op (예외 없음)
- [ ] Test case: 원본 불변 (NFR-2)
- [ ] Test case: 거절 레코드가 `proposals` 에 **보존된다**
  - Verify: 삭제되지 않고 `status` 만 바뀐다 (FR-4.9 "조회·통계 목적으로 남길 수 있다")

#### `markAccepted`
- [ ] Test case: `status` 가 `'accepted'` 로, `resolvedAt` 이 `onDate` 로 갱신된다
- [ ] Test case: **`stints` 가 변경되지 않는다**
  - Verify: 구간 전환은 Phase 3.5 책임. 이 Phase 는 `proposals` 만 건드린다
- [ ] Test case: `pending` 이 없으면 no-op

---

## Integration Tests

### FR-4.9 재제안 시나리오 (쿨다운 없음)
- [ ] Test case: **FR-4.9** 거절 후 다음 월요일에 같은 제안이 다시 생성된다
  - Setup: `09-07`(월) 제안 생성 → `commitProposal` → `09-09` 에 `declineProposal`
  - Action: `09-14`(월) 에 조건이 유지된 상태로 `proposeSwitch`
  - Verify: 같은 `toProgramId` 의 제안이 다시 나온다 (`null` 이 아니다)
  - **`proposeSwitch` 가 `declined` 이력을 읽지 않음이 증명된다**
- [ ] Test case: **FR-4.9** 거절을 3번 반복해도 4번째 월요일에 또 제안된다
  - Verify: 영구 차단 없음
- [ ] Test case: 거절 다음날(화요일)에는 재제안되지 않는다
  - Verify: FR-4.6(월요일만 생성)이 여전히 작동

### FR-4.9 + EC-5 결합 — 강등이 제안을 영구 차단하지 않는다 ★ C-1 회귀 방지
- [ ] Test case: 강등으로 제안이 막혔다가, 재승급 + 세션 3회 후 다시 제안된다
  - Setup: 전 종목 조건 충족 상태에서 한 종목에 `abandoned` 기록
  - Action 1: 다음 월요일 `proposeSwitch` → `null` (EC-5 리셋)
  - Setup 2: 그 종목이 재승급하고 이후 세션 3회 수행
  - Action 2: 그 다음 월요일 `proposeSwitch`
  - Verify: 제안이 생성된다. **한 번의 강등이 구간 전체를 막지 않는다 (FR-4.9)**

### 주간 흐름
- [ ] Test case: 주중에 조건을 채워도 그 주에는 제안이 안 생긴다 (FR-4.6)
  - Setup: `09-07`(월) 시점에는 미달, `09-09`(수) 에 마지막 종목 3회 달성
  - Action: `09-09`~`09-13` 각 날짜에 `proposeSwitch`
  - Verify: 전부 `null`
  - Action: `09-14`(월)
  - Verify: 제안 생성
- [ ] Test case: 생성 → 커밋 → 매일 노출 → 승인 전체 흐름
  - Setup/Action: `09-14` `proposeSwitch` → `commitProposal` → `09-15`~`09-17` `activeProposal` 확인 → `markAccepted('2026-09-17')`
  - Verify: 노출 3일 동안 동일 제안, 승인 후 `activeProposal` 이 `null`,
    `proposals` 마지막이 `accepted` + `resolvedAt === '2026-09-17'`

---

## Edge Cases

### Input Validation
- [ ] 빈 `history`: 모든 카운트 0, `proposeSwitch` 는 `null`
- [ ] 빈 `proposals`: `activeProposal` 이 `null`, `commitProposal` 정상 동작
- [ ] `opts.programId` 가 알 수 없는 id: `nextProgramId` 가 `null` → `proposeSwitch` 가 `null`

### Boundary Conditions
- [ ] 카운트가 정확히 3 → 제안 생성 (`>= 3`, 경계 포함)
- [ ] 카운트가 2 → `null`
- [ ] 카운트가 10 → 제안 생성
- [ ] `floorDate === baseline` 인 경우 (구간 시작일에 승급) → 정상 동작

### Error Handling
- [ ] `commitProposal` 중복 pending → 예외. 메시지에 불변식 위반임이 드러난다
- [ ] `declineProposal`/`markAccepted` 를 pending 없이 두 번 호출 → 두 번 다 no-op, 예외 없음

---

## Mock/Stub Requirements

**없음.** 순수 함수.

**로컬 픽스처** (이 파일 안에 정의):
```
promoted(id, step, date): SessionRecord      // promotedTo 가 채워진 레코드
plainSession(id, step, date): SessionRecord  // promotedTo 없음
abandoned(id, step, date): SessionRecord     // outcome: 'abandoned'
rpeBlocked(id, step, date): SessionRecord    // blockedBy: 'rpe', promotedTo 없음
maintained(ids, promoteDate, n): SessionRecord[]  // 여러 종목 승급 + n회 유지 세션 일괄 생성
```

---

## Test File Structure

```
test/
├── proposal.test.ts    # 신규 — 이 Phase 의 유일한 테스트 파일
│   ├── nextProgramId               (FR-4.7)
│   ├── lastSetbackDate             (FR-4.3)
│   ├── effectiveFloor              (EC-5 하한 승격)
│   ├── promotionBaseline           (EC-5, EC-6, EC-11)
│   ├── maintenanceCount            (FR-4.1, FR-4.2, EC-4, EC-5, EC-6)
│   ├── proposeSwitch — 요일        (FR-4.6)
│   ├── proposeSwitch — 잠긴 종목   (FR-4.5)
│   ├── proposeSwitch — 순수성      (FR-4.10)
│   ├── 상태 전이 4종               (FR-4.6a, FR-4.6b)
│   └── 재제안 시나리오             (FR-4.9)
└── helpers.ts          # 수정 금지
```

---

## Test Execution Commands

```bash
cd /home/ulismoon/Documents/bigsix-feature-program-session-3B

node --experimental-strip-types --test test/proposal.test.ts
node --experimental-strip-types --test test/
node --experimental-strip-types --test --experimental-test-coverage test/proposal.test.ts
```

---

## Test Status

| Test Category | Total | Passed | Failed | Coverage |
|--------------|-------|--------|--------|----------|
| Unit (카운트) | - | - | - | -% |
| Unit (proposeSwitch) | - | - | - | -% |
| Unit (상태 전이) | - | - | - | -% |
| Edge Cases (EC-5/6/11) | - | - | - | -% |
| Integration (재제안) | - | - | - | -% |
| **Total** | - | - | - | -% |

*Updated by code-validator upon completion*

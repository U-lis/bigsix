# Phase 3: finish-pure

## 목표

기록 규칙을 순수 함수 `planFinish` · `executeFinish` 로 구현하고, 스토어의 `finish` 메서드를 완성한다.
FR-42.3~7, FR-44.2, EC-89~96, EC-100~102, NFR-39 구현.

## 선행 조건

Phase 2 완료.

## 지침

### 1. `finish.ts` 신설 (`src/lib/ui/session/finish.ts`)

#### 타입 정의

```ts
type OpKind = 'work' | 'consolidation' | 'abandon' | 'free';

interface FinishOp {
  kind: OpKind;
  sets: number[];           // 기록할 세트 값
  setRpes: (number | null)[];
  target?: SessionTarget;
  completedAt: string;      // nowIsoLocal
  date: string;             // draft.startedAt
}

interface DraftOps {
  draftKey: string;
  ops: FinishOp[];
  summary: string;          // 사실 문구
}

interface FinishPlan {
  groups: DraftOps[];
}

type FinishScope = { kind: 'all' } | { kind: 'date'; date: string };

interface PerDraftResult {
  draftKey: string;
  ok: boolean;
  reason?: string;
}

interface FinishResult {
  nextState: AppState;
  perDraft: PerDraftResult[];
}
```

#### `planFinish(drafts, agendaOrder, scope?)` 구현

- `scope` 가 `{ kind: 'date', date }` 이면 `draft.startedAt === date` 인 칸만 대상으로 한다.
- 대상 칸마다 플래너 규칙을 적용한다 (ADR-44):
  - `workSets` 길이 0 → op 없음, DraftOps 생성 안 함 (EC-89)
  - work 칸, `abandoned === false/undefined`:
    - M = `workSets.length`, N = `target?.work.length ?? workSets.length`
    - M ≤ N → op `work` (전체 세트)
    - M > N → op `work`(앞 N 세트) + op `free`(나머지, `performedStep = draft.performedStep`)
  - work 칸, `abandoned === true` → op `abandon` (전체 세트)
  - consolidation 칸:
    - N = `target?.work.length ?? workSets.length`
    - M ≤ N → op `consolidation` (전체)
    - M > N → op `consolidation`(앞 N) + op `free`(나머지, `performedStep = draft.step - 1`)
  - free 칸 → op `free` (전체)
- `setRpes` 는 해당 op 의 세트 슬라이스에 맞춰 `workSets.map(e => e.rpe ?? null)` 에서 슬라이스.
- `target` 은 `draft.target` (있는 경우만, undefined 는 op 에 포함하지 않는다).
- `summary` 문구 규칙 (R-4, NFR-2):
  - work: 「{종목명} {단계}: 정규 N세트」
  - work + free: 「{종목명} {단계}: 정규 N세트 · 추가 M세트」
  - consolidation + free: 「{종목명} {단계}: 다지기 N세트 · 추가 M세트」
  - abandon: 「{종목명} {단계}: 중단」
  - free(단독): 「{종목명} {단계}: 자유 운동 N세트」
  - 종목명·단계명은 이 함수의 인자로 받거나, DraftOps 에 포함하지 않고 UI 에서 조합한다.
    → summary 에 종목명을 포함할 필요가 없으면 세트 수 사실만 담는다.
- **그룹 순서**: `agendaOrder` 의 종목 순서 기준. 한 종목 안에서는 `work` 먼저, `consolidation` 다음.
  `free` 칸은 마지막.

#### `executeFinish(state, catalog, plan, nowIsoLocal)` 구현

- `plan.groups` 를 순서대로 처리한다.
- 각 그룹은 원자적:
  ```
  let tempState = state;
  for (const op of group.ops) {
    tempState = applyOp(tempState, catalog, op);  // throws 가능
  }
  state = tempState;  // 그룹 전체 성공 시 커밋
  ```
  op 하나라도 throw 하면 `tempState` 를 버리고 `{ ok: false, reason: err.message }` 기록.
  다음 그룹은 원래 `state` 를 기준으로 계속한다.
- `applyOp` 의 도메인 함수 매핑:
  - `work` → `applySession(state, catalog, { date, progressionId, step, performedStep, sets, kind: 'work', ... })`
  - `consolidation` → `recordConsolidation(state, catalog, progressionId, date, sets, rpe, extras)`
  - `abandon` → `abandonChallenge(state, catalog, progressionId, date, sets, rpe, extras)`
  - `free` → `applySession(state, catalog, { ..., kind: 'free', step: performedStep })`
- `completedAt`, `setRpes`, `target` 을 extras 로 전달. undefined 필드는 명시 대입하지 않는다 (기존 `buildExtras` 규약).
- `rpe` = `Math.max(...setRpes.filter(r => r !== null))` 또는 undefined.
- 반환: `{ nextState, perDraft: PerDraftResult[] }`.

### 2. `session.svelte.ts` 의 `finish` 메서드 완성

Phase 2 의 stub 을 교체한다:

```ts
finish(state, catalog, nowIsoLocal, scope?) {
  const agendaOrder = Object.keys(this.#drafts);  // TODO: 실제 agenda 순서 연결 (Phase 4)
  const plan = planFinish(this.#drafts, agendaOrder, scope);
  const { nextState, perDraft } = executeFinish(state, catalog, plan, nowIsoLocal);
  // 성공한 칸만 삭제
  for (const r of perDraft) {
    if (r.ok) {
      const { [r.draftKey]: _, ...rest } = this.#drafts;
      this.#drafts = rest;
    }
  }
  this.persist();
  return { nextState, perDraft };
}
```

Phase 4 에서 실제 agenda 순서를 연결한다.

## 완료 체크리스트

- [ ] `finish.ts` 에 `planFinish`, `executeFinish`, 관련 타입 구현됨
- [ ] 빈 칸(세트 0개)이 계획에서 제외됨 (EC-89)
- [ ] work 칸 초과 세트가 `free` op 으로 분리됨 (EC-91)
- [ ] consolidation 칸 초과 세트가 `free` op 으로 분리되고 `performedStep = step - 1` (EC-92)
- [ ] 중단 칸이 `abandon` op 으로 처리됨 (FR-41.2)
- [ ] 그룹 원자성 — 중간 그룹 실패 시 해당 그룹만 건너뜀, 이후 그룹 계속 (FR-42.6)
- [ ] `session.svelte.ts` 의 `finish` stub 이 실제 구현으로 교체됨
- [ ] 성공한 칸만 `drafts` 에서 삭제됨 (FR-42.6)
- [ ] `setRpes` 가 op 의 세트 슬라이스에 맞게 잘림
- [ ] `completedAt` 이 모든 op 에 전달됨
- [ ] `scope: date` 필터가 동작함 (FR-44.2)
- [ ] `pnpm check` 오류 0
- [ ] `pnpm test` 전부 통과 (베이스라인 920)

## 비고

- `planFinish` 와 `executeFinish` 는 룬을 import 하지 않는 순수 함수다. SSR 에서도 동작하며 단위 테스트가 직접 호출할 수 있다 (R-5).
- summary 문구에 종목명을 넣으려면 catalog 를 인자로 추가해야 한다. Phase 4 에서 UI 레이블 모듈(`summarizeDraft`)이 이를 처리하므로, `planFinish` 는 세트 수 사실만 담는 summary 를 생성하고, UI 가 종목명을 추가한다.

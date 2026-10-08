/**
 * 진행 중 세션 스토어 (FR-2 / FR-39 / FR-41.2 / ADR-41 / ADR-42 / ADR-45).
 *
 * SPEC5 — 진행 중 기록을 종목별 **칸**(`SessionDraft`) 으로 쪼개
 * `#drafts: Record<string, SessionDraft>` 로 들고 다닌다. 키는
 * `draftKey(progressionId, kind)` 다. 한 종목에 work · consolidation · free 칸이
 * 공존할 수 있다 (한 종목에 free 칸은 최대 하나).
 *
 * 변경은 모두 **불변 spread** 로 처리한다 (R-3) — Svelte 반응성 유지.
 * 세트를 하나 입력할 때마다 저장한다 (FR-2.3 / D-3).
 *
 * Phase 4 에서 임시 호환 래퍼(`begin` · `pushWorkSet` · `updateWorkSet` · `finalize`
 * · `abandon`) 를 제거했다. 남은 두 메서드 `value` getter / `discard()` 와 함수
 * `isStaleStartedAt` 은 Phase 5 가 다룰 ExportBar · reset.ts · StaleBanner 가 쓰는
 * **임시 shim** 이다 — Phase 5 종료 시 함께 사라진다.
 */

import type {
  AppState,
  Catalog,
  IsoDate,
  PlannedExercise,
  ProgressionId,
} from '$lib/domain/types';
import { planConsolidation } from '$lib/domain';
import {
  executeFinish,
  planFinish,
  type FinishResult,
  type FinishScope,
} from '$lib/ui/session/finish';
import {
  clearInProgress,
  draftKey,
  writeInProgress,
  type SessionDraft,
  type SetEntry,
} from '$lib/ui/state/storage';

type DraftKind = SessionDraft['kind'];

export type { FinishResult, FinishScope };

class InProgressStore {
  /**
   * 진행 중 칸 맵 (ADR-42). 키는 `draftKey(progressionId, kind)` (ADR-41).
   * 모든 변경은 불변 spread 로 처리한다 (R-3).
   */
  #drafts = $state<Record<string, SessionDraft>>({});
  #saveStatus = $state<'ok' | 'write-blocked'>('ok');

  get drafts(): Record<string, SessionDraft> {
    return this.#drafts;
  }

  get saveStatus(): 'ok' | 'write-blocked' {
    return this.#saveStatus;
  }

  // ── 기본 API ───────────────────────────────────────────────────────────

  /** 부팅 시 복원. `boot()` 이 부른다. */
  init(loaded: Record<string, SessionDraft> | null): void {
    this.#drafts = loaded ?? {};
    this.#saveStatus = 'ok';
  }

  /**
   * 칸 하나를 꺼낸다. `onDate` 가 주어지면 `draft.startedAt === onDate` 인 칸만
   * 돌려준다 — 그 날짜의 칸이 아니면 undefined (오늘 카드에서 날짜 넘긴 칸을 걸러낼 때 쓴다).
   */
  getDraft(
    progressionId: ProgressionId,
    kind: DraftKind,
    onDate?: IsoDate,
  ): SessionDraft | undefined {
    const key = draftKey(progressionId, kind);
    const draft = this.#drafts[key];
    if (draft === undefined) return undefined;
    if (onDate !== undefined && draft.startedAt !== onDate) return undefined;
    return draft;
  }

  /**
   * `work` 칸을 시작한다. 키 충돌 시 **덮어쓰지 않는다** — 이미 쌓인 세트를
   * 보호한다 (FR-39.2 / EC-99 / EC-100). 번갈아 운동하는 사용자가 다른 종목을
   * 손댔다가 돌아왔을 때 기존 세트가 사라지면 안 되기 때문이다.
   *
   * `plan.goal` · `plan.work` 를 `target` 스냅샷으로 저장한다 (FR-39.3 / ADR-22).
   *
   * 돌려주는 값은 **새로 열렸는지** 다 — `true` 는 새 칸 생성, `false` 는 기존 칸이
   * 있어 보호된 경우 (ExerciseCard 가 입력 상실을 감지하는 신호).
   */
  beginWork(startedAt: IsoDate, plan: PlannedExercise): boolean {
    const key = draftKey(plan.progressionId, 'work');
    if (this.#drafts[key] !== undefined) return false;
    const draft: SessionDraft = {
      startedAt,
      progressionId: plan.progressionId,
      step: plan.step,
      performedStep: plan.performedStep,
      kind: 'work',
      workSets: [],
      target: { goal: plan.goal, work: plan.work },
    };
    this.#drafts = { ...this.#drafts, [key]: draft };
    this.persist();
    return true;
  }

  /**
   * 자유 운동 칸 시작 (FR-18.1). 계획이 없으므로 `target` 도 없다.
   * 키 충돌 시 덮어쓰지 않는다 — 사용자가 같은 종목 free 칸에 다시 들어와도
   * 기존 세트를 보호한다.
   *
   * 돌려주는 값은 **새로 열렸는지** 다 — `true` 는 새 칸 생성, `false` 는 기존 칸이
   * 있어 보호된 경우.
   */
  beginFree(startedAt: IsoDate, progressionId: ProgressionId, step: number): boolean {
    const key = draftKey(progressionId, 'free');
    if (this.#drafts[key] !== undefined) return false;
    const draft: SessionDraft = {
      startedAt,
      progressionId,
      step,
      performedStep: step,
      kind: 'free',
      workSets: [],
    };
    this.#drafts = { ...this.#drafts, [key]: draft };
    this.persist();
    return true;
  }

  /**
   * 다지기 칸 시작 (ADR-45). 도메인 `planConsolidation` 으로 목표를 만들어
   * `target` 스냅샷으로 저장한다. `linkedTo` 는 이 다지기가 뒤잇는 work 칸 키다
   * (EC-94 — abandon 취소 시 함께 닫을지 묻는 근거).
   *
   * 키 충돌 시 덮어쓰지 않는다 — 다지기 칸이 이미 있으면 그대로 둔다.
   */
  beginConsolidation(
    startedAt: IsoDate,
    state: AppState,
    catalog: Catalog,
    progressionId: ProgressionId,
    linkedTo: string,
  ): void {
    const key = draftKey(progressionId, 'consolidation');
    if (this.#drafts[key] !== undefined) return;
    const planned = planConsolidation(state, catalog, progressionId);
    const draft: SessionDraft = {
      startedAt,
      progressionId,
      step: planned.step,
      performedStep: planned.performedStep,
      kind: 'consolidation',
      workSets: [],
      target: { goal: planned.goal, work: planned.work },
      linkedTo,
    };
    this.#drafts = { ...this.#drafts, [key]: draft };
    this.persist();
  }

  pushSet(key: string, entry: SetEntry): void {
    const draft = this.#drafts[key];
    if (draft === undefined) return;
    const next: SessionDraft = { ...draft, workSets: [...draft.workSets, entry] };
    this.#drafts = { ...this.#drafts, [key]: next };
    this.persist(); // FR-2.3 — 세트마다 저장
  }

  updateSet(key: string, index: number, entry: SetEntry): void {
    const draft = this.#drafts[key];
    if (draft === undefined) return;
    if (index < 0 || index >= draft.workSets.length) return;
    const nextSets = [...draft.workSets];
    nextSets[index] = entry;
    this.#drafts = { ...this.#drafts, [key]: { ...draft, workSets: nextSets } };
    this.persist();
  }

  removeSet(key: string, index: number): void {
    const draft = this.#drafts[key];
    if (draft === undefined) return;
    if (index < 0 || index >= draft.workSets.length) return;
    const nextSets = [...draft.workSets];
    nextSets.splice(index, 1);
    this.#drafts = { ...this.#drafts, [key]: { ...draft, workSets: nextSets } };
    this.persist();
  }

  /**
   * 「이 단계 중단」 토글 (ADR-45). 즉시 기록하지 않고 플래그만 세운다 —
   * 「오늘 운동 마치기」 시점의 플래너가 abandon op 로 전환한다.
   */
  markAbandoned(key: string, abandoned: boolean): void {
    const draft = this.#drafts[key];
    if (draft === undefined) return;
    this.#drafts = { ...this.#drafts, [key]: { ...draft, abandoned } };
    this.persist();
  }

  /** 단일 칸 제거. */
  discardDraft(key: string): void {
    if (!(key in this.#drafts)) return;
    const next = { ...this.#drafts };
    delete next[key];
    this.#drafts = next;
    this.persist();
  }

  /** 전체 비우기. */
  discardAll(): void {
    this.#drafts = {};
    this.persist();
  }

  /**
   * 「오늘 운동 마치기」 시점의 기록·판정 (ADR-44).
   *
   * `planFinish` 로 작업 플랜을 만들고 `executeFinish` 로 도메인에 적용한다.
   * 성공한 칸만 drafts 맵에서 제거한다 (FR-42.6) — 실패 칸은 남겨 다시 시도할 수
   * 있게 한다.
   *
   * `nextState` 를 `appState` 에 반영하는 일은 호출자(+page.svelte / FinishBar) 가
   * 한다. 이 메서드는 스토어 자체(drafts)만 바꾼다.
   *
   * `agendaOrder` 는 호출자가 오늘 화면의 실제 agenda 순서에서 끌어온다.
   */
  finish(
    state: AppState,
    catalog: Catalog,
    nowIsoLocal: string,
    scope?: FinishScope,
    agendaOrder?: readonly ProgressionId[],
  ): FinishResult {
    const order: readonly ProgressionId[] = agendaOrder ?? Array.from(
      new Set(Object.values(this.#drafts).map((d) => d.progressionId)),
    );
    const plan = planFinish(this.#drafts, order, scope);
    const result = executeFinish(state, catalog, plan, nowIsoLocal);

    // 성공한 칸만 drafts 에서 지운다 (FR-42.6).
    let next = this.#drafts;
    for (const r of result.perDraft) {
      if (r.ok && r.draftKey in next) {
        const { [r.draftKey]: _dropped, ...rest } = next;
        next = rest;
      }
    }
    if (next !== this.#drafts) {
      this.#drafts = next;
      this.persist();
    }

    return result;
  }

  // ── Phase 5 shim — ExportBar · reset.ts 가 남아 있는 동안만 유지 ─────
  //
  // Phase 5 에서 ExportBar 는 `Object.keys(drafts).length` 로, reset.ts 는
  // `discardAll()` 로 전환된다. 그 커밋에서 아래 두 멤버는 함께 사라진다.

  /**
   * [COMPAT · Phase 5 제거] ExportBar 의 `hasInProgress` 가 참조한다. 다중 칸
   * 모델에서는 의미가 모호하다 (어떤 칸?). 「하나라도 있는가」를 묻는 용도로만
   * 쓴다. drafts 맵에서 아무 draft 하나를 돌려주고, 비었으면 null.
   */
  get value(): SessionDraft | null {
    const keys = Object.keys(this.#drafts);
    if (keys.length === 0) return null;
    return this.#drafts[keys[0]];
  }

  /** [COMPAT · Phase 5 제거] reset.ts 가 전체 초기화에서 쓴다 — `discardAll` 과 동일. */
  discard(): void {
    this.discardAll();
  }

  /** 저장은 drafts 가 비면 키를 지우고(옛 세션 모델과 같은 결과), 아니면 봉투를 쓴다. */
  private persist(): void {
    try {
      if (Object.keys(this.#drafts).length === 0) {
        clearInProgress();
      } else {
        writeInProgress(this.#drafts);
      }
      this.#saveStatus = 'ok';
    } catch {
      this.#saveStatus = 'write-blocked';
    }
  }
}

/**
 * [COMPAT · Phase 5 제거] 시작 날짜가 오늘이 아닌지 판정 (FR-2.9 / EC-7a).
 *
 * Phase 5 (ADR-48) 가 `stale.ts` 의 `staleDrafts` + `StaleBanner` 로 교체한다.
 * 지금은 참조처가 없다 — Phase 5 이전에 지워져도 무방하지만 Phase 5 범위
 * (StaleBanner 교체) 를 작게 유지하기 위해 남겨 둔다.
 */
export function isStaleStartedAt(
  session: SessionDraft | null,
  today: IsoDate,
): boolean {
  if (session === null) return false;
  return session.startedAt !== today;
}

export const inProgress = new InProgressStore();

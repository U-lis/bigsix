/**
 * 진행 중 세션 스토어 (FR-2 / FR-39 / FR-41.2 / ADR-41 / ADR-42 / ADR-45).
 *
 * SPEC5 Phase 2 — 진행 중 기록을 종목별 **칸**(`SessionDraft`) 으로 쪼개
 * `#drafts: Record<string, SessionDraft>` 로 들고 다닌다. 키는
 * `draftKey(progressionId, kind)` 다. 한 종목에 work · consolidation · free 칸이
 * 공존할 수 있다 (한 종목에 free 칸은 최대 하나).
 *
 * 변경은 모두 **불변 spread** 로 처리한다 (R-3) — Svelte 반응성 유지.
 * 세트를 하나 입력할 때마다 저장한다 (FR-2.3 / D-3).
 *
 * 완료 로직(`finish`) 과 플래너·실행기(`planFinish`/`executeFinish`)는 Phase 3 에서
 * 구현한다. 이 파일의 `finish` 는 Phase 3 자리이고, `finalize`/`abandon` 는
 * ExerciseCard · +page.svelte 가 Phase 4 에서 FinishBar 로 넘어갈 때까지 쓰는
 * **임시 호환 래퍼** 다 (R-2).
 */

import {
  abandonChallenge,
  applySession,
  planConsolidation,
  recordConsolidation,
  type AbandonResult,
} from '$lib/domain';
import type {
  AppState,
  Catalog,
  IsoDate,
  PlannedExercise,
  ProgressionId,
  SessionExtras,
  SessionInput,
  SessionRecord,
} from '$lib/domain/types';
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
import { todayClock } from '$lib/ui/state/today.svelte';

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
   * 있어 보호된 경우 (Phase 4 에서 UI 가 입력 상실을 감지하는 신호).
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
   * `agendaOrder` 는 Phase 2 임시로 drafts 삽입 순서를 쓴다 — Phase 4 에서 오늘
   * 화면의 실제 agenda 순서를 넘겨받도록 바뀐다.
   */
  finish(
    state: AppState,
    catalog: Catalog,
    nowIsoLocal: string,
    scope?: FinishScope,
  ): FinishResult {
    const agendaOrder = Array.from(
      new Set(Object.values(this.#drafts).map((d) => d.progressionId)),
    );
    const plan = planFinish(this.#drafts, agendaOrder, scope);
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

  // ── Phase 4 에서 제거할 임시 호환 래퍼 (R-2) ─────────────────────────
  //
  // ExerciseCard · +page.svelte · ExportBar · reset.ts 가 아직 단일 세션 모델을
  // 쓴다. Phase 4 에서 ui-cards 가 FinishBar · drafts 바인딩으로 넘어가면 아래
  // 래퍼들은 모두 제거한다. 여기 묶어 두어 Phase 4 때 통째로 지우기 쉽게 한다.

  /**
   * [COMPAT · Phase 4 제거] 단일 세션 모델의 `inProgress.value` 를 흉내낸다.
   * drafts 맵에서 하나를 꺼내 돌려준다. 둘 이상이면 첫 번째를 돌려주므로,
   * 다중 종목이 열린 상태에서의 의미는 모호하다 — Phase 4 에서 카드가 자기 칸을
   * `drafts` 에서 직접 집어가면 이 getter 는 사라진다.
   */
  get value(): SessionDraft | null {
    const keys = Object.keys(this.#drafts);
    if (keys.length === 0) return null;
    return this.#drafts[keys[0]];
  }

  /**
   * [COMPAT · Phase 4 제거] 기존 `begin(startedAt, plan)` — kind 가 work 든
   * consolidation 이든 플랜 하나로 칸을 연다. ExerciseCard · +page.svelte 가
   * 다지기 승인에도 이걸 쓴다. Phase 4 에서 beginWork · beginConsolidation 으로
   * 쪼갠다.
   *
   * 기존 단일 세션 모델이 그랬듯 **덮어쓴다** — 같은 키가 있으면 교체한다
   * (Phase 2 의 beginWork 는 보호하지만, 이 래퍼는 옛 호출자의 기대를 따른다).
   */
  begin(startedAt: IsoDate, plan: PlannedExercise): void {
    const key = draftKey(plan.progressionId, plan.kind);
    const draft: SessionDraft = {
      startedAt,
      progressionId: plan.progressionId,
      step: plan.step,
      performedStep: plan.performedStep,
      kind: plan.kind,
      workSets: [],
      target: { goal: plan.goal, work: plan.work },
    };
    this.#drafts = { ...this.#drafts, [key]: draft };
    this.persist();
  }

  /** [COMPAT · Phase 4 제거] 가장 처음 들어온 칸에 세트를 민다. */
  pushWorkSet(entry: SetEntry): void {
    const keys = Object.keys(this.#drafts);
    if (keys.length === 0) return;
    this.pushSet(keys[0], entry);
  }

  /** [COMPAT · Phase 4 제거] 가장 처음 들어온 칸의 세트를 바꾼다. */
  updateWorkSet(index: number, entry: SetEntry): void {
    const keys = Object.keys(this.#drafts);
    if (keys.length === 0) return;
    this.updateSet(keys[0], index, entry);
  }

  /**
   * [COMPAT · Phase 4 제거] 단일 세션 완료. 첫 칸을 꺼내 도메인에 기록한 뒤 그
   * 칸만 제거한다. Phase 3 의 `finish` 가 플래너·실행기로 다중 칸을 처리하게
   * 되면 이 래퍼는 Phase 4 에서 사라진다.
   */
  finalize(
    state: AppState,
    catalog: Catalog,
  ): { record: SessionRecord; nextState: AppState } {
    const keys = Object.keys(this.#drafts);
    if (keys.length === 0) throw new Error('진행 중 세션이 없다');
    const key = keys[0];
    const s = this.#drafts[key];
    const values = s.workSets.map((e) => e.value);
    const sessionRpe = maxSetRpe(s.workSets);
    const extras = buildExtras(s);

    let nextState: AppState;
    let record: SessionRecord;

    if (s.kind === 'consolidation') {
      const result = recordConsolidation(
        state,
        catalog,
        s.progressionId,
        s.startedAt,
        values,
        sessionRpe,
        extras,
      );
      nextState = result.state;
      record = result.record;
    } else {
      const input: SessionInput = {
        date: s.startedAt, // FR-2.8 / D-7
        progressionId: s.progressionId,
        step: s.step,
        performedStep: s.performedStep,
        sets: values,
        kind: s.kind, // 'work' | 'free'
      };
      if (sessionRpe !== undefined) input.rpe = sessionRpe;
      if (extras.target !== undefined) input.target = extras.target;
      if (extras.setRpes !== undefined) input.setRpes = extras.setRpes;
      if (extras.completedAt !== undefined) input.completedAt = extras.completedAt;
      const result = applySession(state, catalog, input);
      nextState = result.state;
      record = result.record;
    }

    this.discardDraft(key);
    return { record, nextState };
  }

  /**
   * [COMPAT · Phase 4 제거] 단일 세션 중단. 첫 칸을 꺼내 도메인 `abandonChallenge`
   * 에 넘긴 뒤 그 칸을 제거한다. Phase 4 에서 FinishBar 플래너가 abandon op 로
   * 전환하면 이 래퍼는 사라진다.
   */
  abandon(state: AppState, catalog: Catalog): AbandonResult {
    const keys = Object.keys(this.#drafts);
    if (keys.length === 0) throw new Error('진행 중 세션이 없다');
    const key = keys[0];
    const s = this.#drafts[key];
    const values = s.workSets.map((e) => e.value);
    const sessionRpe = maxSetRpe(s.workSets);
    const extras = buildExtras(s);

    const result = abandonChallenge(
      state,
      catalog,
      s.progressionId,
      s.startedAt, // FR-2.8
      values,
      sessionRpe,
      extras,
    );

    this.discardDraft(key);
    return result;
  }

  /** [COMPAT · Phase 5 제거] 전체 비우기 (reset.ts 가 부른다). */
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
 * 세트별 RPE 중 최댓값 (FR-6.7a).
 * 하나도 없으면 undefined 를 돌려준다 — 0 으로 채우지 않는다.
 */
export function maxSetRpe(entries: SetEntry[]): number | undefined {
  const rpes = entries.map((e) => e.rpe).filter((r): r is number => r !== undefined);
  if (rpes.length === 0) return undefined;
  return Math.max(...rpes);
}

/**
 * 진행 중 칸에서 FR-28 세 필드를 만든다 (ADR-23).
 *
 * - `target` — 시작 시점의 스냅샷. begin 이 저장해 두었다. 자유 운동은 없다.
 * - `setRpes` — 세트마다의 RPE 배열. 미입력은 null.
 * - `completedAt` — 완료·중단 시각. `todayClock.nowIsoLocal()` 로 로컬 오프셋 포함.
 */
function buildExtras(session: SessionDraft): SessionExtras {
  const extras: SessionExtras = {
    setRpes: session.workSets.map((e) => e.rpe ?? null),
    completedAt: todayClock.nowIsoLocal(),
  };
  if (session.target !== undefined) extras.target = session.target;
  return extras;
}

/**
 * [COMPAT · Phase 5 제거] 시작 날짜가 오늘이 아닌지 판정 (FR-2.9 / EC-7a).
 *
 * +page.svelte 가 단일 세션 모델로 상단 배너를 띄우는 자리에서 쓴다.
 * Phase 5 (ADR-48) 가 `stale.ts` 의 `staleDrafts` + `StaleBanner` 로 교체하면
 * 이 shim 은 사라진다.
 */
export function isStaleStartedAt(
  session: SessionDraft | null,
  today: IsoDate,
): boolean {
  if (session === null) return false;
  return session.startedAt !== today;
}

export const inProgress = new InProgressStore();

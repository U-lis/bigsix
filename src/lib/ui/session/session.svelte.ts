/**
 * 진행 중 세션 스토어 (FR-2).
 *
 * `SessionRecord` 는 완결된 세션만 표현하므로 UI 쪽 별도 스키마다 (FR-2.1).
 * 세트 값을 하나 입력할 때마다 저장한다 (FR-2.3 / D-3).
 *
 * 완료 시 세트별 RPE 중 **최댓값**을 세션 RPE 로 넘긴다 (FR-6.7a / D-11).
 * 하나도 없으면 필드 자체를 만들지 않는다 — 0 으로 대체하지 않는다.
 * 세트별 RPE 원본은 진행 중 세션 스토어에는 있고, 완료 시 `setRpes` 로 도메인 기록에
 * 넘어간다 (FR-28.1). `SessionRecord.rpe` 는 계속 최댓값 하나이며 판정만 그것을 본다.
 *
 * 완료 시 세션 스냅샷 세 필드를 도메인에 얹는다 (FR-28 / ADR-23):
 *   - `target` — begin 시점의 `plan.goal` · `plan.work` 스냅샷.
 *   - `setRpes` — 세트별 RPE 배열 (미입력 자리는 null).
 *   - `completedAt` — `todayClock.nowIsoLocal()` 이 낸 로컬 오프셋 포함 ISO 문자열.
 *
 * 완료·중단 시 `applySession` / `abandonChallenge` 로 도메인에 반영하고 진행 중
 * 데이터를 제거한다 (FR-2.5).
 */

import {
  abandonChallenge,
  applySession,
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
  clearInProgress,
  writeInProgress,
  type InProgressSession,
  type SetEntry,
} from '$lib/ui/state/storage';
import { todayClock } from '$lib/ui/state/today.svelte';

class InProgressStore {
  #session = $state<InProgressSession | null>(null);
  #saveStatus = $state<'ok' | 'write-blocked'>('ok');

  get value(): InProgressSession | null {
    return this.#session;
  }

  get saveStatus(): 'ok' | 'write-blocked' {
    return this.#saveStatus;
  }

  /** 부팅 시 복원. `boot()` 이 부른다. */
  init(loaded: InProgressSession | null): void {
    this.#session = loaded;
    this.#saveStatus = 'ok';
  }

  /**
   * 진행 중 세션을 시작한다.
   * `startedAt` 은 UI 층이 주입한다 (todayClock 값) — 이 값이 완료 시 SessionInput.date 가 된다.
   *
   * `plan.goal` · `plan.work` 를 `target` 스냅샷으로 저장한다 (FR-28.3 / ADR-22).
   * 세션이 끝난 뒤 단계가 오르내려도 시작 시점 목표는 그대로 남는다 —
   * 그래서 재계산이 아니라 스냅샷이 필요하다.
   */
  begin(startedAt: IsoDate, plan: PlannedExercise): void {
    this.#session = {
      startedAt,
      progressionId: plan.progressionId,
      step: plan.step,
      performedStep: plan.performedStep,
      kind: plan.kind,
      workSets: [],
      target: { goal: plan.goal, work: plan.work },
    };
    this.persist();
  }

  /**
   * 자유 운동 세션 시작 (FR-18.1). 계획(PlannedExercise)이 없으므로 UI 가
   * 사용자의 선택(종목·단계)을 그대로 넘긴다. `performedStep` 은 사용자가
   * 실제로 수행하는 단계 그대로다 (다지기 개념 없음).
   */
  beginFree(startedAt: IsoDate, progressionId: ProgressionId, step: number): void {
    this.#session = {
      startedAt,
      progressionId,
      step,
      performedStep: step,
      kind: 'free',
      workSets: [],
    };
    this.persist();
  }

  pushWorkSet(entry: SetEntry): void {
    if (this.#session === null) return;
    this.#session = {
      ...this.#session,
      workSets: [...this.#session.workSets, entry],
    };
    this.persist(); // FR-2.3 — 세트마다 저장
  }

  updateWorkSet(index: number, entry: SetEntry): void {
    if (this.#session === null) return;
    if (index < 0 || index >= this.#session.workSets.length) return;
    const next = [...this.#session.workSets];
    next[index] = entry;
    this.#session = { ...this.#session, workSets: next };
    this.persist();
  }

  /**
   * 세션을 완료해 도메인에 반영한다 (FR-2.5).
   * 다지기 세션이면 `recordConsolidation`, 아니면 `applySession` 이다 —
   * 다지기는 `evaluateSession` 이 승급 판정에서 제외해야 하기 때문에 별도 API 다.
   * (`applySession` 도 kind='consolidation' 을 안전하게 처리하나, 다지기 전용
   * API 를 통과시켜 의도를 명확히 남긴다.)
   */
  finalize(
    state: AppState,
    catalog: Catalog,
  ): { record: SessionRecord; nextState: AppState } {
    if (this.#session === null) throw new Error('진행 중 세션이 없다');
    const s = this.#session;
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
      // work / free 는 applySession 을 그대로 탄다. free 는 applySession 이 조기
      // 반환으로 state.steps 를 손대지 않는다 (FR-18.4 / EC-40).
      const input: SessionInput = {
        date: s.startedAt, // FR-2.8 / D-7
        progressionId: s.progressionId,
        step: s.step,
        performedStep: s.performedStep,
        sets: values,
        kind: s.kind, // 'work' | 'free'
      };
      if (sessionRpe !== undefined) input.rpe = sessionRpe;
      // FR-28: extras.target/setRpes/completedAt 을 입력에 실어 넘긴다. undefined 인
      // 필드는 명시 대입하지 않아 record 스프레드에 undefined 로 실리지 않게 한다.
      if (extras.target !== undefined) input.target = extras.target;
      if (extras.setRpes !== undefined) input.setRpes = extras.setRpes;
      if (extras.completedAt !== undefined) input.completedAt = extras.completedAt;
      const result = applySession(state, catalog, input);
      nextState = result.state;
      record = result.record;
    }

    this.#session = null;
    try {
      clearInProgress();
    } catch {
      // 정리 실패는 앱을 죽이지 않는다. 다음 부팅에서 재정리한다.
    }
    return { record, nextState };
  }

  /**
   * 세션 중 '불가능' 을 눌러 중단한다 (FR-6.8).
   * 반환된 `canConsolidate === true` 이면 UI 는 확인을 거쳐 다지기를 시작한다 (FR-6.9).
   */
  abandon(state: AppState, catalog: Catalog): AbandonResult {
    if (this.#session === null) throw new Error('진행 중 세션이 없다');
    const s = this.#session;
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

    this.#session = null;
    try {
      clearInProgress();
    } catch {
      // ignore
    }
    return result;
  }

  /** 화면에서 확인 없이 전체 취소. 진행 중 데이터만 지운다 — 도메인 상태는 그대로. */
  discard(): void {
    this.#session = null;
    try {
      clearInProgress();
    } catch {
      // ignore
    }
  }

  private persist(): void {
    if (this.#session === null) return;
    try {
      writeInProgress(this.#session);
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
 * 진행 중 세션에서 FR-28 세 필드를 만든다 (ADR-23).
 *
 * - `target` — 시작 시점의 스냅샷. begin 이 저장해 두었다. 자유 운동은 없다.
 * - `setRpes` — 세트마다의 RPE 배열. 미입력은 null (세션 RPE 인 최댓값과 다르다 —
 *   완료 후에도 세트별 원본을 남기기 위한 저장 필드).
 * - `completedAt` — 완료·중단 시각. `todayClock.nowIsoLocal()` 로 로컬 오프셋 포함.
 */
function buildExtras(session: InProgressSession): SessionExtras {
  const extras: SessionExtras = {
    setRpes: session.workSets.map((e) => e.rpe ?? null),
    completedAt: todayClock.nowIsoLocal(),
  };
  if (session.target !== undefined) extras.target = session.target;
  return extras;
}

/**
 * 시작 날짜가 오늘이 아닌지 판정 (FR-2.9 / EC-7a).
 * 화면 상단에 "이 세션은 YYYY-MM-DD 세션입니다" 문구를 띄우는 근거.
 */
export function isStaleStartedAt(
  session: InProgressSession | null,
  today: IsoDate,
): boolean {
  if (session === null) return false;
  return session.startedAt !== today;
}

export const inProgress = new InProgressStore();

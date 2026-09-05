/**
 * 진행 중 세션 스토어 (FR-2).
 *
 * `SessionRecord` 는 완결된 세션만 표현하므로 UI 쪽 별도 스키마다 (FR-2.1).
 * 세트 값을 하나 입력할 때마다 저장한다 (FR-2.3 / D-3).
 *
 * 완료 시 세트별 RPE 중 **최댓값**을 세션 RPE 로 넘긴다 (FR-6.7a / D-11).
 * 하나도 없으면 필드 자체를 만들지 않는다 — 0 으로 대체하지 않는다.
 * 세트별 RPE 원본은 완료된 세션 기록에 남지 않는다 (FR-6.7b / L-8).
 *
 * 완료·중단 시 `applySession` / `abandonChallenge` 로 도메인에 반영하고 진행 중
 * 데이터를 제거한다 (FR-2.5).
 */

import {
  abandonChallenge,
  applySession,
  recordConsolidation,
  type AbandonResult,
} from '../domain/index.ts';
import type {
  AppState,
  Catalog,
  IsoDate,
  PlannedExercise,
  ProgressionId,
  SessionInput,
  SessionRecord,
} from '../domain/types.ts';
import {
  clearInProgress,
  writeInProgress,
  type InProgressSession,
  type SetEntry,
} from './storage.ts';

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
   */
  begin(startedAt: IsoDate, plan: PlannedExercise): void {
    this.#session = {
      startedAt,
      progressionId: plan.progressionId,
      step: plan.step,
      performedStep: plan.performedStep,
      kind: plan.kind,
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
        kind: 'work',
      };
      if (sessionRpe !== undefined) input.rpe = sessionRpe;
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

    const result = abandonChallenge(
      state,
      catalog,
      s.progressionId,
      s.startedAt, // FR-2.8
      values,
      sessionRpe,
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

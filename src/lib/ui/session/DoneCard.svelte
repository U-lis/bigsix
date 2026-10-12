<script lang="ts">
  /**
   * 완료 카드 — 오늘 이미 기록한 종목 (ADR-49 · ADR-50 / FR-46).
   *
   * 오늘 날짜로 정규 기록(`work` · `consolidation` · `outcome === 'abandoned'`,
   * `free` 제외) 이 있는 계획 종목은 ExerciseCard 대신 이 카드를 보인다.
   *
   * - 기록된 세트를 **읽기 전용**으로 보인다. 「이 단계 중단」 버튼은 없다 (FR-46.4).
   * - 세트를 추가하면 그 종목의 자유 운동 칸(`free` draft) 에 쌓는다 (FR-46.2 / FR-46.3).
   *   - 자유 운동 칸이 **없으면** `beginFree` 로 열고 `pushSet` 으로 추가한다.
   *   - 같은 단계의 자유 운동 칸이 **이미 있으면** `pushSet` 으로 세트를 이어 붙인다.
   *   - **다른 단계**의 자유 운동 칸이 있으면 `freeDraftStepMismatch` 가 true 로 들어오고,
   *     사실 문구와 함께 입력을 접는다 (`data-done-extra-blocked="step-mismatch"`).
   *   - **스테일(날 넘긴) 자유 운동 칸** 이 있으면 `freeDraftIsStale` 로 입력을 접는다.
   *
   * 헤더는 **마지막 기록**의 `step` / `performedStep` / 단계명 을 쓴다 — 계획값이 아니다 (R-12).
   *
   * CSS 로 접는다 — DOM 에서 빼지 않는다 (CLAUDE.md 규약).
   */
  import type {
    Catalog, IsoDate, PlannedExercise, ProgressionId, SessionRecord, SetMode, Unit,
  } from '$lib/domain/types';
  import { getStep } from '$lib/domain';
  import { inProgress } from './session.svelte';
  import { draftKey, type SessionDraft, type SetEntry } from '$lib/ui/state/storage';
  import { doneResultLabel, doneSetShortfall } from '$lib/ui/today/done';
  import { setTargetLabel, unitLabel } from './labels';
  import RepsInput from './RepsInput.svelte';
  import TimerInput from './TimerInput.svelte';
  import RpeInput from './RpeInput.svelte';
  import Howto from './Howto.svelte';
  import Confirm from '$lib/ui/common/Confirm.svelte';

  interface Props {
    /**
     * `recordedToday(…)` 결과. 시간 순. CSS 스위치로 숨겨진 상태에서는 비어 있을 수 있다 —
     * ADR-49: ExerciseCard 와 DoneCard 는 모두 항상 DOM 에 있다. 숨겨진 쪽은
     * records 가 비어 있어 템플릿이 전부 접힌다.
     */
    records: SessionRecord[];
    /** `progressionName(catalog, id)` 결과. */
    progName: string;
    /** 그 종목의 free draft (오늘). 없을 수 있다. */
    freeDraft: SessionDraft | undefined;
    /** `freeDraft.startedAt !== today` */
    freeDraftIsStale: boolean;
    /** 자유 운동 칸이 추가 세트의 수행 단계와 다른 단계로 열려 있다 (ADR-50). */
    freeDraftStepMismatch: boolean;
    today: IsoDate;
    catalog: Catalog;
    plan: PlannedExercise;
  }
  let {
    records,
    progName,
    freeDraft,
    freeDraftIsStale,
    freeDraftStepMismatch,
    today,
    catalog,
    plan,
  }: Props = $props();

  // 비어 있을 수 있다 — CSS 스위치가 접힌 DoneCard. 그때는 템플릿 바디가 안 그려진다.
  const last = $derived<SessionRecord | undefined>(records[records.length - 1]);
  // R-12: 헤더는 계획 값이 아니라 마지막 기록 값으로.
  const headerStep = $derived(last?.step ?? plan.step);
  const headerPerformedStep = $derived(last?.performedStep ?? last?.step ?? plan.performedStep);
  const headerStepRef = $derived(getStep(catalog, plan.progressionId, headerPerformedStep));

  const progressionId: ProgressionId = $derived(last?.progressionId ?? plan.progressionId);
  const freeKey = $derived(draftKey(progressionId, 'free'));

  // 추가 세트가 들어갈 수행 단계 — 마지막 정규 기록의 `performedStep` (EC-103).
  const extraStep = $derived(headerPerformedStep);

  // 입력 블록 상태 — stale 우선, step-mismatch 그 다음.
  const blocked = $derived<'stale' | 'step-mismatch' | null>(
    freeDraftIsStale ? 'stale' : freeDraftStepMismatch ? 'step-mismatch' : null,
  );

  // 자유 운동 칸의 세트 (추가 세트).
  const extraSets = $derived(freeDraft !== undefined && !freeDraftIsStale ? freeDraft.workSets : []);

  // 다음 세트 입력 안내값 — 계획이 있으면 계획의 마지막 세트를 이어 쓰고,
  // 없으면 free 가 가진 마지막 세트를 쓰고, 둘 다 없으면 1.
  const planLen = $derived(plan.work.length);
  const extraMode: SetMode = $derived(planLen > 0 ? plan.work[planLen - 1].mode : 'fixed');
  const extraTarget: number = $derived(
    planLen > 0
      ? plan.work[planLen - 1].target
      : extraSets.length > 0
        ? extraSets[extraSets.length - 1].value
        : 1,
  );

  // 세트 삭제·편집 상태 (1-based).
  let deleteRow = $state<number | null>(null);
  let editingRow = $state<number | null>(null);

  function unit(u: Unit): string { return unitLabel(u); }

  function ensureFreeOpen(): boolean {
    if (blocked !== null) return false;
    const existing = inProgress.drafts[freeKey];
    if (existing !== undefined) {
      // startedAt 과 performedStep 이 맞아야 — 호출자가 이미 걸러줬다.
      if (existing.startedAt !== today) return false;
      if (existing.performedStep !== extraStep) return false;
      return true;
    }
    return inProgress.beginFree(today, progressionId, extraStep);
  }

  function confirmReps(value: number) {
    if (!ensureFreeOpen()) return;
    inProgress.pushSet(freeKey, { value });
  }
  function confirmSeconds(seconds: number) {
    if (!ensureFreeOpen()) return;
    inProgress.pushSet(freeKey, { value: seconds });
  }

  function setLastRpe(rpe: number | undefined) {
    if (freeDraft === undefined) return;
    const idx = freeDraft.workSets.length - 1;
    if (idx < 0) return;
    const lastSet = freeDraft.workSets[idx];
    const next: SetEntry = { ...lastSet };
    if (rpe === undefined) delete next.rpe;
    else next.rpe = rpe;
    inProgress.updateSet(freeKey, idx, next);
  }

  function startEdit(oneBased: number) { editingRow = oneBased; }
  function cancelEdit() { editingRow = null; }
  function saveEdit(oneBased: number, value: number) {
    if (freeDraft === undefined) return;
    const idx = oneBased - 1;
    const prev = freeDraft.workSets[idx];
    if (prev === undefined) return;
    inProgress.updateSet(freeKey, idx, { ...prev, value });
    editingRow = null;
  }

  function askDelete(oneBased: number) { deleteRow = oneBased; }
  function doDelete() {
    if (deleteRow === null || freeDraft === undefined) return;
    const idx = deleteRow - 1;
    inProgress.removeSet(freeKey, idx);
    deleteRow = null;
  }

  function stepMismatchMessage(): string {
    const existing = inProgress.drafts[freeKey];
    const existingStep = existing?.performedStep ?? '';
    return `같은 종목의 자유 운동 칸이 ${existingStep}단계로 열려 있습니다 — 먼저 기록하거나 버리세요`;
  }

  function staleMessage(): string {
    const existing = inProgress.drafts[freeKey];
    return `${existing?.startedAt ?? ''} 미완료 기록이 있습니다 — 먼저 기록하거나 버리세요`;
  }
</script>

<article
  class="card done"
  data-card-done
  data-progression={progressionId}
  data-done-step={headerPerformedStep}
  data-done-empty={records.length === 0 ? 'true' : null}
>
  {#if records.length > 0}
  <header>
    <p class="eyebrow">
      {headerPerformedStep}단계 · {headerStepRef.name.ko} · 완료
    </p>
    <h3 class="goal">
      {headerStep}단계 기록
    </h3>
  </header>

  <!-- 동작 설명은 완료 카드에서도 쓸 수 있어야 한다. 접힌 채로 시작한다. -->
  <Howto {catalog} progressionId={progressionId} performedStep={headerPerformedStep} />

  <!-- 기록 목록 — 시간 순. 읽기 전용. -->
  <section class="records">
    {#each records as rec, ri (rec.date + ':' + rec.step + ':' + ri)}
      {@const resultText = doneResultLabel(progName, rec)}
      <div class="record-group" data-done-record={ri}>
        <p class="result" data-done-result>{resultText}</p>
        <ol class="sets">
          {#each rec.sets as value, si (si)}
            {@const shortfall = doneSetShortfall(rec, si)}
            {@const rpe = rec.setRpes?.[si] ?? null}
            <li class="set-row" data-done-set-row={si + 1}>
              <span class="num">{si + 1}세트</span>
              <span class="value">
                {value}{unit(plan.unit)}
                {#if shortfall !== null}
                  <span class="short" data-done-set-short>{shortfall}</span>
                {/if}
              </span>
              {#if rpe !== null}
                <span class="rpe">(RPE {rpe})</span>
              {/if}
            </li>
          {/each}
        </ol>
        {#if rec.completedAt !== undefined && rec.completedAt !== null}
          <p class="completed-at" data-done-completed-at>완료 시각: {rec.completedAt}</p>
        {/if}
      </div>
    {/each}
  </section>

  <!-- 추가 세트 섹션 — 항상 DOM 에 존재한다. blocked 시 CSS 로 접고 데이터 훅으로 알린다. -->
  <section
    class="extras"
    class:blocked
    data-done-extras
    data-done-extra-blocked={blocked}
  >
    <h4>추가 세트 (자유 운동)</h4>

    {#if blocked === 'step-mismatch'}
      <p class="notice" data-done-add-error>{stepMismatchMessage()}</p>
    {:else if blocked === 'stale'}
      <p class="notice" data-done-add-error>{staleMessage()}</p>
    {/if}

    {#if extraSets.length > 0}
      <ol class="sets">
        {#each extraSets as entry, i (i)}
          {@const oneBased = i + 1}
          <li class="set-row" data-done-extra-row={oneBased}>
            <span class="num">{oneBased}세트</span>
            {#if editingRow === oneBased}
              <RepsInput
                initial={entry.value}
                onConfirm={(v) => saveEdit(oneBased, v)}
                label="저장"
              />
              <button type="button" class="small" onclick={cancelEdit}>취소</button>
            {:else}
              <span class="value">
                {entry.value}{unit(plan.unit)}
                {#if entry.rpe !== undefined}
                  <span class="rpe">(RPE {entry.rpe})</span>
                {/if}
              </span>
              <button
                type="button"
                class="small"
                data-set-edit
                onclick={() => startEdit(oneBased)}
              >편집</button>
              <button
                type="button"
                class="small danger"
                data-set-delete
                onclick={() => askDelete(oneBased)}
              >삭제</button>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}

    <div class="input-row" data-done-add-input>
      <p class="hint">
        추가 세트: {setTargetLabel(extraTarget, extraMode, plan.unit)}
      </p>
      {#if plan.unit === 'reps'}
        {#key extraSets.length}
          <RepsInput initial={extraTarget} onConfirm={confirmReps} label="세트 확정" />
        {/key}
      {:else}
        {#key extraSets.length}
          <TimerInput targetSec={extraTarget} onConfirm={confirmSeconds} />
        {/key}
      {/if}
      {#if extraSets.length > 0 && freeDraft !== undefined}
        <div class="rpe-row">
          <RpeInput value={freeDraft.workSets[extraSets.length - 1].rpe} onSelect={setLastRpe} />
        </div>
      {/if}
    </div>
  </section>
  {/if}
</article>

{#if deleteRow !== null}
  <Confirm
    title="{deleteRow}세트를 삭제하시겠습니까?"
    body="확정한 세트 값과 RPE 가 사라집니다. 이 작업은 되돌릴 수 없습니다."
    confirmLabel="삭제"
    onConfirm={doDelete}
    onCancel={() => deleteRow = null}
  />
{/if}

<style>
  .card.done {
    border: 1px solid var(--border);
    background: var(--surface);
    padding: 1rem;
    border-radius: 8px;
    color: var(--fg);
  }
  header h3 { margin: 0 0 0.25rem; font-size: 1.15rem; }
  .eyebrow { margin: 0 0 0.15rem; color: var(--muted); font-size: 0.85rem; }
  .goal {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--fg);
  }

  .records { margin-top: 0.75rem; }
  .record-group {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border);
  }
  .record-group:first-child { border-top: none; padding-top: 0; }
  .result { margin: 0 0 0.35rem; font-size: 0.95rem; color: var(--fg); }
  .completed-at { margin: 0.35rem 0 0; color: var(--muted); font-size: 0.8rem; }

  .sets { margin: 0.25rem 0; padding-left: 0; list-style: none; }
  .set-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    line-height: 1.6;
    padding: 0.25rem 0;
  }
  .set-row .num { min-width: 3.5rem; color: var(--muted); font-size: 0.9rem; }
  .set-row .value { color: var(--fg); font-size: 0.95rem; }
  .set-row .short { color: var(--danger); margin-left: 0.25rem; }
  .set-row .rpe { color: var(--muted); font-size: 0.85rem; margin-left: 0.25rem; }
  .set-row .small {
    min-height: 44px;
    min-width: 44px;
    padding: 0.4rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
    color: var(--fg);
    cursor: pointer;
    font-size: 0.85rem;
  }
  .set-row .small.danger {
    border-color: var(--danger);
    color: var(--danger);
  }

  .extras { margin-top: 0.75rem; }
  .extras h4 { margin: 0.5rem 0 0.25rem; font-size: 0.95rem; color: var(--muted); }
  .extras .notice {
    background: var(--danger-bg);
    border: 1px solid var(--danger);
    color: var(--fg);
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    margin: 0.25rem 0 0.5rem;
    font-size: 0.9rem;
  }
  /* blocked 시 입력 영역을 CSS 로 접는다 (DOM 에서 빼지 않는다 — CLAUDE.md). */
  .extras.blocked .input-row {
    opacity: 0.5;
    pointer-events: none;
    cursor: not-allowed;
  }
  .input-row { margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .hint { color: var(--muted); font-size: 0.85rem; margin: 0; }
  .rpe-row { margin-top: 0.25rem; }
</style>

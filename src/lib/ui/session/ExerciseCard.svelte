<script lang="ts">
  /**
   * 한 종목 카드 — 계획 표시 + 세트 입력 + 완료 · 불가능 (FR-5, FR-6).
   *
   * 도메인 문자열(reason / sideNote) 는 가공 없이 그대로 노출한다 (NFR-2 / FR-5.3).
   */
  import type { AppState, Catalog, IsoDate, PlannedExercise, SessionRecord } from '../../domain/types.ts';
  import { inProgress } from '../session.svelte.ts';
  import { appState } from '../state.svelte.ts';
  import { exerciseTitle, kindLabel, setTargetLabel, standardLabel, unitLabel } from './labels.ts';
  import RepsInput from './RepsInput.svelte';
  import TimerInput from './TimerInput.svelte';
  import RpeInput from './RpeInput.svelte';
  import Confirm from '../Confirm.svelte';

  interface Props {
    plan: PlannedExercise;
    today: IsoDate;
    catalog: Catalog;
    onFinalized?: (record: SessionRecord) => void;
    onAbandoned?: (canConsolidate: boolean, consolidation: PlannedExercise | null) => void;
  }
  let { plan, today, catalog, onFinalized, onAbandoned }: Props = $props();

  let showAbandonConfirm = $state(false);
  let showFinalizeConfirm = $state(false);
  let localState: AppState = $derived(appState.value);

  let session = $derived(inProgress.value);
  let matchesThisPlan = $derived(
    session !== null &&
    session.progressionId === plan.progressionId &&
    session.step === plan.step &&
    session.kind === plan.kind,
  );

  let workDone = $derived(matchesThisPlan ? session!.workSets.length : 0);
  let remainingTargets = $derived(plan.work.slice(workDone));
  let currentTarget = $derived(remainingTargets[0] ?? null);
  let allSetsDone = $derived(currentTarget === null && matchesThisPlan);

  function startIfNeeded() {
    if (matchesThisPlan) return;
    inProgress.begin(today, plan);
  }

  function confirmReps(value: number) {
    startIfNeeded();
    inProgress.pushWorkSet({ value });
  }

  function confirmSeconds(seconds: number) {
    startIfNeeded();
    inProgress.pushWorkSet({ value: seconds });
  }

  function setLastRpe(rpe: number | undefined) {
    if (!matchesThisPlan || session === null || session.workSets.length === 0) return;
    const idx = session.workSets.length - 1;
    const last = session.workSets[idx];
    const next = { ...last };
    if (rpe === undefined) delete next.rpe;
    else next.rpe = rpe;
    inProgress.updateWorkSet(idx, next);
  }

  function doFinalize() {
    showFinalizeConfirm = false;
    const result = inProgress.finalize(localState, catalog);
    appState.apply(result.nextState);
    onFinalized?.(result.record);
  }

  function doAbandon() {
    showAbandonConfirm = false;
    const result = inProgress.abandon(localState, catalog);
    appState.apply(result.state);
    onAbandoned?.(result.canConsolidate, result.consolidation);
  }
</script>

<article class="card">
  <header>
    <h3>{exerciseTitle(plan)}</h3>
    <p class="sub">{kindLabel(plan.kind)} · 목표 {standardLabel(plan.goal.label)} {plan.goal.sets}×{plan.goal.value}{unitLabel(plan.unit)}</p>
  </header>

  {#if plan.sideNote !== undefined && plan.sideNote !== null}
    <p class="side-note">{plan.sideNote}</p>
  {/if}

  <p class="reason">{plan.reason}</p>

  <section class="work">
    <h4>본 세트 ({workDone}/{plan.work.length})</h4>
    <ol>
      {#each plan.work as w, i (i)}
        {@const done = i < workDone}
        {@const value = done && session !== null ? session.workSets[i].value : null}
        {@const rpe = done && session !== null ? session.workSets[i].rpe : undefined}
        <li class:done>
          <span class="target">{setTargetLabel(w.target, w.mode, plan.unit)}</span>
          {#if done}
            <span class="value">→ {value}{unitLabel(plan.unit)}{rpe !== undefined ? ` (RPE ${rpe})` : ''}</span>
          {/if}
        </li>
      {/each}
    </ol>

    {#if currentTarget !== null}
      <div class="input-row">
        <p class="hint">다음 세트: {setTargetLabel(currentTarget.target, currentTarget.mode, plan.unit)}</p>
        {#if plan.unit === 'reps'}
          {#key workDone}
            <RepsInput initial={currentTarget.target} onConfirm={confirmReps} label="세트 확정" />
          {/key}
        {:else}
          {#key workDone}
            <TimerInput targetSec={currentTarget.target} onConfirm={confirmSeconds} />
          {/key}
        {/if}
        {#if workDone > 0 && session !== null}
          <div class="rpe-row">
            <RpeInput value={session.workSets[workDone - 1].rpe} onSelect={setLastRpe} />
          </div>
        {/if}
      </div>
    {/if}

    {#if allSetsDone}
      <button type="button" class="finalize" onclick={() => showFinalizeConfirm = true}>세션 완료 기록</button>
    {/if}
  </section>

  <footer>
    {#if matchesThisPlan}
      <button type="button" class="abandon" onclick={() => showAbandonConfirm = true}>불가능</button>
    {/if}
  </footer>
</article>

{#if showAbandonConfirm}
  <Confirm
    title="이 세션을 '불가능'으로 기록하시겠습니까?"
    body={
      plan.step > 1
        ? '기록 이후 이전 단계 다지기를 할지 확인 단계가 이어집니다.'
        : '1단계라 다지기로 내려갈 단계가 없으므로 현 단계가 유지됩니다.'
    }
    confirmLabel="불가능으로 기록"
    onConfirm={doAbandon}
    onCancel={() => showAbandonConfirm = false}
  />
{/if}

{#if showFinalizeConfirm}
  <Confirm
    title="이 세션을 완료 기록으로 확정하시겠습니까?"
    body="기록 후에는 자동 판정된 승급 · 유지 상태가 반영됩니다."
    confirmLabel="완료 기록"
    onConfirm={doFinalize}
    onCancel={() => showFinalizeConfirm = false}
  />
{/if}

<style>
  .card {
    border: 1px solid #444;
    background: #1a1a1a;
    padding: 1rem;
    border-radius: 8px;
    color: #eee;
  }
  header h3 { margin: 0 0 0.25rem; font-size: 1.15rem; }
  .sub { margin: 0 0 0.5rem; color: #ccc; font-size: 0.9rem; }
  .side-note {
    background: #232;
    border: 1px solid #464;
    color: #cfd;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    margin: 0.5rem 0;
    font-size: 0.9rem;
  }
  .reason { color: #bbb; font-size: 0.85rem; margin: 0.5rem 0; }
  section h4 { margin: 0.75rem 0 0.25rem; font-size: 0.95rem; color: #ccc; }
  ol { margin: 0.25rem 0; padding-left: 1.25rem; }
  li { line-height: 1.6; }
  li.done .target { color: #888; text-decoration: line-through; }
  li .value { color: #cfc; margin-left: 0.5rem; }
  .input-row { margin-top: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .hint { color: #ccc; font-size: 0.85rem; margin: 0; }
  .rpe-row { margin-top: 0.25rem; }
  .finalize {
    margin-top: 0.75rem;
    min-height: 44px;
    padding: 0.75rem 1.25rem;
    background: #253;
    color: #eee;
    border: 1px solid #6a6;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
  }
  footer { margin-top: 0.75rem; }
  .abandon {
    min-height: 44px;
    padding: 0.75rem 1rem;
    background: #422;
    color: #eee;
    border: 1px solid #a66;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
  }
</style>

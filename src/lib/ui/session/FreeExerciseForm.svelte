<script lang="ts">
  /**
   * 자유 운동 열기 폼 (SPEC5 FR-43.1 · ADR-46).
   *
   * SPEC5 변경 — 즉시 `applySession` 하지 않는다. `inProgress.beginFree(today, id, step)`
   * 로 자유 운동 칸만 연다. 세트·RPE 입력은 열린 칸에 붙은 ExerciseCard 가 담당하고,
   * 기록은 「오늘 운동 마치기」(FinishBar) 가 모든 칸을 한 번에 처리한다.
   *
   * 잠긴 종목은 열기 자체가 비활성 상태로 남는다 (FR-18.3 / FR-43.2 / EC-42) —
   * 도메인의 `checkGate` 결과만 믿는다.
   *
   * 같은 종목에 free 칸이 이미 있으면 `beginFree` 가 false 를 돌려준다 — 사용자에게
   * 사실을 알리고 폼은 열어 둔다 (입력을 조용히 버리지 않는다).
   */

  import {
    checkGate, MAX_STEP, MIN_STEP, getStep,
  } from '$lib/domain';
  import type {
    AppState, Catalog, IsoDate, ProgressionId, Step,
  } from '$lib/domain/types';
  import { appState } from '$lib/ui/state/state.svelte';
  import { inProgress } from './session.svelte';
  import Howto from './Howto.svelte';
  import { progressionName, unitLabel } from './labels';

  interface Props {
    today: IsoDate;
    catalog: Catalog;
    /** 자유 운동 칸이 열린 뒤 상위 페이지가 폼을 닫을 때 호출. */
    onDone: () => void;
    onCancel: () => void;
  }
  let { today, catalog, onDone, onCancel }: Props = $props();

  const IDS: ProgressionId[] = ['pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu'];

  let progressionId = $state<ProgressionId>('pushup');
  let step = $state<number>(2);
  let openError = $state<string | null>(null);

  let currentState: AppState = $derived(appState.value);
  let gate = $derived(checkGate(currentState, catalog, progressionId));
  let stepData = $derived<Step>(getStep(catalog, progressionId, step));

  let progressionOptions = IDS.map((id) => ({
    id,
    label: progressionName(catalog, id),
  }));
  let stepOptions = Array.from({ length: MAX_STEP - MIN_STEP + 1 }, (_, i) => MIN_STEP + i);

  let canOpen = $derived(gate.unlocked);

  function open() {
    openError = null;
    if (!gate.unlocked) {
      openError = '잠긴 종목은 자유 운동으로도 기록할 수 없다.';
      return;
    }
    const started = inProgress.beginFree(today, progressionId, step);
    if (!started) {
      openError = '같은 종목의 자유 운동 칸이 이미 열려 있다. 그 카드에서 세트를 쌓는다.';
      return;
    }
    onDone();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="backdrop"
  data-free-form
  data-locked={gate.unlocked ? 'false' : 'true'}
  role="dialog"
  aria-modal="true"
  aria-labelledby="free-title"
  onclick={onCancel}
  onkeydown={(e) => e.key === 'Escape' && onCancel()}
  tabindex="-1"
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="dialog" role="document" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
    <h2 id="free-title">자유 운동 열기</h2>

    <label class="row">
      <span>종목</span>
      <select bind:value={progressionId} data-free-progression>
        {#each progressionOptions as o (o.id)}
          <option value={o.id}>{o.label}</option>
        {/each}
      </select>
    </label>

    <label class="row">
      <span>단계</span>
      <select bind:value={step} data-free-step>
        {#each stepOptions as n (n)}
          <option value={n}>{n}단계 · {getStep(catalog, progressionId, n).name.ko}</option>
        {/each}
      </select>
    </label>

    <!-- FR-30 · UI-11: 사용자가 고른 단계의 동작 설명. 접힌 채로 자리를 지킨다. -->
    <Howto {catalog} {progressionId} performedStep={step} />

    <p class="unit-hint">단위: {unitLabel(stepData.unit)}</p>

    {#if !gate.unlocked}
      <p class="locked" data-lock-reason>잠김: {gate.reason}</p>
    {/if}

    {#if openError !== null}
      <p class="error" data-free-error>{openError}</p>
    {/if}

    <div class="actions">
      <button type="button" data-free-cancel onclick={onCancel}>취소</button>
      <button
        type="button"
        class="save"
        data-free-save
        disabled={!canOpen}
        onclick={open}
      >칸 열기</button>
    </div>

    <p class="note">
      자유 운동 칸이 열리면 오늘 화면의 카드에서 세트를 쌓는다. 기록은
      「오늘 운동 마치기」 가 모든 종목을 한 번에 처리한다.
    </p>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }
  .dialog {
    background: var(--surface);
    color: var(--fg);
    padding: 1.25rem;
    border-radius: 10px;
    max-width: 480px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    border: 1px solid var(--border);
  }
  h2 { margin: 0 0 0.75rem; font-size: 1.15rem; }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.5rem 0;
  }
  .row > span { min-width: 3.5rem; color: var(--muted); font-size: 0.9rem; }
  select {
    flex: 1;
    min-height: 44px;
    padding: 0.5rem;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 0.95rem;
  }
  .unit-hint { color: var(--muted); font-size: 0.85rem; margin: 0.5rem 0; }
  .locked {
    background: var(--danger-bg);
    color: var(--danger);
    padding: 0.75rem;
    border: 1px solid var(--danger);
    border-radius: 6px;
    margin: 0.5rem 0;
  }
  .error {
    color: var(--danger);
    margin: 0.5rem 0;
    font-size: 0.9rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  .actions button {
    min-height: 44px;
    min-width: 44px;
    padding: 0.75rem 1.25rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
    color: var(--fg);
    cursor: pointer;
    font-size: 1rem;
  }
  .actions button.save {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg);
  }
  .actions button.save[disabled] {
    background: transparent;
    border-color: var(--border);
    color: var(--muted);
    cursor: not-allowed;
    opacity: 0.6;
  }
  .note {
    margin: 0.75rem 0 0;
    color: var(--muted);
    font-size: 0.8rem;
  }
</style>

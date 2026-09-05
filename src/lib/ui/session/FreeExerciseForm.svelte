<script lang="ts">
  /**
   * 자유 운동 입력 폼 (FR-18.1 ~ FR-18.3 / FR-18.9).
   *
   * 사용자가 계획 밖에서 임의로 기록하는 세션. 승급·유지·강등·다음 목표
   * 계산 어디에도 영향을 주지 않는다 (FR-18.6 / ADR-16). 완료 시 applySession 이
   * kind='free' 로 조기 반환해 state.steps 를 손대지 않는다 (FR-18.4 / EC-40).
   *
   * 잠긴 종목은 저장 버튼이 비활성 상태로 남아 저장 자체가 불가능하다
   * (FR-18.3 / EC-42). 도메인은 free 를 걸러 내지 않으므로 이 가드가 유일한 방어다.
   *
   * 이 폼은 inProgress 스토어를 쓰지 않는다 — 자유 운동은 짧은 한 화면의
   * 즉시 입력·저장이다. 폼을 닫으면 세트 값은 사라진다.
   */

  import {
    applySession, checkGate, MAX_STEP, MIN_STEP, PROMOTION_STREAK,
    valueOf,
  } from '../../domain/index.ts';
  import { getProgression, getStep, topLabel, topStandard } from '../../domain/catalog.ts';
  import type {
    AppState, Catalog, IsoDate, ProgressionId, SessionInput,
    Standard, StandardLabel, Step,
  } from '../../domain/types.ts';
  import { appState } from '../state.svelte.ts';
  import { progressionName, standardLabel, unitLabel } from './labels.ts';

  interface Props {
    today: IsoDate;
    catalog: Catalog;
    onDone: () => void;
    onCancel: () => void;
  }
  let { today, catalog, onDone, onCancel }: Props = $props();

  const IDS: ProgressionId[] = ['pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu'];

  // ── 선택 상태 ─────────────────────────────────────────────────────────────
  let progressionId = $state<ProgressionId>('pushup');
  let step = $state<number>(2);
  let tier = $state<StandardLabel>('beginner');
  let setValues = $state<string[]>([]);
  let rpe = $state<number | undefined>(undefined);
  let saveError = $state<string | null>(null);

  // ── 파생: 카탈로그·게이트·기준 ────────────────────────────────────────────
  let currentState: AppState = $derived(appState.value);
  let gate = $derived(checkGate(currentState, catalog, progressionId));
  let stepData = $derived<Step>(getStep(catalog, progressionId, step));
  let availableTiers = $derived.by<StandardLabel[]>(() => {
    const tiers: StandardLabel[] = ['beginner', 'intermediate'];
    tiers.push(topLabel(stepData));
    return tiers;
  });
  let selectedStandard = $derived<Standard>(standardOf(stepData, tier));
  let stdVal = $derived(valueOf(selectedStandard));

  // ── 종목/단계 바뀌면 tier 를 유효 범위로 되돌린다 ──────────────────────────
  $effect(() => {
    // stepData 가 바뀌면 tier 를 유효한 값으로 강제 조정
    const tiers = availableTiers;
    if (!tiers.includes(tier)) tier = 'beginner';
  });

  // ── 기준이 바뀌면 세트 초기값을 채운다 ────────────────────────────────────
  $effect(() => {
    const std = selectedStandard;
    const v = valueOf(std);
    setValues = Array.from({ length: std.sets }, () => String(v));
  });

  // 진행 표시용
  let progressionOptions = IDS.map((id) => ({
    id,
    label: progressionName(catalog, id),
  }));
  let stepOptions = Array.from({ length: MAX_STEP - MIN_STEP + 1 }, (_, i) => MIN_STEP + i);

  // ── 저장 가능 조건 ────────────────────────────────────────────────────────
  let parsedSets = $derived(setValues.map((s) => Number(s)));
  let setsValid = $derived(
    parsedSets.length > 0
      && parsedSets.every((n) => Number.isInteger(n) && n >= 1),
  );
  let canSave = $derived(gate.unlocked && setsValid);

  function save() {
    saveError = null;
    if (!gate.unlocked) {
      saveError = '잠긴 종목은 자유 운동으로도 기록할 수 없다.';
      return;
    }
    if (!setsValid) {
      saveError = '세트 값은 1 이상의 정수만 입력한다.';
      return;
    }
    const input: SessionInput = {
      date: today,
      progressionId,
      step,
      performedStep: step,
      sets: parsedSets,
      kind: 'free',
    };
    if (rpe !== undefined) input.rpe = rpe;
    try {
      const result = applySession(currentState, catalog, input);
      appState.apply(result.state);
    } catch (e) {
      saveError = e instanceof Error ? e.message : String(e);
      return;
    }
    onDone();
  }

  function standardOf(step: Step, t: StandardLabel): Standard {
    if (t === 'beginner') return step.beginner;
    if (t === 'intermediate') return step.intermediate;
    return topStandard(step);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="backdrop"
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
    <h2 id="free-title">자유 운동 기록</h2>

    <label class="row">
      <span>종목</span>
      <select bind:value={progressionId}>
        {#each progressionOptions as o (o.id)}
          <option value={o.id}>{o.label}</option>
        {/each}
      </select>
    </label>

    <label class="row">
      <span>단계</span>
      <select bind:value={step}>
        {#each stepOptions as n (n)}
          <option value={n}>{n}단계 · {getStep(catalog, progressionId, n).name.ko}</option>
        {/each}
      </select>
    </label>

    <label class="row">
      <span>기준</span>
      <select bind:value={tier}>
        {#each availableTiers as t (t)}
          <option value={t}>{standardLabel(t)} — {standardOf(stepData, t).sets}×{valueOf(standardOf(stepData, t))}{unitLabel(stepData.unit)}</option>
        {/each}
      </select>
    </label>

    {#if !gate.unlocked}
      <p class="locked">잠김: {gate.reason}</p>
    {:else}
      <fieldset>
        <legend>세트</legend>
        {#each setValues as _val, i (i)}
          <label class="set-row">
            <span>{i + 1}세트</span>
            <input
              type="number"
              inputmode="numeric"
              step="1"
              min="1"
              bind:value={setValues[i]}
              aria-label="{i + 1}세트 수치"
            />
            <span class="unit">{unitLabel(stepData.unit)}</span>
          </label>
        {/each}
      </fieldset>

      <fieldset>
        <legend>RPE (선택)</legend>
        <div class="rpe">
          {#each [1,2,3,4,5,6,7,8,9,10] as n (n)}
            <button
              type="button"
              class:selected={rpe === n}
              onclick={() => (rpe = rpe === n ? undefined : n)}
            >{n}</button>
          {/each}
        </div>
      </fieldset>
    {/if}

    {#if saveError !== null}
      <p class="error">{saveError}</p>
    {/if}

    <div class="actions">
      <button type="button" onclick={onCancel}>취소</button>
      <button type="button" class="save" disabled={!canSave} onclick={save}>저장</button>
    </div>

    <p class="note">
      자유 운동은 승급·유지·강등·다음 목표 계산에 영향을 주지 않는다.
      기록은 이력에만 남는다.
    </p>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }
  .dialog {
    background: #1a1a1a;
    color: #eee;
    padding: 1.25rem;
    border-radius: 10px;
    max-width: 480px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    border: 1px solid #555;
  }
  h2 { margin: 0 0 0.75rem; font-size: 1.15rem; }
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.5rem 0;
  }
  .row > span { min-width: 3.5rem; color: #ccc; font-size: 0.9rem; }
  select {
    flex: 1;
    min-height: 44px;
    padding: 0.5rem;
    background: #222;
    color: #eee;
    border: 1px solid #555;
    border-radius: 6px;
    font-size: 0.95rem;
  }
  fieldset {
    border: 1px solid #444;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    margin: 0.75rem 0;
  }
  legend { color: #ccc; font-size: 0.85rem; padding: 0 0.25rem; }
  .set-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.35rem 0;
  }
  .set-row > span { min-width: 3rem; color: #ccc; font-size: 0.9rem; }
  input[type="number"] {
    width: 6rem;
    min-height: 44px;
    padding: 0.5rem;
    background: #222;
    color: #eee;
    border: 1px solid #555;
    border-radius: 6px;
    font-size: 1rem;
  }
  .unit { color: #999; font-size: 0.85rem; }
  .rpe { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .rpe button {
    min-width: 44px;
    min-height: 44px;
    padding: 0.5rem;
    border: 1px solid #444;
    border-radius: 6px;
    background: #222;
    color: #ccc;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .rpe button.selected { background: #446; color: #fff; border-color: #88a; }
  .locked {
    background: #322;
    color: #fcc;
    padding: 0.75rem;
    border: 1px solid #a66;
    border-radius: 6px;
    margin: 0.5rem 0;
  }
  .error {
    color: #f88;
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
    border: 1px solid #666;
    border-radius: 6px;
    background: #333;
    color: #eee;
    cursor: pointer;
    font-size: 1rem;
  }
  .actions button.save {
    background: #245;
    border-color: #58a;
  }
  .actions button.save[disabled] {
    background: #222;
    border-color: #444;
    color: #666;
    cursor: not-allowed;
  }
  .note {
    margin: 0.75rem 0 0;
    color: #888;
    font-size: 0.8rem;
  }
</style>

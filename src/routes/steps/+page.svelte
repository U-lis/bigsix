<script lang="ts">
  /**
   * 화면 3 — 단계 현황 (FR-8) + 첫 실행 시작 단계 선택 (FR-3.5~3.7).
   *
   * 부팅에서 needsFirstRun 이면 이 화면에서 setStep API 로 시작 단계를 정한다 —
   * 별도 경로를 만들지 않는다 (FR-3.6). 잠긴 종목은 첫 실행에서도 조정 불가 (FR-3.7).
   */
  import { goto } from '$app/navigation';
  import {
    checkGate, getStep, setStep, topStandard, valueOf, MIN_STEP, MAX_STEP,
    type ProgressionId,
  } from '$lib/domain';
  import { appState } from '$lib/ui/state.svelte';
  import { loadCatalog } from '$lib/data/catalog';
  import Confirm from '$lib/ui/Confirm.svelte';

  const catalog = loadCatalog();

  const ids: ProgressionId[] = ['pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu'];

  let pending = $state<{ id: ProgressionId; step: number } | null>(null);
  let errorMsg = $state<string | null>(null);

  // 첫 실행 감지 — history · stints 가 전부 비어 있고, steps 도 초기 상태와 동일하면.
  let isFirstRun = $derived(
    appState.value.history.length === 0 && appState.value.stints.length === 0,
  );

  function tryAdjust(id: ProgressionId, step: number) {
    pending = { id, step };
  }

  function confirmAdjust() {
    if (pending === null) return;
    try {
      const next = setStep(appState.value, catalog, pending.id, pending.step);
      appState.apply(next);
      errorMsg = null;
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
    pending = null;
  }

  function goHome() {
    goto('/');
  }
</script>

<section>
  <header>
    <h2>단계 현황</h2>
    {#if isFirstRun}
      <p class="hint">첫 실행입니다. 시작할 단계를 골라 두면 오늘 세션이 그 단계로 시작합니다. 그대로 넘어가면 전 종목 2단계로 시작합니다.</p>
    {/if}
  </header>

  {#if errorMsg !== null}
    <p class="error" role="alert">{errorMsg}</p>
  {/if}

  <div class="cards">
    {#each ids as id (id)}
      {@const gate = checkGate(appState.value, catalog, id)}
      {@const current = appState.value.steps[id]}
      {@const step = getStep(catalog, id, current)}
      {@const top = topStandard(step)}
      <article class="card" class:locked={!gate.unlocked}>
        <header>
          <h3>{step.name.ko}</h3>
          <span class="step-badge">{current}단계</span>
        </header>

        {#if !gate.unlocked}
          <p class="lock">잠김: {gate.reason}</p>
        {/if}

        <dl>
          <div><dt>단위</dt><dd>{step.unit === 'seconds' ? '유지 시간(초)' : '횟수'}</dd></div>
          {#if step.perSide === true}
            <div><dt>좌우</dt><dd>양쪽 수행, 적게 한 쪽 기준</dd></div>
          {/if}
          <div><dt>초보자</dt><dd>{step.beginner.sets} × {valueOf(step.beginner)}</dd></div>
          <div><dt>중급자</dt><dd>{step.intermediate.sets} × {valueOf(step.intermediate)}</dd></div>
          <div><dt>{step.n === 10 ? '최상급자' : '상급자'}</dt><dd>{top.sets} × {valueOf(top)}</dd></div>
        </dl>

        {#if gate.unlocked}
          <details>
            <summary>단계 조정</summary>
            <p class="warn">되돌릴 수 없습니다. 조정 시점부터 유지 횟수를 다시 셉니다.</p>
            <div class="step-grid">
              {#each Array.from({ length: MAX_STEP - MIN_STEP + 1 }, (_, i) => MIN_STEP + i) as n (n)}
                <button
                  type="button"
                  class:current={n === current}
                  onclick={() => tryAdjust(id, n)}
                >{n}</button>
              {/each}
            </div>
          </details>
        {/if}
      </article>
    {/each}
  </div>

  {#if isFirstRun}
    <button type="button" class="proceed" onclick={goHome}>오늘 세션으로 시작</button>
  {/if}
</section>

{#if pending !== null}
  <Confirm
    title="{pending.id} 를 {pending.step}단계로 조정합니다"
    body="되돌릴 수 없습니다. 조정 시점부터 유지 횟수가 다시 세어져 그 뒤 3회의 유지 세션이 다시 필요합니다. history 는 바뀌지 않습니다."
    confirmLabel="조정"
    onConfirm={confirmAdjust}
    onCancel={() => pending = null}
  />
{/if}

<style>
  section { padding: 1rem; padding-bottom: 5rem; max-width: 720px; margin: 0 auto; color: #eee; }
  header h2 { margin: 0 0 0.25rem; font-size: 1.25rem; }
  .hint { color: #ccc; margin: 0 0 1rem; font-size: 0.9rem; }
  .cards { display: flex; flex-direction: column; gap: 1rem; }
  .card {
    border: 1px solid #444;
    background: #1a1a1a;
    padding: 1rem;
    border-radius: 8px;
  }
  /* 잠금 사유는 흐리게 하지 않는다 (FR-21.4). 카드 배경만 구분한다. */
  .card.locked { background: #191919; }
  .card header { display: flex; justify-content: space-between; align-items: baseline; }
  .card h3 { margin: 0; font-size: 1.05rem; }
  .step-badge {
    background: #446;
    color: #fff;
    border: 1px solid #88a;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-size: 0.85rem;
  }
  .lock {
    background: #322;
    border: 1px solid #a66;
    color: #fcc;
    padding: 0.5rem;
    border-radius: 6px;
    margin: 0.5rem 0;
    font-size: 0.85rem;
  }
  dl { margin: 0.5rem 0; display: grid; grid-template-columns: 1fr; gap: 0.15rem; }
  dl div { display: flex; gap: 0.5rem; font-size: 0.9rem; }
  dt { color: #999; min-width: 4.5rem; }
  dd { margin: 0; }
  details summary {
    cursor: pointer;
    padding: 0.5rem 0;
    color: #ccc;
    font-size: 0.9rem;
  }
  .warn { color: #fcc; font-size: 0.85rem; margin: 0.25rem 0 0.5rem; }
  .step-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.35rem;
  }
  .step-grid button {
    min-height: 44px;
    min-width: 44px;
    padding: 0.5rem;
    border: 1px solid #444;
    border-radius: 6px;
    background: #222;
    color: #eee;
    cursor: pointer;
    font-size: 1rem;
  }
  .step-grid button.current { background: #446; border-color: #88a; }
  .error {
    background: #422;
    color: #fcc;
    padding: 0.75rem;
    border: 1px solid #a66;
    border-radius: 6px;
    margin-bottom: 1rem;
  }
  .proceed {
    margin-top: 1rem;
    width: 100%;
    min-height: 44px;
    padding: 0.75rem 1.25rem;
    background: #253;
    color: #eee;
    border: 1px solid #6a6;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
  }
</style>

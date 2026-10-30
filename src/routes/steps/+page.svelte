<script lang="ts">
  /**
   * 화면 3 — 단계 현황 (FR-8) + 첫 실행 시작 단계 선택 (FR-3.5~3.7).
   *
   * 단계 조정 때 시작 기준(초보자 · 중급자 · 상급자)도 함께 고른다 (0.5.0). 고른 뒤
   * 「조정」 버튼으로 확인 다이얼로그를 연다.
   *
   * 부팅에서 needsFirstRun 이면 이 화면에서 setStep API 로 시작 단계를 정한다 —
   * 별도 경로를 만들지 않는다 (FR-3.6). 잠긴 종목은 첫 실행에서도 조정 불가 (FR-3.7).
   */
  import { goto } from '$app/navigation';
  import {
    checkGate, getProgression, getStep, setStep, startTier, stepStreak, topLabel, topStandard,
    valueOf, MIN_STEP, MAX_STEP, RULES, TIER_KO, type ProgressionId,
  } from '$lib/domain';
  import type { StandardLabel } from '$lib/domain/types';
  import { appState } from '$lib/ui/state/state.svelte';
  import { todayClock } from '$lib/ui/state/today.svelte';
  import { loadCatalog } from '$lib/data/catalog';
  import ChipGroup from '$lib/ui/common/ChipGroup.svelte';
  import Confirm from '$lib/ui/common/Confirm.svelte';

  const STEP_OPTIONS: readonly number[] = Array.from(
    { length: MAX_STEP - MIN_STEP + 1 },
    (_, i) => MIN_STEP + i,
  );

  const catalog = loadCatalog();

  const ids: ProgressionId[] = ['pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu'];

  /** 조정 대상 — 단계와 시작 기준. 확인 다이얼로그가 열려 있을 때만 값이 있다. */
  interface Target { step: number; tier: StandardLabel }
  let pending = $state<({ id: ProgressionId } & Target) | null>(null);
  let errorMsg = $state<string | null>(null);
  /** 카드마다 고르는 중인 값. 키가 없으면 지금 값이 그대로 선택된 것으로 본다. */
  let drafts = $state<Partial<Record<ProgressionId, Target>>>({});

  // 첫 실행 감지 — history · stints 가 전부 비어 있고, steps 도 초기 상태와 동일하면.
  let isFirstRun = $derived(
    appState.value.history.length === 0 && appState.value.stints.length === 0,
  );

  function now(id: ProgressionId): Target {
    return { step: appState.value.steps[id], tier: stepStreak(appState.value, catalog, id).tier };
  }

  function draftOf(id: ProgressionId): Target {
    const d = drafts[id] ?? now(id);
    // 상급자 ↔ 최상급자는 단계에 따라 이름이 다르다 — 고른 단계에 맞춘다.
    return { step: d.step, tier: startTier(getStep(catalog, id, d.step), d.tier) };
  }

  function tierOptions(id: ProgressionId, n: number): StandardLabel[] {
    return ['beginner', 'intermediate', topLabel(getStep(catalog, id, n))];
  }

  function pick(id: ProgressionId, patch: Partial<Target>) {
    drafts = { ...drafts, [id]: { ...draftOf(id), ...patch } };
  }

  function unchanged(id: ProgressionId): boolean {
    const d = draftOf(id);
    const c = now(id);
    return d.step === c.step && d.tier === c.tier;
  }

  function tryAdjust(id: ProgressionId) {
    // 지금 값 그대로면 바뀌는 것이 없다 — 유지 횟수를 리셋하지 않도록 묻지도 않는다.
    if (unchanged(id)) return;
    pending = { id, ...draftOf(id) };
  }

  function confirmAdjust() {
    if (pending === null) return;
    try {
      // 오늘 날짜를 넘겨 조정 이력을 남긴다 (#4). 기록 탭이 보여준다.
      const next = setStep(
        appState.value, catalog, pending.id, pending.step, todayClock.today, pending.tier,
      );
      appState.apply(next);
      const { [pending.id]: _done, ...rest } = drafts;
      drafts = rest;
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

<section data-steps data-first-run={isFirstRun}>
  <header>
    <h2>단계 현황</h2>
    {#if isFirstRun}
      <p class="hint">첫 실행입니다. 시작할 단계를 골라 두면 오늘 세션이 그 단계로 시작합니다. 그대로 넘어가면 전 종목 2단계로 시작합니다.</p>
    {/if}
  </header>

  {#if errorMsg !== null}
    <p class="error" role="alert" data-steps-error>{errorMsg}</p>
  {/if}

  <div class="cards">
    {#each ids as id (id)}
      {@const gate = checkGate(appState.value, catalog, id)}
      {@const current = appState.value.steps[id]}
      {@const step = getStep(catalog, id, current)}
      {@const top = topStandard(step)}
      <article
        class="card"
        class:locked={!gate.unlocked}
        data-progression={id}
        data-current-step={current}
        data-locked={!gate.unlocked}
      >
        <header>
          <h3>{step.name.ko}</h3>
          <span class="step-badge">{current}단계</span>
        </header>

        {#if !gate.unlocked}
          <p class="lock" data-lock-reason>잠김: {gate.reason}</p>
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
          {@const cur = now(id)}
          {@const d = draftOf(id)}
          <p class="tier-now" data-current-tier={cur.tier}>
            지금 기준: {TIER_KO[cur.tier]} · {stepStreak(appState.value, catalog, id).streak}/{RULES.promotionStreakRequired}회 연속
          </p>
          <details>
            <summary>단계 · 기준 조정</summary>
            <p class="warn">되돌릴 수 없습니다. 조정 시점부터 고른 기준의 연속 횟수를 0 에서 다시 셉니다.</p>
            <p class="pick-label">단계</p>
            <ChipGroup
              options={STEP_OPTIONS}
              value={d.step}
              onSelect={(n) => pick(id, { step: n })}
              ariaLabel="단계"
              name="step-{id}"
              cols={5}
            />
            <p class="pick-label">시작 기준</p>
            <ChipGroup
              options={tierOptions(id, d.step)}
              value={d.tier}
              onSelect={(t) => pick(id, { tier: t })}
              label={(t) => TIER_KO[t]}
              ariaLabel="시작 기준"
              name="tier-{id}"
              cols={3}
            />
            <button
              type="button"
              class="apply"
              data-adjust-apply={id}
              disabled={unchanged(id)}
              onclick={() => tryAdjust(id)}
            >{d.step}단계 {TIER_KO[d.tier]}로 조정</button>
          </details>
        {/if}
      </article>
    {/each}
  </div>

  {#if isFirstRun}
    <button type="button" class="proceed" data-proceed onclick={goHome}>오늘 세션으로 시작</button>
  {/if}
</section>

{#if pending !== null}
  {@const c = now(pending.id)}
  <Confirm
    title="{getProgression(catalog, pending.id).name.ko}: {c.step}단계 {TIER_KO[c.tier]} → {pending.step}단계 {TIER_KO[pending.tier]}로 조정합니다"
    body="되돌릴 수 없습니다. 조정 시점부터 {TIER_KO[pending.tier]} 기준 연속 횟수를 0 에서 다시 셉니다. 그 기준을 {RULES.promotionStreakRequired}회 연속 채우면 다음 기준으로 넘어갑니다. 지난 운동 기록은 바뀌지 않고, 조정한 날짜와 단계 · 기준은 기록 탭에 남습니다."
    confirmLabel="조정"
    onConfirm={confirmAdjust}
    onCancel={() => pending = null}
  />
{/if}

<style>
  section { padding: 1rem 0; }
  header h2 { margin: 0 0 0.25rem; font-size: 1.25rem; }
  .hint { color: var(--muted); margin: 0 0 1rem; font-size: 0.9rem; }
  .cards { display: flex; flex-direction: column; gap: 1rem; }
  .card {
    border: 1px solid var(--border);
    background: var(--surface);
    padding: 1rem;
    border-radius: 8px;
  }
  /* 잠금 사유는 흐리게 하지 않는다 (FR-21.4). 카드 배경만 구분한다. */
  .card.locked { background: var(--surface); }
  .card header { display: flex; justify-content: space-between; align-items: baseline; }
  .card h3 { margin: 0; font-size: 1.05rem; }
  .step-badge {
    background: var(--accent);
    color: var(--bg);
    border: 1px solid var(--accent);
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-size: 0.85rem;
  }
  .lock {
    background: var(--danger-bg);
    border: 1px solid var(--danger);
    color: var(--danger);
    padding: 0.5rem;
    border-radius: 6px;
    margin: 0.5rem 0;
    font-size: 0.85rem;
  }
  dl { margin: 0.5rem 0; display: grid; grid-template-columns: 1fr; gap: 0.15rem; }
  dl div { display: flex; gap: 0.5rem; font-size: 0.9rem; }
  dt { color: var(--muted); min-width: 4.5rem; }
  dd { margin: 0; }
  details summary {
    cursor: pointer;
    padding: 0.5rem 0;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .warn { color: var(--danger); font-size: 0.85rem; margin: 0.25rem 0 0.5rem; }
  .tier-now { margin: 0.25rem 0 0; font-size: 0.9rem; }
  .pick-label { margin: 0.75rem 0 0.35rem; font-size: 0.85rem; color: var(--muted); }
  .apply {
    margin-top: 0.75rem;
    width: 100%;
    min-height: 44px;
    padding: 0.5rem 1rem;
    border: 1px solid var(--accent);
    border-radius: 6px;
    background: transparent;
    color: var(--accent);
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
  }
  .apply:disabled { opacity: 0.45; cursor: not-allowed; }
  .error {
    background: var(--danger-bg);
    color: var(--danger);
    padding: 0.75rem;
    border: 1px solid var(--danger);
    border-radius: 6px;
    margin-bottom: 1rem;
  }
  .proceed {
    margin-top: 1rem;
    width: 100%;
    min-height: 44px;
    padding: 0.75rem 1.25rem;
    background: var(--ok-bg);
    color: var(--fg);
    border: 1px solid var(--ok);
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
  }
</style>

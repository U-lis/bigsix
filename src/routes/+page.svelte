<script lang="ts">
  /**
   * 화면 1 — 오늘 세션 (FR-5, FR-6).
   *
   * planOn 결과를 근거로 표시하고, 세트 입력·완료·불가능·다지기 승인·전환 제안
   * 승인/거절을 처리한다. 도메인 문자열은 가공 없이 그대로 노출한다 (NFR-2).
   *
   * 이 파일 안에서 new Date() 를 부르지 않는다 (FR-4.4). 오늘 날짜는 todayClock 하나.
   */
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import {
    acceptProposal, declineProposal, planOn,
    type DayAgenda, type PlannedExercise,
  } from '$lib/domain';
  import { getProgram } from '$lib/domain/schedule';
  import { appState } from '$lib/ui/state.svelte';
  import { inProgress, isStaleStartedAt } from '$lib/ui/session.svelte';
  import { todayClock } from '$lib/ui/today.svelte';
  import { loadCatalog } from '$lib/data/catalog';
  import ExerciseCard from '$lib/ui/session/ExerciseCard.svelte';
  import ProposalBanner from '$lib/ui/session/ProposalBanner.svelte';
  import FreeExerciseForm from '$lib/ui/session/FreeExerciseForm.svelte';
  import { progressionName } from '$lib/ui/session/labels';
  import Confirm from '$lib/ui/Confirm.svelte';
  import { planHeader } from '$lib/ui/session/labels';

  const catalog = loadCatalog();

  // planOn 은 상태 · 오늘 날짜에 따라 파생된다. 매 렌더 재계산되지만 순수 함수라
  // 비용이 작다 — 도메인이 캐시하지 않는 것과 같은 이유(NFR-18) 로 우리도 캐시하지 않는다.
  let agenda = $derived<DayAgenda>(planOn(appState.value, catalog, todayClock.today));
  let staleWarning = $derived(isStaleStartedAt(inProgress.value, todayClock.today));

  // 다지기 승인 확인 상태.
  let consolidationPending = $state<PlannedExercise | null>(null);

  // 자유 운동 폼 표시 상태 (FR-18.1).
  let showFreeForm = $state(false);

  function onAbandoned(canConsolidate: boolean, consolidation: PlannedExercise | null) {
    if (canConsolidate && consolidation !== null) {
      consolidationPending = consolidation;
    }
    // canConsolidate === false 이면 아무 것도 하지 않는다 — 화면이 자연히 리 렌더된다 (FR-6.10).
  }

  function acceptConsolidation() {
    const plan = consolidationPending;
    if (plan === null) return;
    // 다지기 세션을 진행 중 세션으로 시작한다 — 사용자가 세트를 입력하고 완료로 기록한다 (FR-6.9).
    inProgress.begin(todayClock.today, plan);
    consolidationPending = null;
  }

  function declineConsolidation() {
    consolidationPending = null;
    // 다지기를 하지 않아도 현 단계는 유지된다 (FR-6.10).
  }

  function onAccept() {
    const next = acceptProposal(appState.value, catalog, todayClock.today);
    appState.apply(next);
  }
  function onDecline() {
    const next = declineProposal(appState.value, todayClock.today);
    appState.apply(next);
  }

  function programKo(id: string): string {
    return getProgram(catalog, id).name.ko;
  }

  // no-program 이면 프로그램 선택 화면으로 (FR-3.3 / FR-9.2).
  onMount(() => {
    if (agenda.kind === 'no-program') {
      goto('/programs');
    }
  });
</script>

<section>
  {#if agenda.kind === 'no-program'}
    <p>프로그램이 선택되지 않았습니다.</p>
    <p><a href="/programs">프로그램 선택</a> 화면으로 이동합니다.</p>
  {:else}
    <header class="agenda">
      <h2>{planHeader(programKo(agenda.programId), agenda.dayNumber, agenda.weekday)}</h2>
      <p class="date">{agenda.date}</p>
    </header>

    {#if agenda.proposal !== null}
      <ProposalBanner proposal={agenda.proposal} {catalog} {onAccept} {onDecline} />
    {/if}

    {#if staleWarning && inProgress.value !== null}
      <p class="stale">이 세션은 {inProgress.value.startedAt} 세션입니다.</p>
    {/if}

    {#if agenda.rest}
      <p class="rest">오늘은 휴식일입니다.</p>
    {:else}
      {#if agenda.exercises.length === 0 && agenda.locked.length === 0}
        <p>오늘 계획된 종목이 없습니다.</p>
      {/if}
      <div class="cards">
        {#each agenda.exercises as ex (ex.progressionId)}
          <ExerciseCard plan={ex} today={todayClock.today} {catalog} onAbandoned={onAbandoned} />
          {#if ex.paired !== undefined}
            <ExerciseCard plan={ex.paired} today={todayClock.today} {catalog} onAbandoned={onAbandoned} />
          {/if}
        {/each}
        {#each agenda.locked as l (l.progressionId)}
          <article class="card locked">
            <h3>{progressionName(catalog, l.progressionId)}</h3>
            <p>잠김: {l.reason}</p>
          </article>
        {/each}
      </div>
      <!-- FR-20.5: 워밍업 규칙을 없앤 자리. 수치도 종목별 지시도 없는 사실 한 줄이며,
           세션마다 반복하지 않고 오늘 화면에 한 번만 둔다. -->
      {#if agenda.exercises.length > 0}
        <p class="stretch">운동 전후로 스트레칭을 한다.</p>
      {/if}
    {/if}
  {/if}

  <!-- FR-18.1 자유 운동은 언제든 기록할 수 있다. 휴식일·운동일·미선택 무관. -->
  {#if agenda.kind !== 'no-program'}
    <div class="free-entry">
      <button type="button" onclick={() => (showFreeForm = true)}>자유 운동 기록</button>
    </div>
  {/if}
</section>

{#if showFreeForm}
  <FreeExerciseForm
    today={todayClock.today}
    {catalog}
    onDone={() => (showFreeForm = false)}
    onCancel={() => (showFreeForm = false)}
  />
{/if}

{#if consolidationPending !== null}
  <Confirm
    title="이전 단계 다지기를 하시겠습니까?"
    body="{consolidationPending.performedStep}단계로 내려가 {consolidationPending.work.length}세트를 수행합니다. 승인하면 그 자리에서 다지기 세션이 시작됩니다."
    confirmLabel="다지기 시작"
    cancelLabel="넘기기 (현 단계 유지)"
    onConfirm={acceptConsolidation}
    onCancel={declineConsolidation}
  />
{/if}

<style>
  section { padding: 1rem; padding-bottom: 5rem; max-width: 720px; margin: 0 auto; }
  .agenda h2 { margin: 0 0 0.25rem; font-size: 1.25rem; }
  .date { color: #999; margin: 0 0 1rem; font-size: 0.9rem; }
  .stale {
    background: #322;
    border: 1px solid #a66;
    color: #fcc;
    padding: 0.75rem;
    border-radius: 6px;
    margin-bottom: 1rem;
  }
  .stretch {
    margin: 0.75rem 0 0;
    font-size: 0.85rem;
    color: #888;
  }

  .rest {
    color: #ccc;
    padding: 1rem;
    background: #222;
    border-radius: 6px;
    border: 1px solid #444;
  }
  .cards { display: flex; flex-direction: column; gap: 1rem; }
  .card.locked {
    border: 1px solid #666;
    background: #1a1a1a;
    padding: 1rem;
    border-radius: 8px;
    /* 잠금 사유는 흐리게 하지 않는다 (FR-21.4) — 사용자의 행동을 바꾸는 정보다.
       흐린 색은 부가 정보에만 쓴다. */
    color: #ddd;
  }
  a { color: #8cf; }
  .free-entry {
    margin-top: 1.25rem;
    display: flex;
    justify-content: center;
  }
  .free-entry button {
    min-height: 44px;
    min-width: 44px;
    padding: 0.75rem 1.25rem;
    background: #223;
    color: #ccc;
    border: 1px solid #445;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.95rem;
  }
</style>

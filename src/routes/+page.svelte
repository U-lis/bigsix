<script lang="ts">
  /**
   * 화면 1 — 오늘 세션 (FR-5, FR-6, FR-17).
   *
   * deriveTodayScreen 결과를 근거로 4상태를 분기해 표시한다 (FR-17.2 / ADR-19):
   * 미선택 / 휴식일 / 할 게 없음 / 운동일. 리다이렉트는 하지 않는다 (FR-17.1).
   *
   * 도메인 문자열은 가공 없이 그대로 노출한다 (NFR-2).
   * 이 파일 안에서 new Date() 를 부르지 않는다 (FR-4.4). 오늘 날짜는 todayClock 하나.
   */
  import {
    acceptProposal, declineProposal,
    type PlannedExercise,
  } from '$lib/domain';
  import { getProgram } from '$lib/domain/schedule';
  import { appState } from '$lib/ui/state.svelte';
  import { inProgress, isStaleStartedAt } from '$lib/ui/session.svelte';
  import { todayClock } from '$lib/ui/today.svelte';
  import { loadCatalog } from '$lib/data/catalog';
  import { deriveTodayScreen, type TodayScreenState } from '$lib/ui/todayScreen';
  import ExerciseCard from '$lib/ui/session/ExerciseCard.svelte';
  import ProposalBanner from '$lib/ui/session/ProposalBanner.svelte';
  import FreeExerciseForm from '$lib/ui/session/FreeExerciseForm.svelte';
  import { progressionName, formatKoDate, weekdayKoOf } from '$lib/ui/session/labels';
  import Confirm from '$lib/ui/Confirm.svelte';
  import { planHeader } from '$lib/ui/session/labels';

  const catalog = loadCatalog();

  // 4상태 파생. 순수 함수이며 매 렌더마다 재계산된다 (NFR-18).
  let screen = $derived<TodayScreenState>(
    deriveTodayScreen(appState.value, catalog, todayClock.today),
  );
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
</script>

<section data-today={screen.kind}>
  {#if screen.kind === 'no-program'}
    <!-- FR-17.1 리다이렉트 아님. 안내와 진입 버튼을 화면에 둔다 (EC-39). -->
    <p class="no-program">선택한 프로그램이 없습니다.</p>
    <a class="btn" href="/programs" data-goto-programs>프로그램 선택하기</a>
  {:else if screen.kind === 'rest'}
    {#if staleWarning && inProgress.value !== null}
      <p class="stale" data-stale>이 세션은 {inProgress.value.startedAt} 세션입니다.</p>
    {/if}
    <p class="rest">
      오늘은 휴식일입니다.
      {#if screen.nextTrainingDate}
        다음 루틴은 {formatKoDate(screen.nextTrainingDate)}({weekdayKoOf(screen.nextTrainingDate)}요일)에 시작됩니다.
      {:else}
        당분간 수행할 종목이 없습니다.
      {/if}
    </p>
  {:else if screen.kind === 'no-doable'}
    {#if staleWarning && inProgress.value !== null}
      <p class="stale" data-stale>이 세션은 {inProgress.value.startedAt} 세션입니다.</p>
    {/if}
    <div class="no-doable">
      {#each screen.locked as l (l.progressionId)}
        <article class="card locked" data-progression={l.progressionId} data-locked="true">
          <h3>{progressionName(catalog, l.progressionId)}</h3>
          <p>잠김: {l.reason}</p>
        </article>
      {/each}
      <p class="rest">
        오늘 계획된 종목이 모두 잠겨 있습니다.
        {#if screen.nextTrainingDate}
          다음 루틴은 {formatKoDate(screen.nextTrainingDate)}({weekdayKoOf(screen.nextTrainingDate)}요일)에 시작됩니다.
        {:else}
          당분간 수행할 종목이 없습니다.
        {/if}
      </p>
    </div>
  {:else}
    <header class="agenda">
      <h2>{planHeader(programKo(screen.agenda.programId), screen.agenda.dayNumber, screen.agenda.weekday)}</h2>
      <p class="date">{screen.agenda.date}</p>
    </header>

    {#if screen.agenda.proposal !== null}
      <ProposalBanner proposal={screen.agenda.proposal} {catalog} {onAccept} {onDecline} />
    {/if}

    {#if staleWarning && inProgress.value !== null}
      <p class="stale" data-stale>이 세션은 {inProgress.value.startedAt} 세션입니다.</p>
    {/if}

    <div class="cards">
      {#each screen.agenda.exercises as ex (ex.progressionId)}
        <ExerciseCard plan={ex} today={todayClock.today} {catalog} onAbandoned={onAbandoned} />
        {#if ex.paired !== undefined}
          <ExerciseCard plan={ex.paired} today={todayClock.today} {catalog} onAbandoned={onAbandoned} />
        {/if}
      {/each}
      {#each screen.agenda.locked as l (l.progressionId)}
        <article class="card locked" data-progression={l.progressionId} data-locked="true">
          <h3>{progressionName(catalog, l.progressionId)}</h3>
          <p>잠김: {l.reason}</p>
        </article>
      {/each}
    </div>
    <!-- FR-20.5: 워밍업 규칙을 없앤 자리. 수치도 종목별 지시도 없는 사실 한 줄이며,
         세션마다 반복하지 않고 오늘 화면에 한 번만 둔다. -->
    <p class="stretch">운동 전후로 스트레칭을 한다.</p>
  {/if}

  <!-- FR-18.1 자유 운동은 언제든 기록할 수 있다. 4상태 모두에서 노출. -->
  <div class="free-entry">
    <button type="button" data-free-open onclick={() => (showFreeForm = true)}>자유 운동 기록</button>
  </div>
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
  section { padding: 1rem 0; }
  .agenda h2 { margin: 0 0 0.25rem; font-size: 1.25rem; }
  .date { color: var(--muted); margin: 0 0 1rem; font-size: 0.9rem; }
  .stale {
    background: var(--danger-bg);
    border: 1px solid var(--danger);
    color: var(--fg);
    padding: 0.75rem;
    border-radius: 6px;
    margin-bottom: 1rem;
  }
  .stretch {
    margin: 0.75rem 0 0;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .rest {
    color: var(--fg);
    padding: 1rem;
    background: var(--surface);
    border-radius: 6px;
    border: 1px solid var(--border);
  }
  .no-program {
    color: var(--muted);
    padding: 1rem 0;
    font-size: 1rem;
  }
  .no-doable {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .cards { display: flex; flex-direction: column; gap: 1rem; }
  .card.locked {
    border: 1px solid var(--border);
    background: var(--surface);
    padding: 1rem;
    border-radius: 8px;
    /* 잠금 사유는 흐리게 하지 않는다 (FR-21.4) — 사용자의 행동을 바꾸는 정보다.
       흐린 색은 부가 정보에만 쓴다. */
    color: var(--fg);
  }
  a { color: var(--accent); }
  a.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    min-width: 44px;
    padding: 0.75rem 1.25rem;
    background: transparent;
    color: var(--accent);
    text-decoration: none;
    border: 1px solid var(--accent);
    border-radius: 6px;
    font-size: 1rem;
  }
  .free-entry {
    margin-top: 1.25rem;
    display: flex;
    justify-content: center;
  }
  .free-entry button {
    min-height: 44px;
    min-width: 44px;
    padding: 0.75rem 1.25rem;
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.95rem;
  }
</style>

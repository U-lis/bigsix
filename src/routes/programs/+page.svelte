<script lang="ts">
  /**
   * 화면 2 — 프로그램 선택 (FR-7).
   *
   * describePrograms(catalog) 5종을 표시. 미선택이면 selectProgram, 진행 중이면
   * switchProgram. 오늘 날짜는 todayClock 에서 주입한다.
   */
  import { goto } from '$app/navigation';
  import { describePrograms, selectProgram, switchProgram, currentStint, firstTrainingDay } from '$lib/domain';
  import { appState } from '$lib/ui/state.svelte';
  import { todayClock } from '$lib/ui/today.svelte';
  import { loadCatalog } from '$lib/data/catalog';
  import Confirm from '$lib/ui/Confirm.svelte';
  import { progressionName } from '$lib/ui/session/labels';

  const catalog = loadCatalog();
  const programs = describePrograms(catalog);

  let currentProgramId = $derived(currentStint(appState.value)?.programId ?? null);
  let pending = $state<string | null>(null); // 확인 대기 중인 프로그램 id

  function onSelect(id: string) {
    // 이미 현재 프로그램이면 아무 것도 하지 않는다.
    if (id === currentProgramId) { goto('/'); return; }
    if (currentProgramId === null) {
      // 미선택 → 즉시 선택 (확인 불필요, 첫 선택).
      const next = selectProgram(appState.value, catalog, id, todayClock.today);
      appState.apply(next);
      goto('/');
    } else {
      // 진행 중 → 확인 단계 (FR-7.7).
      pending = id;
    }
  }

  function confirmSwitch() {
    const id = pending;
    if (id === null) return;
    const next = switchProgram(appState.value, catalog, id, todayClock.today);
    appState.apply(next);
    pending = null;
    goto('/');
  }

  function firstDayPreview(id: string): string {
    return firstTrainingDay(catalog, id, todayClock.today);
  }

  function isRestOnSelectDay(id: string): boolean {
    return firstDayPreview(id) !== todayClock.today;
  }
</script>

<section>
  <header>
    <h2>프로그램 선택</h2>
    <p class="today">오늘 {todayClock.today}</p>
  </header>

  <div class="cards">
    {#each programs as p (p.id)}
      {@const isCurrent = p.id === currentProgramId}
      {@const restDaySelect = isRestOnSelectDay(p.id)}
      <article class="card" class:current={isCurrent}>
        <header>
          <h3>{p.name.ko}</h3>
          {#if isCurrent}<span class="badge">현재</span>{/if}
        </header>
        <dl>
          <div><dt>빈도</dt><dd>{p.frequency}</dd></div>
          <div><dt>운동일</dt><dd>{p.trainingDays}일 / 7</dd></div>
          <div><dt>휴식일</dt><dd>{p.restDays}일 / 7</dd></div>
          <div><dt>종목</dt><dd>{p.progressionIds.map((id) => progressionName(catalog, id)).join(', ')}</dd></div>
          {#if p.note !== undefined}<div><dt>비고</dt><dd>{p.note}</dd></div>{/if}
        </dl>
        {#if !isCurrent && restDaySelect}
          <p class="rest-note">
            오늘 {todayClock.today} 은 이 루틴의 휴식일입니다. 다음 첫 운동일
            {firstDayPreview(p.id)} 이 1일차가 됩니다.
          </p>
        {/if}
        <button type="button" onclick={() => onSelect(p.id)}>
          {isCurrent ? '오늘 세션으로' : (currentProgramId === null ? '선택' : '이 프로그램으로 전환')}
        </button>
      </article>
    {/each}
  </div>
</section>

{#if pending !== null}
  <Confirm
    title="프로그램을 전환하시겠습니까?"
    body="steps · history 는 바뀌지 않고 유지됩니다. 며칠차는 1부터 다시 셉니다. 미결 전환 제안은 새 구간의 첫 월요일에 다시 검토됩니다."
    confirmLabel="전환"
    onConfirm={confirmSwitch}
    onCancel={() => pending = null}
  />
{/if}

<style>
  section { padding: 1rem 0; }
  header h2 { margin: 0; font-size: 1.25rem; }
  .today { color: var(--muted); margin: 0.25rem 0 1rem; font-size: 0.9rem; }
  .cards { display: flex; flex-direction: column; gap: 1rem; }
  .card {
    border: 1px solid var(--border);
    background: var(--surface);
    padding: 1rem;
    border-radius: 8px;
  }
  /* "현재" 카드는 배지(<span class="badge">현재</span>)가 같은 자리에 이미 서
     있으니 색은 부가 신호다. 그래도 카드가 여러 장 쌓인 목록에서 테두리 색 하나
     로는 약해 배경도 한 겹 준다 — 배지가 --ok 계열이라 카드도 그쪽으로 맞춘다. */
  .card.current { border-color: var(--ok); background: var(--ok-bg); }
  .card header { display: flex; align-items: center; justify-content: space-between; }
  .card h3 { margin: 0; font-size: 1.05rem; }
  .badge {
    background: var(--ok-bg);
    color: var(--ok);
    border: 1px solid var(--ok);
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
  }
  dl { margin: 0.75rem 0; display: grid; grid-template-columns: 1fr; gap: 0.25rem 0; }
  dl div { display: flex; gap: 0.5rem; font-size: 0.9rem; }
  dt { color: var(--muted); min-width: 4.5rem; }
  dd { margin: 0; }
  .rest-note {
    color: var(--danger);
    background: var(--danger-bg);
    border: 1px solid var(--danger);
    padding: 0.5rem;
    border-radius: 6px;
    font-size: 0.85rem;
    margin: 0.5rem 0;
  }
  button {
    margin-top: 0.5rem;
    min-height: 44px;
    padding: 0.75rem 1.25rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
    color: var(--fg);
    cursor: pointer;
    font-size: 1rem;
    width: 100%;
  }
</style>

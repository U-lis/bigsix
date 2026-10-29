<script lang="ts">
  /**
   * 화면 2 — 프로그램 선택 (FR-7).
   *
   * describePrograms(catalog) 5종을 표시. 미선택이면 selectProgram, 진행 중이면
   * switchProgram. 오늘 날짜는 todayClock 에서 주입한다.
   *
   * 「내 프로그램」(#13) — 사용자가 만든 프로그램이 5종 아래에 같은 카드로 선다.
   * 한 번이라도 쓴 프로그램은 고치거나 지울 수 없고 복제만 된다 (지난 기록 보호).
   */
  import { goto } from '$app/navigation';
  import {
    describePrograms, describeProgram, selectProgram, switchProgram, currentStint,
    firstTrainingDay, getProgram, isProgramUsed, programToInput, removeCustomProgram,
  } from '$lib/domain';
  import type { CustomProgramInput } from '$lib/domain/types';
  import type { ProgramDescription } from '$lib/domain';
  import { appState } from '$lib/ui/state/state.svelte';
  import { todayClock } from '$lib/ui/state/today.svelte';
  import { catalogFor, loadCatalog } from '$lib/data/catalog';
  import Confirm from '$lib/ui/common/Confirm.svelte';
  import { progressionName } from '$lib/ui/session/labels';
  import CustomProgramForm from '$lib/ui/program/CustomProgramForm.svelte';
  import { copyName, emptyInput, scheduleLine } from '$lib/ui/program/customForm';

  const programs = describePrograms(loadCatalog());
  let catalog = $derived(catalogFor(appState.value));
  let customs = $derived(
    (appState.value.customPrograms ?? []).map((p) => describeProgram(catalog, p.id)),
  );

  /** 열린 폼. null 이면 닫힘. */
  let form = $state<{ initial: CustomProgramInput; editId?: string } | null>(null);
  let deleting = $state<string | null>(null);

  function openNew() {
    form = { initial: emptyInput() };
  }

  function openEdit(id: string) {
    form = { initial: programToInput(catalog, getProgram(catalog, id)), editId: id };
  }

  function openCopy(id: string) {
    const base = programToInput(catalog, getProgram(catalog, id));
    const taken = catalog.programs.map((p) => p.name.ko);
    form = { initial: { ...base, name: copyName(base.name, taken) } };
  }

  function confirmDelete() {
    if (deleting === null) return;
    appState.apply(removeCustomProgram(appState.value, deleting));
    deleting = null;
  }

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

<section data-programs>
  <header>
    <h2>프로그램 선택</h2>
    <p class="today">오늘 {todayClock.today}</p>
  </header>

  {#snippet card(p: ProgramDescription, custom: boolean)}
    {@const isCurrent = p.id === currentProgramId}
    {@const restDaySelect = isRestOnSelectDay(p.id)}
    {@const used = custom && isProgramUsed(appState.value, p.id)}
    <article
      class="card"
      class:current={isCurrent}
      data-program={p.id}
      data-current={isCurrent}
      data-custom-program={custom ? p.id : undefined}
    >
      <header>
        <h3>{p.name.ko}</h3>
        {#if isCurrent}<span class="badge">현재</span>{/if}
      </header>
      <dl>
        <div><dt>빈도</dt><dd>{p.frequency}</dd></div>
        <div><dt>운동일</dt><dd>{p.trainingDays}일 / 7</dd></div>
        <div><dt>휴식일</dt><dd>{p.restDays}일 / 7</dd></div>
        <div><dt>종목</dt><dd>{p.progressionIds.map((id) => progressionName(catalog, id)).join(', ')}</dd></div>
        {#if custom}
          <div><dt>요일표</dt><dd data-custom-schedule>{scheduleLine(catalog, getProgram(catalog, p.id))}</dd></div>
        {/if}
        {#if p.note !== undefined}<div><dt>비고</dt><dd>{p.note}</dd></div>{/if}
      </dl>
      {#if !isCurrent && restDaySelect}
        <p class="rest-note" data-rest-note>
          오늘 {todayClock.today} 은 이 루틴의 휴식일입니다. 다음 첫 운동일
          {firstDayPreview(p.id)} 이 1일차가 됩니다.
        </p>
      {/if}
      <button type="button" data-program-select={p.id} onclick={() => onSelect(p.id)}>
        {isCurrent ? '오늘 세션으로' : (currentProgramId === null ? '선택' : '이 프로그램으로 전환')}
      </button>
      <div class="sub-actions">
        {#if custom}
          <button type="button" data-custom-edit={p.id} disabled={used} onclick={() => openEdit(p.id)}>고치기</button>
        {/if}
        <button type="button" data-custom-copy={p.id} onclick={() => openCopy(p.id)}>
          {custom ? '복제' : '복제해서 내 프로그램 만들기'}
        </button>
        {#if custom}
          <button type="button" data-custom-delete={p.id} disabled={used} onclick={() => (deleting = p.id)}>지우기</button>
        {/if}
      </div>
      {#if used}
        <p class="used" data-custom-used>
          이 프로그램으로 운동한 기록이 있어 고치거나 지울 수 없습니다. 지난 날의 계획이 바뀌지
          않도록 하기 위해서입니다. 바꾸려면 복제해서 고치세요.
        </p>
      {/if}
    </article>
  {/snippet}

  <div class="cards">
    {#each programs as p (p.id)}
      {@render card(p, false)}
    {/each}
  </div>

  <section class="mine" data-custom-list>
    <h2>내 프로그램</h2>
    {#if customs.length === 0}
      <p class="today" data-custom-empty>
        아직 만든 프로그램이 없습니다. 요일마다 할 종목을 직접 골라 주간 프로그램을 만들 수 있습니다.
        만든 프로그램도 알림과 기록에 똑같이 쓰입니다. 자동 전환 제안은 나오지 않습니다.
      </p>
    {/if}
    <div class="cards">
      {#each customs as p (p.id)}
        {@render card(p, true)}
      {/each}
    </div>
    <button type="button" class="new" data-custom-new onclick={openNew}>새 프로그램 만들기</button>
  </section>
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

{#if deleting !== null}
  <Confirm
    title="프로그램 지우기: {getProgram(catalog, deleting).name.ko}"
    body="아직 한 번도 쓰지 않은 프로그램이라 지워도 기록에는 영향이 없습니다. 되돌릴 수 없습니다."
    confirmLabel="지우기"
    onConfirm={confirmDelete}
    onCancel={() => deleting = null}
  />
{/if}

{#if form !== null}
  <CustomProgramForm
    {catalog}
    initial={form.initial}
    editId={form.editId}
    onDone={() => (form = null)}
    onCancel={() => (form = null)}
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
  .mine { margin-top: 1.5rem; }
  .mine h2 { margin: 0 0 0.5rem; font-size: 1.1rem; }
  .sub-actions { display: flex; gap: 0.5rem; }
  .sub-actions button { flex: 1; font-size: 0.9rem; padding: 0.5rem; }
  /* 잠금은 색 하나가 아니라 투명도 + 커서 + disabled. 사유는 아래 문구가 맡는다. */
  .sub-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
  .used { color: var(--muted); font-size: 0.85rem; margin: 0.5rem 0 0; }
  .new { margin-top: 1rem; border-color: var(--accent); color: var(--accent); }
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

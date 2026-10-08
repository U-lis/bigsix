<script lang="ts">
  /**
   * 화면 1 — 오늘 세션 (FR-5, FR-6, FR-17, FR-39~43).
   *
   * deriveTodayScreen 결과를 근거로 4상태를 분기해 표시한다 (FR-17.2 / ADR-19):
   * 미선택 / 휴식일 / 할 게 없음 / 운동일. 리다이렉트는 하지 않는다 (FR-17.1).
   *
   * SPEC5 (Phase 4): 「세션 완료 기록」 카드별 버튼을 없애고 하단 「오늘 운동 마치기」
   * 하나로 모든 종목을 한 번에 기록·판정한다 (FR-42). 「이 단계 중단」 토글이 즉시
   * 기록하지 않고 abandoned 플래그만 세우므로, 다지기 제안·연결 다지기 칸 닫기(EC-94)
   * 를 이 파일이 조율한다.
   *
   * 도메인 문자열은 가공 없이 그대로 노출한다 (NFR-2).
   * 이 파일 안에서 new Date() 를 부르지 않는다 (FR-4.4). 오늘 날짜는 todayClock 하나.
   */
  import {
    acceptProposal, canConsolidate, declineProposal, getProgram, getStep, planConsolidation,
    type PlannedExercise, type ProgressionId, type SessionRecord,
  } from '$lib/domain';
  import { appState } from '$lib/ui/state/state.svelte';
  import { inProgress } from '$lib/ui/session/session.svelte';
  import { todayClock } from '$lib/ui/state/today.svelte';
  import { loadCatalog } from '$lib/data/catalog';
  import { deriveTodayScreen, type TodayScreenState } from '$lib/ui/today/todayScreen';
  import { draftKey } from '$lib/ui/state/storage';
  import { planFinish, type FinishResult } from '$lib/ui/session/finish';
  import ExerciseCard from '$lib/ui/session/ExerciseCard.svelte';
  import ProposalBanner from '$lib/ui/session/ProposalBanner.svelte';
  import StaleBanner from '$lib/ui/session/StaleBanner.svelte';
  import FreeExerciseForm from '$lib/ui/session/FreeExerciseForm.svelte';
  import FinishBar from '$lib/ui/session/FinishBar.svelte';
  import FinishDialog from '$lib/ui/session/FinishDialog.svelte';
  import { progressionName, formatKoDate, weekdayKoOf } from '$lib/ui/session/labels';
  import Confirm from '$lib/ui/common/Confirm.svelte';
  import { planHeader } from '$lib/ui/session/labels';

  const catalog = loadCatalog();

  // 4상태 파생. 순수 함수이며 매 렌더마다 재계산된다 (NFR-18).
  let screen = $derived<TodayScreenState>(
    deriveTodayScreen(appState.value, catalog, todayClock.today),
  );

  // 자유 운동 폼 표시 상태.
  let showFreeForm = $state(false);

  // 다지기 제안 다이얼로그: progressionId 와 미리 만든 plan 을 가진다.
  let consolidationPending = $state<{ id: ProgressionId; plan: PlannedExercise } | null>(null);

  // 연결 다지기 칸 닫기 확인 (EC-94).
  let closeConsolidationFor = $state<ProgressionId | null>(null);

  // FinishDialog 열림 상태.
  let finishDialogOpen = $state(false);

  // 마지막 마치기 결과 — 승급·보류·실패 노출용 (FR-42.6~7).
  let lastFinishResult = $state<FinishResult | null>(null);

  // 오늘 자 agenda 순서를 progressionId 배열로 — FinishBar · FinishDialog 가 쓴다.
  let agendaOrder = $derived<ProgressionId[]>(buildAgendaOrder(screen));

  function buildAgendaOrder(s: TodayScreenState): ProgressionId[] {
    if (s.kind !== 'training') return [];
    const out: ProgressionId[] = [];
    for (const ex of s.agenda.exercises) {
      out.push(ex.progressionId);
      if (ex.paired !== undefined) out.push(ex.paired.progressionId);
    }
    return out;
  }

  // 「오늘 운동 마치기」 활성 조건 (FR-42.2) — 세트가 있거나 abandoned 인 오늘 자 칸.
  let finishEnabled = $derived.by(() => {
    for (const d of Object.values(inProgress.drafts)) {
      if (d.startedAt !== todayClock.today) continue;
      if (d.workSets.length > 0) return true;
      if (d.abandoned === true) return true;
    }
    return false;
  });

  // 오늘 자 drafts 만 추려 FinishDialog 에 보낸다 (FR-44.4 — 날 넘긴 칸은 섞지 않는다).
  let todayDrafts = $derived(filterTodayDrafts(inProgress.drafts, todayClock.today));

  function filterTodayDrafts(
    all: Record<string, import('$lib/ui/state/storage').SessionDraft>,
    today: string,
  ) {
    const out: typeof all = {};
    for (const [k, d] of Object.entries(all)) {
      if (d.startedAt === today) out[k] = d;
    }
    return out;
  }

  let finishPlan = $derived(planFinish(todayDrafts, agendaOrder));

  // 다지기 제안 — ExerciseCard 가 올려 보낸 abandon on/off 콜백에서 호출.
  function onAbandonMark(progressionId: string, on: boolean): void {
    const id = progressionId as ProgressionId;
    if (on) {
      // on → 가능하면 다지기 제안.
      if (!canConsolidate(appState.value, catalog, id)) return;
      const plan = planConsolidation(appState.value, catalog, id);
      consolidationPending = { id, plan };
    } else {
      // off → 연결 다지기 칸이 열려 있으면 닫을지 확인 (EC-94).
      const consolKey = draftKey(id, 'consolidation');
      const workKey = draftKey(id, 'work');
      const consol = inProgress.drafts[consolKey];
      if (consol !== undefined && consol.linkedTo === workKey) {
        closeConsolidationFor = id;
      }
    }
  }

  function acceptConsolidation(): void {
    const p = consolidationPending;
    if (p === null) return;
    const workKey = draftKey(p.id, 'work');
    inProgress.beginConsolidation(
      todayClock.today, appState.value, catalog, p.id, workKey,
    );
    consolidationPending = null;
  }

  function declineConsolidation(): void {
    consolidationPending = null;
  }

  function doCloseLinkedConsolidation(): void {
    const id = closeConsolidationFor;
    closeConsolidationFor = null;
    if (id === null) return;
    inProgress.discardDraft(draftKey(id, 'consolidation'));
  }

  function keepLinkedConsolidation(): void {
    closeConsolidationFor = null;
  }

  function openFinish(): void {
    if (!finishEnabled) return;
    finishDialogOpen = true;
  }

  function cancelFinish(): void {
    finishDialogOpen = false;
  }

  function confirmFinish(): void {
    const result = inProgress.finish(
      appState.value, catalog, todayClock.nowIsoLocal(), { kind: 'all' }, agendaOrder,
    );
    appState.apply(result.nextState);
    lastFinishResult = result;
    finishDialogOpen = false;
  }

  function onAccept(): void {
    const next = acceptProposal(appState.value, catalog, todayClock.today);
    appState.apply(next);
  }
  function onDecline(): void {
    const next = declineProposal(appState.value, todayClock.today);
    appState.apply(next);
  }

  function programKo(id: string): string {
    return getProgram(catalog, id).name.ko;
  }

  // ── 마지막 결과 노출: 승급·보류 — history 의 가장 최근 몇 개를 사실만. ──
  function latestRecordsFromResult(r: FinishResult): SessionRecord[] {
    const n = r.perDraft.filter((p) => p.ok).length;
    if (n === 0) return [];
    return r.nextState.history.slice(-n);
  }

  // SessionRecord 는 수가 적어도 되므로 그대로 꺼내 사실만 표시한다.
  // promotedTo 가 있으면 「승급」, blockedBy 가 있으면 「보류」, outcome=abandoned 는 「중단」.
  function recordLine(r: SessionRecord): string {
    const prog = progressionName(catalog, r.progressionId);
    if (r.promotedTo !== undefined && r.promotedTo !== null) {
      return `${prog}: ${r.step}단계 → ${r.promotedTo}단계 (승급)`;
    }
    if (r.blockedBy !== undefined) {
      return `${prog}: ${r.step}단계 (보류 · ${r.blockedBy})`;
    }
    if (r.outcome === 'abandoned') return `${prog}: ${r.step}단계 중단`;
    return `${prog}: ${r.step}단계 기록`;
  }
</script>

<section data-today={screen.kind}>
  <!-- SPEC5 FR-44 · ADR-48: 날 넘긴 칸은 StaleBanner 가 상단에서 처리한다. 오늘
       카드는 draft.startedAt === today 인 칸만 보이므로 섞이지 않는다. -->
  <StaleBanner
    today={todayClock.today}
    appStateValue={appState.value}
    {catalog}
    nowIsoLocal={() => todayClock.nowIsoLocal()}
    onApply={(next) => appState.apply(next)}
  />

  {#if screen.kind === 'no-program'}
    <!-- FR-17.1 리다이렉트 아님. 안내와 진입 버튼을 화면에 둔다 (EC-39). -->
    <p class="no-program">선택한 프로그램이 없습니다.</p>
    <a class="btn" href="/programs" data-goto-programs>프로그램 선택하기</a>
  {:else if screen.kind === 'rest'}
    <p class="rest">
      오늘은 휴식일입니다.
      {#if screen.nextTrainingDate}
        다음 루틴은 {formatKoDate(screen.nextTrainingDate)}({weekdayKoOf(screen.nextTrainingDate)}요일)에 시작됩니다.
      {:else}
        당분간 수행할 종목이 없습니다.
      {/if}
    </p>
  {:else if screen.kind === 'no-doable'}
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

    <div class="cards">
      {#each screen.agenda.exercises as ex (ex.progressionId)}
        <ExerciseCard plan={ex} today={todayClock.today} {catalog} {onAbandonMark} />
        {#if inProgress.drafts[draftKey(ex.progressionId, 'consolidation')] !== undefined}
          {@const consol = inProgress.drafts[draftKey(ex.progressionId, 'consolidation')]}
          {@const prev = getStep(catalog, ex.progressionId, consol.performedStep)}
          {#if consol.startedAt === todayClock.today && consol.target !== undefined}
            <ExerciseCard
              plan={{
                progressionId: ex.progressionId,
                step: consol.step,
                performedStep: consol.performedStep,
                stepName: prev.name,
                unit: prev.unit,
                perSide: prev.perSide === true,
                work: consol.target.work,
                goal: consol.target.goal,
                kind: 'consolidation',
                reason: '다지기 칸 — 세트를 쌓고 「오늘 운동 마치기」로 기록합니다.',
              }}
              today={todayClock.today}
              {catalog}
              {onAbandonMark}
            />
          {/if}
        {/if}
        {#if ex.paired !== undefined}
          <ExerciseCard plan={ex.paired} today={todayClock.today} {catalog} {onAbandonMark} />
        {/if}
      {/each}
      {#each screen.agenda.locked as l (l.progressionId)}
        <article class="card locked" data-progression={l.progressionId} data-locked="true">
          <h3>{progressionName(catalog, l.progressionId)}</h3>
          <p>잠김: {l.reason}</p>
        </article>
      {/each}
      <!-- 자유 운동 칸은 작업 카드 바깥에 독립 카드로 보인다. -->
      {#each Object.values(todayDrafts).filter((d) => d.kind === 'free') as free (draftKey(free.progressionId, 'free'))}
        {@const fstep = getStep(catalog, free.progressionId, free.performedStep)}
        <ExerciseCard
          plan={{
            progressionId: free.progressionId,
            step: free.step,
            performedStep: free.performedStep,
            stepName: fstep.name,
            unit: fstep.unit,
            perSide: fstep.perSide === true,
            work: [],
            goal: { label: 'beginner', sets: 0, value: 0 },
            kind: 'consolidation',
            reason: '자유 운동 칸 — 세트를 쌓고 「오늘 운동 마치기」로 기록합니다.',
          }}
          draftKind="free"
          today={todayClock.today}
          {catalog}
          {onAbandonMark}
        />
      {/each}
    </div>
    <!-- FR-20.5: 워밍업 규칙을 없앤 자리. 수치도 종목별 지시도 없는 사실 한 줄이며,
         세션마다 반복하지 않고 오늘 화면에 한 번만 둔다. -->
    <p class="stretch">운동 전후로 스트레칭을 한다.</p>
  {/if}

  <!-- FR-42.1 · UI-18 — 「자유 운동 기록」 폼 열기 버튼 바로 위, 페이지 흐름 안. -->
  <FinishBar enabled={finishEnabled} onOpen={openFinish} />

  {#if lastFinishResult !== null}
    <div class="finish-result" data-finish-result>
      <h4>기록 결과</h4>
      {#each latestRecordsFromResult(lastFinishResult) as r (r.progressionId + ':' + r.step + ':' + r.date)}
        <p class="row ok">{recordLine(r)}</p>
      {/each}
      {#each lastFinishResult.perDraft.filter((p) => !p.ok) as f (f.draftKey)}
        <p class="row fail" data-finish-fail={f.draftKey}>
          {f.draftKey}: 기록 실패{f.reason !== undefined ? ` — ${f.reason}` : ''}
        </p>
      {/each}
    </div>
  {/if}

  <!-- FR-18.1 자유 운동은 언제든 열 수 있다. 4상태 모두에서 노출. -->
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
    body="{consolidationPending.plan.performedStep}단계로 내려가 {consolidationPending.plan.work.length}세트를 수행합니다. 승인하면 그 자리에서 다지기 칸이 열립니다. 세트는 「오늘 운동 마치기」 가 중단 기록 뒤에 다지기 기록으로 남깁니다."
    confirmLabel="다지기 칸 열기"
    cancelLabel="넘기기"
    onConfirm={acceptConsolidation}
    onCancel={declineConsolidation}
  />
{/if}

{#if closeConsolidationFor !== null}
  <Confirm
    title="연결된 다지기 칸을 함께 닫으시겠습니까?"
    body="중단 표시를 해제했습니다. 연결된 다지기 칸의 세트가 함께 사라집니다."
    confirmLabel="다지기 칸 닫기"
    cancelLabel="그대로 두기"
    onConfirm={doCloseLinkedConsolidation}
    onCancel={keepLinkedConsolidation}
  />
{/if}

{#if finishDialogOpen}
  <FinishDialog
    {catalog}
    plan={finishPlan}
    drafts={todayDrafts}
    onConfirm={confirmFinish}
    onCancel={cancelFinish}
  />
{/if}

<style>
  section { padding: 1rem 0; }
  .agenda h2 { margin: 0 0 0.25rem; font-size: 1.25rem; }
  .date { color: var(--muted); margin: 0 0 1rem; font-size: 0.9rem; }
  .stretch {
    margin: 0.75rem 0 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .finish-result {
    margin-top: 1rem;
    padding: 0.75rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .finish-result h4 { margin: 0 0 0.5rem; font-size: 0.95rem; color: var(--muted); }
  .finish-result .row { margin: 0.25rem 0; font-size: 0.9rem; }
  .finish-result .row.ok { color: var(--fg); }
  .finish-result .row.fail { color: var(--danger); }

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

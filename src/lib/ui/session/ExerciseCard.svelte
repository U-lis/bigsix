<script lang="ts">
  /**
   * 한 종목 카드 (SPEC5 Phase 4 · ADR-47 / FR-39.5~6 / FR-40 / FR-41).
   *
   * SPEC5 변경:
   *   - 카드는 `inProgress.drafts[draftKey(plan.progressionId, plan.kind)]` 에 바인딩.
   *   - 「세션 완료 기록」 버튼 (`data-finalize`) 과 즉시 기록 경로 제거 — 「오늘 운동
   *     마치기」(FinishBar) 가 모든 칸을 한 번에 기록·판정한다 (FR-42.1).
   *   - 「불가능」 → 「이 단계 중단」 토글 (`data-abandon-mark="on|off"`) — 즉시 기록하지
   *     않고 칸에 abandoned 플래그만 세운다 (FR-41.2 / ADR-45). 상위 페이지가
   *     onAbandonMark 로 다지기 제안·연결 다지기 칸 처리를 맡는다.
   *   - 세트 행에 1-based `data-set-row`, 편집·삭제 버튼 (`data-set-edit` ·
   *     `data-set-delete`), 미달 「{값} / 목표 {목표} · 미달」 (`data-set-short`),
   *     N 초과 「추가 세트」 (`data-set-extra`) — FR-39.6 / FR-40.
   *   - 중단 표시 시 세트 입력 영역을 CSS 로 접는다 (ADR-47 / CLAUDE.md).
   *   - 스테일 키 충돌 — `beginWork` 가 false 를 돌려주면 입력을 잠그고
   *     `data-draft-blocked` 로 안내한다 (PLAN §6 / CLAUDE.md 잠금 규칙).
   *
   * 도메인 문자열(reason / sideNote) 는 가공 없이 그대로 노출한다 (NFR-2 / FR-5.3).
   */
  import type {
    Catalog, IsoDate, PlannedExercise, SetMode, Unit,
  } from '$lib/domain/types';
  import { PROMOTION_STREAK } from '$lib/domain';
  import { inProgress } from './session.svelte';
  import { draftKey, type SessionDraft, type SetEntry } from '$lib/ui/state/storage';
  import {
    exerciseTitle, kindLabel, setTargetLabel, standardLabel, unitLabel,
  } from './labels';
  import RepsInput from './RepsInput.svelte';
  import TimerInput from './TimerInput.svelte';
  import RpeInput from './RpeInput.svelte';
  import Howto from './Howto.svelte';
  import Confirm from '$lib/ui/common/Confirm.svelte';

  interface Props {
    plan: PlannedExercise;
    today: IsoDate;
    catalog: Catalog;
    /**
     * draft 종류 오버라이드. 자유 운동 칸처럼 PlannedExercise.kind 로 표현할 수 없는
     * (`PlannedExercise.kind` 는 `work|consolidation` 만) 칸을 렌더링할 때 쓴다.
     * 생략하면 `plan.kind` 를 쓴다.
     */
    draftKind?: 'work' | 'consolidation' | 'free';
    /**
     * 「이 단계 중단」 토글 변화를 상위에 알린다. on=true 는 다지기 제안을,
     * on=false 는 연결 다지기 칸 닫기 확인(EC-94) 을 상위에서 처리한다.
     */
    onAbandonMark?: (progressionId: string, on: boolean) => void;
  }
  let { plan, today, catalog, draftKind, onAbandonMark }: Props = $props();

  const kind = $derived(draftKind ?? plan.kind);
  const key = $derived(draftKey(plan.progressionId, kind));
  // 자유 운동 칸은 「이 단계 중단」·계획 세트 수 N 개념이 없다 — 토글과 미달 표시를 숨긴다.
  const isFree = $derived(kind === 'free');

  // drafts 맵 직결 — 세트가 쌓이면 자동으로 반영된다 (ADR-47).
  const draft: SessionDraft | undefined = $derived(inProgress.drafts[key]);

  // 오늘 자 칸만 입력에 열어 둔다. 날 넘긴 칸은 입력을 막는다 (PLAN §6).
  const todayDraft: SessionDraft | undefined = $derived(
    draft !== undefined && draft.startedAt === today ? draft : undefined,
  );
  const staleBlocked = $derived(draft !== undefined && draft.startedAt !== today);

  const abandoned = $derived(todayDraft?.abandoned === true);
  const workDone = $derived(todayDraft?.workSets.length ?? 0);
  const planLen = $derived(plan.work.length);

  // 다음 세트 안내. N 세트까지는 plan.work[i].target 을 쓰고, N 초과는 plan.work 의
  // 마지막 세트 모드·목표를 그대로 이어 쓴다 (사용자가 가늠해 입력하는 자리).
  // 자유 운동 칸(plan.work === [])은 직전 세트 값을 이어 쓰고, 처음이면 1 로 둔다.
  const extraMode: SetMode = $derived(planLen > 0 ? plan.work[planLen - 1].mode : 'fixed');
  const extraTarget: number = $derived(
    planLen > 0
      ? plan.work[planLen - 1].target
      : (todayDraft?.workSets[workDone - 1]?.value ?? 1),
  );
  const nextTarget: number = $derived(
    workDone < planLen ? plan.work[workDone].target : extraTarget,
  );
  const nextMode: SetMode = $derived(
    workDone < planLen ? plan.work[workDone].mode : extraMode,
  );

  // 중단 토글 확인 다이얼로그 상태.
  let showAbandonOnConfirm = $state(false);
  let showAbandonOffConfirm = $state(false);
  // 세트 삭제 확인 상태 (1-based index).
  let deleteRow = $state<number | null>(null);
  // 세트 편집 상태 (1-based index).
  let editingRow = $state<number | null>(null);

  function ensureOpen(): boolean {
    if (draft !== undefined && draft.startedAt === today) return true;
    if (staleBlocked) return false; // 날 넘긴 칸이 자리를 막는다.
    // 자유 운동 칸은 FreeExerciseForm 이 beginFree 로 미리 연다 — 여기서는 열지 않는다.
    if (isFree) return false;
    return inProgress.beginWork(today, plan);
  }

  function confirmReps(value: number) {
    if (!ensureOpen()) return;
    inProgress.pushSet(key, { value });
  }
  function confirmSeconds(seconds: number) {
    if (!ensureOpen()) return;
    inProgress.pushSet(key, { value: seconds });
  }

  function setLastRpe(rpe: number | undefined) {
    if (todayDraft === undefined) return;
    const idx = todayDraft.workSets.length - 1;
    if (idx < 0) return;
    const last = todayDraft.workSets[idx];
    const next: SetEntry = { ...last };
    if (rpe === undefined) delete next.rpe;
    else next.rpe = rpe;
    inProgress.updateSet(key, idx, next);
  }

  function toggleAbandon() {
    if (abandoned) showAbandonOffConfirm = true;
    else showAbandonOnConfirm = true;
  }

  function doAbandonOn() {
    showAbandonOnConfirm = false;
    if (!ensureOpen()) return;
    inProgress.markAbandoned(key, true);
    onAbandonMark?.(plan.progressionId, true);
  }

  function doAbandonOff() {
    showAbandonOffConfirm = false;
    if (todayDraft === undefined) return;
    inProgress.markAbandoned(key, false);
    onAbandonMark?.(plan.progressionId, false);
  }

  function startEdit(oneBasedIndex: number) {
    editingRow = oneBasedIndex;
  }
  function cancelEdit() {
    editingRow = null;
  }
  function saveEdit(oneBasedIndex: number, value: number) {
    if (todayDraft === undefined) return;
    const idx = oneBasedIndex - 1;
    const prev = todayDraft.workSets[idx];
    if (prev === undefined) return;
    inProgress.updateSet(key, idx, { ...prev, value });
    editingRow = null;
  }

  function askDelete(oneBasedIndex: number) {
    deleteRow = oneBasedIndex;
  }
  function doDelete() {
    if (deleteRow === null || todayDraft === undefined) return;
    const idx = deleteRow - 1;
    inProgress.removeSet(key, idx);
    deleteRow = null;
  }

  function unit(u: Unit): string { return unitLabel(u); }
</script>

<article
  class="card"
  data-progression={plan.progressionId}
  data-step={plan.step}
  data-kind={kind}
  data-active={todayDraft !== undefined}
  data-abandoned={abandoned}
  data-draft-blocked={staleBlocked ? 'true' : null}
>
  <!-- FR-21: 목표가 시선의 첫 지점이다. 종목명은 부제로 내린다. -->
  <header>
    <p class="eyebrow">{exerciseTitle(plan)} · {kindLabel(plan.kind)}</p>
    <h3 class="goal">
      {plan.goal.sets}×{plan.goal.value}{unit(plan.unit)}
      <span class="std">{standardLabel(plan.goal.label)}</span>
    </h3>
    {#if plan.streak !== undefined}
      <p class="streak">{plan.streak}/{PROMOTION_STREAK}회 연속</p>
    {/if}
  </header>

  <!-- FR-30 · UI-11: 목표 아래 자리. 접힌 채로 시작하고 DOM 에서 빠지지 않는다. -->
  <Howto {catalog} progressionId={plan.progressionId} performedStep={plan.performedStep} />

  {#if plan.sideNote !== undefined && plan.sideNote !== null}
    <p class="side-note">{plan.sideNote}</p>
  {/if}

  <p class="reason">{plan.reason}</p>

  {#if staleBlocked && draft !== undefined}
    <p class="stale" data-draft-blocked-reason>
      {draft.startedAt} 미완료 기록이 있습니다 — 먼저 기록하거나 버리세요
    </p>
  {/if}

  <section class="work" class:folded={abandoned}>
    <h4>본 세트 ({workDone}/{planLen})</h4>
    <ol class="sets">
      {#each todayDraft?.workSets ?? [] as entry, i (i)}
        {@const oneBased = i + 1}
        {@const isExtra = i >= planLen}
        {@const planned = i < planLen ? plan.work[i] : null}
        {@const shortfall = planned !== null && entry.value < planned.target}
        <li
          class="set-row"
          class:extra={isExtra}
          class:short={shortfall}
          data-set-row={oneBased}
          data-set-extra={isExtra ? 'true' : null}
          data-set-short={shortfall ? 'true' : null}
        >
          <span class="num">{oneBased}세트</span>
          {#if isExtra}
            <span class="extra-tag">추가 세트</span>
          {/if}
          {#if editingRow === oneBased}
            <RepsInput
              initial={entry.value}
              onConfirm={(v) => saveEdit(oneBased, v)}
              label="저장"
            />
            <button type="button" class="small" onclick={cancelEdit}>취소</button>
          {:else}
            <span class="value">
              {#if shortfall && planned !== null}
                {entry.value} / 목표 {planned.target}{unit(plan.unit)} · 미달
              {:else}
                {entry.value}{unit(plan.unit)}
              {/if}
              {#if entry.rpe !== undefined}
                <span class="rpe">(RPE {entry.rpe})</span>
              {/if}
            </span>
            <button
              type="button"
              class="small"
              data-set-edit
              onclick={() => startEdit(oneBased)}
            >편집</button>
            <button
              type="button"
              class="small danger"
              data-set-delete
              onclick={() => askDelete(oneBased)}
            >삭제</button>
          {/if}
        </li>
      {/each}
    </ol>

    <div class="input-row">
      <p class="hint">
        {#if workDone < planLen}
          다음 세트: {setTargetLabel(nextTarget, nextMode, plan.unit)}
        {:else}
          추가 세트: 자유 입력
        {/if}
      </p>
      {#if plan.unit === 'reps'}
        {#key workDone}
          <RepsInput initial={nextTarget} onConfirm={confirmReps} label="세트 확정" />
        {/key}
      {:else}
        {#key workDone}
          <TimerInput targetSec={nextTarget} onConfirm={confirmSeconds} />
        {/key}
      {/if}
      {#if workDone > 0 && todayDraft !== undefined}
        <div class="rpe-row">
          <RpeInput value={todayDraft.workSets[workDone - 1].rpe} onSelect={setLastRpe} />
        </div>
      {/if}
    </div>
  </section>

  <footer>
    {#if !isFree}
      <button
        type="button"
        class="abandon"
        data-abandon-mark={abandoned ? 'on' : 'off'}
        disabled={staleBlocked}
        onclick={toggleAbandon}
      >{abandoned ? '중단 취소' : '이 단계 중단'}</button>
    {/if}
  </footer>
</article>

{#if showAbandonOnConfirm}
  <Confirm
    title="이 단계를 중단으로 표시하시겠습니까?"
    body={
      plan.step > 1
        ? '지금까지 한 세트를 중단 기록으로 남기고, 가능하면 이전 단계 다지기를 제안합니다.'
        : '지금까지 한 세트를 중단 기록으로 남깁니다. 1단계라 다지기로 내려갈 단계가 없습니다.'
    }
    confirmLabel="중단으로 표시"
    onConfirm={doAbandonOn}
    onCancel={() => showAbandonOnConfirm = false}
  />
{/if}

{#if showAbandonOffConfirm}
  <Confirm
    title="중단 표시를 취소하시겠습니까?"
    body="중단 표시를 해제합니다. 이미 세트를 쌓았다면 그대로 남습니다."
    confirmLabel="중단 취소"
    onConfirm={doAbandonOff}
    onCancel={() => showAbandonOffConfirm = false}
  />
{/if}

{#if deleteRow !== null}
  <Confirm
    title="{deleteRow}세트를 삭제하시겠습니까?"
    body="확정한 세트 값과 RPE 가 사라집니다. 이 작업은 되돌릴 수 없습니다."
    confirmLabel="삭제"
    onConfirm={doDelete}
    onCancel={() => deleteRow = null}
  />
{/if}

<style>
  .card {
    border: 1px solid var(--border);
    background: var(--surface);
    padding: 1rem;
    border-radius: 8px;
    color: var(--fg);
  }
  header h3 { margin: 0 0 0.25rem; font-size: 1.15rem; }
  .eyebrow { margin: 0 0 0.15rem; color: var(--muted); font-size: 0.85rem; }
  /* 사용자가 지금 해야 할 것. 카드에서 가장 크고 진하다. */
  .goal {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 700;
    line-height: 1.15;
    color: var(--fg);
  }
  .goal .std { font-size: 0.9rem; font-weight: 500; color: var(--muted); margin-left: 0.35rem; }
  .streak { margin: 0.2rem 0 0.5rem; color: var(--muted); font-size: 0.9rem; }
  .side-note {
    background: var(--ok-bg);
    border: 1px solid var(--ok);
    color: var(--ok);
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    margin: 0.5rem 0;
    font-size: 0.9rem;
  }
  .reason { color: var(--muted); font-size: 0.85rem; margin: 0.5rem 0; }
  .stale {
    background: var(--danger-bg);
    border: 1px solid var(--danger);
    color: var(--fg);
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    margin: 0.5rem 0;
    font-size: 0.9rem;
  }
  section h4 { margin: 0.75rem 0 0.25rem; font-size: 0.95rem; color: var(--muted); }

  /* ADR-47 — 중단 표시 시 CSS 로 접는다. DOM 에서는 빠지지 않는다. */
  section.work.folded .sets,
  section.work.folded .input-row {
    display: none;
  }
  /* 스테일 칸 — 입력 영역을 잠근다 (CLAUDE.md 잠금 규칙). */
  .card[data-draft-blocked="true"] .input-row {
    opacity: 0.5;
    pointer-events: none;
    cursor: not-allowed;
  }

  .sets { margin: 0.25rem 0; padding-left: 0; list-style: none; }
  .set-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    line-height: 1.6;
    padding: 0.25rem 0;
  }
  .set-row .num { min-width: 3.5rem; color: var(--muted); font-size: 0.9rem; }
  .set-row .extra-tag {
    font-size: 0.75rem;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    border: 1px solid var(--border);
    color: var(--muted);
  }
  .set-row .value { color: var(--ok); font-size: 0.95rem; }
  .set-row.short .value { color: var(--danger); }
  .set-row .rpe { color: var(--muted); font-size: 0.85rem; margin-left: 0.25rem; }
  .set-row .small {
    min-height: 44px;
    min-width: 44px;
    padding: 0.4rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
    color: var(--fg);
    cursor: pointer;
    font-size: 0.85rem;
  }
  .set-row .small.danger {
    border-color: var(--danger);
    color: var(--danger);
  }

  .input-row { margin-top: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .hint { color: var(--muted); font-size: 0.85rem; margin: 0; }
  .rpe-row { margin-top: 0.25rem; }

  footer { margin-top: 0.75rem; }
  .abandon {
    min-height: 44px;
    padding: 0.75rem 1rem;
    background: var(--danger-bg);
    color: var(--fg);
    border: 1px solid var(--danger);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .abandon[data-abandon-mark="on"] {
    background: var(--surface);
    border-color: var(--border);
    color: var(--muted);
  }
  .abandon[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>

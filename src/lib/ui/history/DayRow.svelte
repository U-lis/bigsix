<script lang="ts">
  /**
   * 날짜 한 줄 (FR-24.2~6).
   *
   * 도메인 문자열은 가공 없이 노출한다 (NFR-2). 색은 `app.css` 토큰만 쓴다.
   * 상태는 색이 아니라 문구가 함께 서서 알린다 (UI-5).
   */
  import type {
    Catalog, ProgressionId, SessionRecord, StandardLabel,
  } from '$lib/domain/types';
  import { getProgram, getProgression, getStep } from '$lib/domain';
  import type { DayRow } from './dayList';

  interface Props {
    row: DayRow;
    catalog: Catalog;
  }
  let { row, catalog }: Props = $props();

  function statusLabel(status: DayRow['review']['status']): string {
    switch (status) {
      case 'done': return '수행';
      case 'partial': return '일부';
      case 'missed': return '미수행';
      case 'rest': return '휴식';
    }
  }

  function programKo(id: string): string {
    return getProgram(catalog, id).name.ko;
  }

  function progKo(id: ProgressionId): string {
    return getProgression(catalog, id).name.ko;
  }

  function stepKo(id: ProgressionId, n: number): string {
    return getStep(catalog, id, n).name.ko;
  }

  function unitKo(id: ProgressionId, n: number): string {
    return getStep(catalog, id, n).unit === 'seconds' ? '초' : '회';
  }

  function standardKo(label: StandardLabel): string {
    switch (label) {
      case 'beginner': return '초보자';
      case 'intermediate': return '중급자';
      case 'progression': return '상급자';
      case 'elite': return '최상급자';
    }
  }

  function performedStepOf(r: SessionRecord): number {
    return r.performedStep ?? r.step;
  }

  /** "8회 · 8회" 처럼 세트값을 · 으로 잇는다. */
  function setsLabel(r: SessionRecord): string {
    if (r.sets.length === 0) return '';
    const u = unitKo(r.progressionId, performedStepOf(r));
    return r.sets.map((v) => `${v}${u}`).join(' · ');
  }

  function targetLabel(r: SessionRecord): string {
    if (!r.target) return '';
    const g = r.target.goal;
    return `목표: ${standardKo(g.label)} ${g.sets}세트 × ${g.value}`;
  }

  function kindLabel(r: SessionRecord): string {
    if (r.kind === 'consolidation') return '다지기';
    if (r.kind === 'free') return '자유 운동';
    return '';
  }

  function outcomeLabel(r: SessionRecord): string {
    return r.outcome === 'abandoned' ? '중단' : '';
  }

  function promotionLabel(r: SessionRecord): string {
    if (r.promotedTo === undefined) return '';
    return `${r.promotedTo}단계로 승급`;
  }

  function blockedLabel(r: SessionRecord): string {
    if (r.blockedBy === 'rpe') return 'RPE 보류';
    if (r.blockedBy === 'master') return '최상단';
    return '';
  }
</script>

<article
  class="day"
  data-day-row={row.review.date}
  data-day-status={row.review.status}
>
  <header class="head">
    <span class="date">{row.review.date} <span class="weekday">({row.weekday})</span></span>
    {#if row.review.programId}
      <span class="program">{programKo(row.review.programId)} · {row.review.dayNumber}일차</span>
    {/if}
    <span class="status" data-day-status-label={row.review.status}>{statusLabel(row.review.status)}</span>
  </header>

  {#if row.stintStartedOn}
    <p class="note" data-day-note="stint-started">
      새 루틴 시작: {programKo(row.stintStartedOn.programId)}
    </p>
  {/if}
  {#if row.proposalAcceptedOn}
    <p class="note" data-day-note="proposal-accepted">
      루틴 갈아탐: {programKo(row.proposalAcceptedOn.fromProgramId)} → {programKo(row.proposalAcceptedOn.toProgramId)}
    </p>
  {/if}

  {#if row.review.status === 'missed'}
    <!--
      미수행일: 계획됐던 종목명만 노출. 목표 수치는 노출하지 않는다 (FR-24.6) —
      plannedExercises 는 「조회 시점의 재계산 값」이라 과거 목표가 아니다.
    -->
    <p class="planned" data-day-planned>
      계획됐던 종목: {row.review.planned.map(progKo).join(', ')}
    </p>
  {/if}

  {#if row.review.performed.length > 0}
    <ul class="sessions">
      {#each row.review.performed as r, i (i)}
        <li data-day-session="id:{i}">
          <div class="s-head">
            <span class="s-name">{progKo(r.progressionId)}</span>
            <span class="s-step">{performedStepOf(r)}단계 · {stepKo(r.progressionId, performedStepOf(r))}</span>
            {#if kindLabel(r)}<span class="tag" data-tag="kind">{kindLabel(r)}</span>{/if}
            {#if outcomeLabel(r)}<span class="tag" data-tag="outcome">{outcomeLabel(r)}</span>{/if}
          </div>
          {#if setsLabel(r)}
            <p class="s-line" data-day-sets>{setsLabel(r)}</p>
          {/if}
          {#if targetLabel(r)}
            <p class="s-line s-target" data-day-target>{targetLabel(r)}</p>
          {/if}
          <p class="s-line s-meta">
            {#if r.rpe !== undefined}<span data-day-rpe>RPE {r.rpe}</span>{/if}
            {#if promotionLabel(r)}<span class="promo" data-day-promoted>{promotionLabel(r)}</span>{/if}
            {#if blockedLabel(r)}<span class="blocked" data-day-blocked>{blockedLabel(r)}</span>{/if}
          </p>
        </li>
      {/each}
    </ul>
  {/if}
</article>

<style>
  .day {
    padding: 0.75rem 0.75rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }
  .day + :global(.day) {
    margin-top: 0.5rem;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: baseline;
    font-size: 0.85rem;
  }
  .date {
    font-family: var(--mono);
    font-weight: 600;
    color: var(--fg);
  }
  .weekday {
    color: var(--muted);
    font-weight: 400;
  }
  .program {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .status {
    margin-left: auto;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--muted);
    background: var(--bg);
    border: 1px solid var(--border);
  }
  /* 색만으로 알리지 않는다 — 문구(수행/일부/미수행/휴식)가 함께 서 있다. */
  .day[data-day-status='done'] .status {
    color: var(--ok);
    background: var(--ok-bg);
    border-color: var(--ok-bg);
  }
  .day[data-day-status='partial'] .status {
    color: var(--accent);
    background: var(--bg);
    border-color: var(--accent);
  }
  .day[data-day-status='missed'] .status {
    color: var(--danger);
    background: var(--danger-bg);
    border-color: var(--danger-bg);
  }
  .day[data-day-status='rest'] .status {
    color: var(--muted);
    background: var(--bg);
    border-color: var(--border);
  }

  .note {
    margin: 0.35rem 0 0;
    font-size: 0.78rem;
    color: var(--interchange);
  }
  .planned {
    margin: 0.35rem 0 0;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .sessions {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0;
  }
  .sessions li + li {
    margin-top: 0.4rem;
    padding-top: 0.4rem;
    border-top: 1px dashed var(--border);
  }
  .s-head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: baseline;
    font-size: 0.85rem;
  }
  .s-name {
    font-weight: 600;
    color: var(--fg);
  }
  .s-step {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .tag {
    padding: 0.05rem 0.4rem;
    border-radius: 4px;
    font-size: 0.7rem;
    color: var(--muted);
    background: var(--bg);
    border: 1px solid var(--border);
  }
  .s-line {
    margin: 0.2rem 0 0;
    font-size: 0.8rem;
    color: var(--fg);
    font-variant-numeric: tabular-nums;
  }
  .s-target {
    color: var(--muted);
  }
  .s-meta {
    color: var(--muted);
    font-size: 0.75rem;
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .s-meta:empty {
    display: none;
  }
  .promo {
    color: var(--ok);
    font-weight: 600;
  }
  .blocked {
    color: var(--insert);
  }
</style>

<script lang="ts">
  /**
   * 날 넘긴 진행 중 칸 안내 배너 (SPEC5 Phase 5 · ADR-48 · FR-44).
   *
   * `staleDrafts(inProgress.drafts, today)` 가 돌려주는 날짜별 묶음을 보이고,
   * 날짜마다 두 동작을 제공한다:
   *   - 「그 날짜로 기록」(`data-stale-record`) — `inProgress.finish` 를
   *     `scope = { kind: 'date', date }` 로 호출해 그 날짜의 칸만 한꺼번에
   *     기록한다 (FR-44.2). 결과(승급·보류·실패)는 사실만 노출한다 (NFR-2).
   *   - 「버리기」(`data-stale-discard`) — 2단 확인 후 그 날짜의 draft 를 전부
   *     지운다 (FR-44.3). 접기는 CSS 로 한다 ({#if} 로 DOM 에서 빼지 않는다).
   *
   * `data-stale-drafts` 는 날짜별 블록의 식별자로 쓴다 — 값은 `YYYY-MM-DD`.
   *
   * 「그 날짜로 기록」의 agenda 순서는 그 날짜의 운동 계획(`planOn(state, catalog,
   * date).exercises`) 을 쓴다 — 그 날짜의 agenda 가 비어 있으면 draft 삽입 순서로
   * 대체한다. 플래너는 agenda 에 없는 종목도 뒤에 안정 순서로 붙이므로 자유 운동
   * 칸이 섞여 있어도 안전하다 (planFinish 참고).
   *
   * 도메인 문자열은 가공 없이 그대로 노출한다 (NFR-2). 시스템 시각은 호출자가
   * `todayClock.nowIsoLocal()` 로 주입한다 — 이 파일 안에서 new Date() 를 부르지
   * 않는다 (FR-4.4).
   */
  import type { AppState, Catalog, IsoDate, ProgressionId, SessionRecord }
    from '$lib/domain/types';
  import { planOn } from '$lib/domain';
  import { inProgress } from './session.svelte';
  import { staleDrafts } from './stale';
  import { draftKey } from '$lib/ui/state/storage';
  import { progressionName } from './labels';
  import type { FinishResult } from './finish';

  interface Props {
    today: IsoDate;
    /** 현재 AppState — `state` 라는 이름은 `$state` 룬과 충돌해 피한다. */
    appStateValue: AppState;
    catalog: Catalog;
    /** 호출 시점의 로컬 ISO 시각을 돌려주는 getter (FR-4.4 / ADR-24). */
    nowIsoLocal: () => string;
    /** 성공 결과를 상위 appState 에 반영하는 콜백. */
    onApply: (next: AppState) => void;
  }
  let { today, appStateValue, catalog, nowIsoLocal, onApply }: Props = $props();

  // 날짜별 묶음. `inProgress.drafts` 가 바뀌면 자동으로 갱신된다 (R-3).
  let groups = $derived(staleDrafts(inProgress.drafts, today));
  let dates = $derived(Object.keys(groups).sort());

  // 각 날짜별 2단 확인 상태. 날짜가 사라지면 그 날짜의 상태도 함께 지워진다 —
  // 그러나 Svelte 반응성 유지를 위해 단순 객체로 들고 다닌다. `{#if}` 로 DOM 에서
  // 빼지 않고 CSS 로 접는다 (CLAUDE.md 접기 규칙).
  let confirming: Record<string, boolean> = $state({});

  // 날짜별 마지막 기록 결과. 승급·보류·실패를 사실만 노출한다.
  let results: Record<string, FinishResult | null> = $state({});

  function toggleConfirm(date: string): void {
    confirming = { ...confirming, [date]: !(confirming[date] === true) };
  }

  function cancelConfirm(date: string): void {
    if (confirming[date] === true) {
      confirming = { ...confirming, [date]: false };
    }
  }

  function doDiscard(date: string): void {
    const bucket = groups[date];
    if (bucket === undefined) return;
    for (const d of bucket) {
      inProgress.discardDraft(draftKey(d.progressionId, d.kind));
    }
    confirming = { ...confirming, [date]: false };
    // 결과 영역도 정리.
    if (date in results) {
      const next = { ...results };
      delete next[date];
      results = next;
    }
  }

  function recordAt(date: string): void {
    const bucket = groups[date];
    if (bucket === undefined) return;
    // 그 날짜의 계획을 agenda 순서의 근원으로 쓴다 — plan 이 없으면 draft 순서.
    const agenda = planOn(appStateValue, catalog, date);
    const order: ProgressionId[] = [];
    if (agenda.kind === 'plan') {
      for (const ex of agenda.exercises) {
        order.push(ex.progressionId);
        if (ex.paired !== undefined) order.push(ex.paired.progressionId);
      }
    }
    // draft 에서 agenda 에 없는 종목을 뒤에 안정 순서로 붙인다 — 플래너가 다시
    // 안정화하지만 명시적으로 둔다.
    for (const d of bucket) {
      if (!order.includes(d.progressionId)) order.push(d.progressionId);
    }
    const result = inProgress.finish(
      appStateValue, catalog, nowIsoLocal(), { kind: 'date', date }, order,
    );
    onApply(result.nextState);
    results = { ...results, [date]: result };
    confirming = { ...confirming, [date]: false };
  }

  function latestRecords(r: FinishResult): SessionRecord[] {
    const n = r.perDraft.filter((p) => p.ok).length;
    if (n === 0) return [];
    return r.nextState.history.slice(-n);
  }

  function failures(r: FinishResult) {
    return r.perDraft.filter((p) => !p.ok);
  }

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

{#if dates.length > 0}
  <div class="banner" data-stale-banner>
    {#each dates as date (date)}
      {@const result = results[date] ?? null}
      <section
        class="group"
        class:confirming={confirming[date] === true}
        data-stale-drafts={date}
      >
        <p class="msg">
          <strong>{date}</strong> 미완료 기록이 있습니다 — 그 날짜로 기록 / 버리기
        </p>
        <ul class="list">
          {#each groups[date] as d (draftKey(d.progressionId, d.kind))}
            <li>{progressionName(catalog, d.progressionId)} · {d.workSets.length}세트</li>
          {/each}
        </ul>
        <div class="row">
          <button
            type="button"
            class="record"
            data-stale-record
            onclick={() => recordAt(date)}
          >그 날짜로 기록</button>
          <!-- 2단 확인: 1단은 「버리기」, 2단은 「정말 버립니다 (취소)」. CSS 로 접는다. -->
          <button
            type="button"
            class="discard step-1"
            data-stale-discard
            onclick={() => toggleConfirm(date)}
          >버리기</button>
          <button
            type="button"
            class="discard-confirm step-2"
            data-stale-discard-confirm
            onclick={() => doDiscard(date)}
          >정말 버립니다</button>
          <button
            type="button"
            class="discard-cancel step-2"
            data-stale-discard-cancel
            onclick={() => cancelConfirm(date)}
          >취소</button>
        </div>

        {#if result !== null}
          <div class="result" data-stale-result={date}>
            <p class="result-head">기록 결과</p>
            {#each latestRecords(result) as r (r.progressionId + ':' + r.step + ':' + r.date)}
              <p class="row-line ok">{recordLine(r)}</p>
            {/each}
            {#each failures(result) as f (f.draftKey)}
              <p class="row-line fail" data-stale-fail={f.draftKey}>
                {f.draftKey}: 기록 실패{f.reason !== undefined ? ` — ${f.reason}` : ''}
              </p>
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  </div>
{/if}

<style>
  .banner {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .group {
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg);
    padding: 1rem;
    border-radius: 8px;
  }
  .msg { margin: 0 0 0.5rem; font-size: 0.95rem; }
  .list {
    margin: 0 0 0.75rem;
    padding-left: 1.1rem;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .list li { line-height: 1.6; }
  .row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  button {
    min-height: 44px;
    min-width: 44px;
    padding: 0.75rem 1.25rem;
    background: transparent;
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
    font-family: var(--sans);
  }
  button.record {
    border-color: var(--accent);
    color: var(--accent);
  }
  button.discard-confirm {
    background: var(--danger-bg);
    border-color: var(--danger);
    color: var(--fg);
  }

  /* 2단 확인: 기본은 step-1 만 보이고, confirming 상태에서 step-2 가 보인다.
     CSS 로 자리를 지키며 접는다 ({#if} 로 DOM 에서 빼지 않는다 — CLAUDE.md). */
  .step-2 {
    display: none;
  }
  .confirming .step-1 {
    display: none;
  }
  .confirming .step-2 {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .result {
    margin-top: 0.75rem;
    padding: 0.75rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .result-head {
    margin: 0 0 0.4rem;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .row-line { margin: 0.2rem 0; font-size: 0.9rem; }
  .row-line.ok { color: var(--fg); }
  .row-line.fail { color: var(--danger); }
</style>

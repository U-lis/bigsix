<script lang="ts">
  /**
   * 기록 탭 (FR-23, FR-24, FR-25).
   *
   * 세로 순서 (UI-1): <h1>기록</h1> → SegToggle(날짜별/종목별) → 본문
   *   → 「이전 30일 더 보기」(날짜별에서만) → (Phase 6 의 ExportBar 자리 예약).
   *
   * booted 이전에도 자리를 예약한다 (UI-6) — 목록은 localStorage 에서 오는
   * 데이터라 프리렌더 시점과 부팅 후가 다르다.
   */
  import type { AppState, Catalog, IsoDate } from '$lib/domain/types';
  import { historyRange, windowsBack, type DateWindow } from './range';
  import { buildDayRows } from './dayList';
  import DayList from './DayList.svelte';
  import ProgressionTable from './ProgressionTable.svelte';
  import ExportBar from './ExportBar.svelte';
  import SegToggle from '$lib/ui/common/SegToggle.svelte';

  interface Props {
    appState: AppState;
    catalog: Catalog;
    today: IsoDate;
    /** 부팅 완료 여부. false 여도 자리는 예약된다 (UI-6). */
    booted: boolean;
  }
  let { appState, catalog, today, booted }: Props = $props();

  type View = 'day' | 'progression';
  let view: View = $state('day');

  let range = $derived(historyRange(appState, today));
  let allWindows: DateWindow[] = $derived(range === null ? [] : windowsBack(range, 30));

  // 처음에는 첫 창(최신 30일)만 보여준다. 사용자가 「더 보기」 를 누를 때마다 하나씩 늘어난다.
  let shown = $state(1);
  // 상태가 완전히 바뀌어 창 개수가 줄면 shown 을 재조정한다 (import 로 상태가 크게 바뀌는 등).
  $effect(() => {
    if (shown > allWindows.length && allWindows.length > 0) shown = allWindows.length;
    if (allWindows.length === 0) shown = 1;
  });

  let visibleWindows = $derived(allWindows.slice(0, shown));
  let visibleRows = $derived(
    visibleWindows.flatMap((w) => buildDayRows(appState, catalog, w)),
  );
  let hasMore = $derived(shown < allWindows.length);

  function showMore() {
    if (hasMore) shown += 1;
  }
</script>

<section data-history-view={view}>
  <h1>기록</h1>

  <div class="toggle" data-history-toggle>
    <SegToggle
      name="history-view"
      bind:value={view}
      options={[
        { value: 'day', label: '날짜별', hint: '오늘부터 과거로 하루씩', title: '날짜별 목록' },
        { value: 'progression', label: '종목별', hint: '종목 하나의 진행 추이', title: '종목별 추이' },
      ]}
    />
  </div>

  <div class="body">
    {#if view === 'day'}
      {#if !booted}
        <!-- 부팅 이전 자리 예약 (UI-6). 문구도 색이 아니라 글자로 알린다. -->
        <p class="hint" data-history-loading>불러오는 중…</p>
      {:else if range === null}
        <p class="empty" data-history-empty>아직 기록이 없습니다.</p>
      {:else}
        <DayList rows={visibleRows} {catalog} />
        {#if hasMore}
          <button
            type="button"
            class="more"
            data-day-more
            onclick={showMore}
          >
            이전 30일 더 보기
          </button>
        {/if}
      {/if}
    {:else if !booted}
      <!-- 부팅 이전 자리 예약. 종목별도 상태에서 오는 데이터라 부팅 전엔 비어 있다. -->
      <p class="hint" data-history-loading>불러오는 중…</p>
    {:else if range === null}
      <p class="empty" data-history-empty>아직 기록이 없습니다.</p>
    {:else}
      <ProgressionTable {appState} {catalog} />
    {/if}
  </div>

  <!-- 내보내기 바 (FR-26). UI-1 순서상 화면 최하단. -->
  <ExportBar {appState} {catalog} {today} />
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  h1 {
    margin: 0;
    /* 화면 이름 하나만 <h1> — 날짜·종목명은 여기에 넣지 않는다 (UI-2). */
  }
  .body {
    min-height: 20rem;
  }
  .empty {
    color: var(--muted);
    margin: 1rem 0;
  }
  .hint {
    color: var(--muted);
    margin: 1rem 0;
  }
  .more {
    display: block;
    width: 100%;
    min-height: 44px; /* 터치 타깃 (UI-8) */
    margin-top: 0.75rem;
    padding: 0.5rem;
    font-family: var(--sans);
    font-size: 0.9rem;
    color: var(--fg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    touch-action: manipulation;
  }
  .more:hover {
    background: var(--bg);
  }
</style>

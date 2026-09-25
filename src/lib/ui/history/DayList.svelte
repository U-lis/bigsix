<script lang="ts">
  /**
   * 날짜별 목록 (FR-24). 창(30일) 여러 개를 이어 그린다.
   * DayRow 는 이 목록 안에서 최근 날짜부터 세로로 쌓인다 (UI-1).
   */
  import type { Catalog } from '$lib/domain/types';
  import type { DayRow as DayRowT } from './dayList';
  import DayRow from './DayRow.svelte';

  interface Props {
    rows: DayRowT[];
    catalog: Catalog;
  }
  let { rows, catalog }: Props = $props();
</script>

<div class="list" data-history-view="day">
  {#each rows as row (row.review.date)}
    <DayRow {row} {catalog} />
  {/each}
</div>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    /*
     * 부팅 이전에도 자리를 예약한다 (UI-6). 일부러 최소 높이를 준다 —
     * DayRow 4~5줄 정도가 들어갈 자리. rows 가 비어 있을 때에도 스크롤이
     * 튀지 않는다.
     */
    min-height: 20rem;
  }
</style>

<script module lang="ts">
  /**
   * 화면 4 — 기록 (FR-23, FR-24). Phase 4 에서 뼈대와 날짜별 목록을 채웠다.
   *
   * 계산은 순수 함수(`ui/history/range.ts`, `ui/history/dayList.ts`)가 하고
   * 이 페이지는 스토어를 읽어 `HistoryView` 에 넘길 뿐이다 — Constraints 「코드 배치」 준수.
   */
  export const prerender = true;
</script>

<script lang="ts">
  import { appState } from '$lib/ui/state/state.svelte';
  import { todayClock } from '$lib/ui/state/today.svelte';
  import { loadCatalog } from '$lib/data/catalog';
  import HistoryView from '$lib/ui/history/HistoryView.svelte';
  import { onMount } from 'svelte';

  const catalog = loadCatalog();
  // `todayClock.today` 는 boot 전에도 프리렌더용 기본값(에폭 0 하루)이 있다.
  // 실제 부팅 완료 여부는 storageStatus 로 판별한다 — appState.storageStatus 는
  // boot 이 initFromBoot 을 부른 뒤에만 'empty' 이외의 값을 가진다.
  let booted = $state(false);
  onMount(() => { booted = true; });
</script>

<HistoryView
  appState={appState.value}
  {catalog}
  today={todayClock.today}
  {booted}
/>

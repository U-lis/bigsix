<script lang="ts">
  /**
   * 내보내기 바 (FR-26 · UI-1 · UI-6).
   *
   * 두 버튼(「JSON 내보내기」·「CSV 내보내기」) 이 실제 파일을 만든다. 파일명은
   * `bigsix-YYYY-MM-DD.{json|csv}` — `today` prop 을 그대로 쓴다. `new Date()` 를
   * 직접 부르지 않는다 (ADR-24 · FR-4.4).
   *
   * `data-export-status` 는 `saveFile` 의 반환값을 그대로 노출한다
   * (`'downloaded'`·`'shared'`·`'unavailable'`). `'unavailable'` 일 때만 문구를
   * 함께 표시한다 (EC-61).
   *
   * 아이콘은 상단 바 스타일(24×24 · `stroke="currentColor"`)에 맞춘 커스텀 SVG.
   * 별도 라이브러리를 쓰지 않아 CC BY 4.0 표기 의무가 없다 — 「직접 그리기」 경로
   * (GLOBAL 「아이콘」 3항).
   *
   * 상태를 바꾸지 않는다 (FR-26.6) — 읽기만 하고 파일을 낸다.
   */
  import type { AppState, Catalog, IsoDate } from '$lib/domain/types';
  import { todayClock } from '$lib/ui/state/today.svelte';
  import { CURRENT_SCHEMA_VERSION } from '$lib/ui/state/storage';
  import { buildExportJson, type ExportMeta } from './exportJson';
  import { buildExportCsv } from './exportCsv';
  import { saveFile, type SaveResult } from './download.svelte';

  interface Props {
    appState: AppState;
    catalog: Catalog;
    today: IsoDate;
  }
  let { appState, catalog, today }: Props = $props();

  // 마지막 저장 결과. `null` 이면 아직 시도한 적 없다.
  let status: SaveResult | null = $state(null);
  // 「내려받기·공유가 모두 안 됩니다」 문구 노출 조건 (EC-61).
  let unavailable = $derived(status === 'unavailable');

  function buildMeta(): ExportMeta {
    return {
      app: 'bigsix',
      version: __APP_VERSION__,
      commit: __COMMIT_HASH__,
      exportedAt: todayClock.nowIsoLocal(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };
  }

  async function onJsonClick() {
    const file = buildExportJson({ state: appState, catalog, meta: buildMeta() });
    const content = JSON.stringify(file, null, 2);
    status = await saveFile({
      name: `bigsix-${today}.json`,
      mime: 'application/json',
      content,
    });
  }

  async function onCsvClick() {
    const content = buildExportCsv(appState, catalog);
    status = await saveFile({
      name: `bigsix-${today}.csv`,
      mime: 'text/csv;charset=utf-8',
      content,
    });
  }
</script>

<div class="bar" data-export-bar>
  <button
    type="button"
    class="export"
    data-export-json
    onclick={onJsonClick}
  >
    <!-- 파일 + 아래 화살표. JSON 을 뜻하는 확장자는 라벨이 맡는다. -->
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <path d="M14 3v6h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
      <path d="M12 12v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M9 15l3 3 3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span class="btn-label">JSON 내보내기</span>
  </button>

  <button
    type="button"
    class="export"
    data-export-csv
    onclick={onCsvClick}
  >
    <!-- 파일 + 격자(스프레드시트). -->
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <path d="M14 3v6h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
      <path d="M7 13h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M7 17h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M11 13v4" stroke="currentColor" stroke-width="2" />
    </svg>
    <span class="btn-label">CSV 내보내기</span>
  </button>

  {#if status !== null}
    <p class="status" data-export-status={status}>
      {#if unavailable}
        내려받기 · 공유가 모두 안 됩니다.
      {:else if status === 'shared'}
        공유창으로 넘겼습니다.
      {:else}
        내려받았습니다.
      {/if}
    </p>
  {/if}
</div>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  button.export {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 44px; /* 터치 타깃 (UI-8) */
    padding: 0.5rem 0.9rem;
    font-family: var(--sans);
    font-size: 0.9rem;
    color: var(--fg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    touch-action: manipulation;
  }
  button.export:hover {
    background: var(--bg);
  }
  .btn-label {
    /* 아이콘만 있는 버튼은 만들지 않는다 — 라벨 항상 노출 (CLAUDE.md · GLOBAL 아이콘). */
    font-weight: 500;
  }
  .status {
    width: 100%;
    margin: 0.25rem 0 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
</style>

<script lang="ts">
  /**
   * 「오늘 운동 마치기」 확인 다이얼로그 (SPEC5 FR-42.3 · UI-19 · ADR-46).
   *
   * 그룹별 요약을 보여 주고 「기록」 / 「취소」 를 받는다. 요약 문구는 사실만
   * 담는다 — 백분율·격려·판정 금지 (NFR-2 / R-4). `summarizeDraft` 가 조립한
   * 「{종목} {단계} · {단계명}: {사실}」 문자열을 그대로 노출한다.
   *
   * data-finish-dialog · data-finish-row(값 = draftKey) 훅은 테스트와 CSS 공용 신호.
   */
  import type { Catalog } from '$lib/domain/types';
  import type { FinishPlan } from './finish';
  import { summarizeDraft } from './summarizeDraft';
  import type { SessionDraft } from '$lib/ui/state/storage';

  interface Props {
    catalog: Catalog;
    plan: FinishPlan;
    drafts: Record<string, SessionDraft>;
    onConfirm: () => void;
    onCancel: () => void;
  }
  let { catalog, plan, drafts, onConfirm, onCancel }: Props = $props();

  // 각 그룹의 (key, label) 쌍. 삭제된 칸이 있으면 그룹을 건너뛴다 — 실제론 plan 이
  // 당장 만든 결과를 받으므로 drafts 와 일치한다 (호출자 책임).
  let rows = $derived(
    plan.groups
      .map((g) => {
        const d = drafts[g.draftKey];
        if (d === undefined) return null;
        return { key: g.draftKey, label: summarizeDraft(catalog, d, g) };
      })
      .filter((r): r is { key: string; label: string } => r !== null),
  );
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="backdrop"
  data-finish-dialog
  role="dialog"
  aria-modal="true"
  aria-labelledby="finish-title"
  onclick={onCancel}
  onkeydown={(e) => e.key === 'Escape' && onCancel()}
  tabindex="-1"
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="dialog" role="document" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
    <h2 id="finish-title">오늘 운동 마치기</h2>
    {#if rows.length === 0}
      <p class="empty">기록할 칸이 없습니다.</p>
    {:else}
      <ul class="rows">
        {#each rows as r (r.key)}
          <li class="row" data-finish-row={r.key}>{r.label}</li>
        {/each}
      </ul>
    {/if}
    <div class="actions">
      <button type="button" data-finish-cancel onclick={onCancel}>취소</button>
      <button
        type="button"
        class="confirm"
        data-finish-confirm
        disabled={rows.length === 0}
        onclick={onConfirm}
      >기록</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }
  .dialog {
    background: var(--surface);
    color: var(--fg);
    padding: 1.25rem;
    border-radius: 10px;
    max-width: 480px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    border: 1px solid var(--border);
  }
  h2 { margin: 0 0 0.75rem; font-size: 1.15rem; }
  .rows { margin: 0.5rem 0 1rem; padding-left: 1.1rem; }
  .row { line-height: 1.6; }
  .empty { color: var(--muted); margin: 0 0 1rem; font-size: 0.95rem; }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  .actions button {
    min-height: 44px;
    min-width: 44px;
    padding: 0.75rem 1.25rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
    color: var(--fg);
    cursor: pointer;
    font-size: 1rem;
  }
  .actions button.confirm {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg);
  }
  .actions button.confirm[disabled] {
    background: transparent;
    border-color: var(--border);
    color: var(--muted);
    cursor: not-allowed;
    opacity: 0.6;
  }
</style>

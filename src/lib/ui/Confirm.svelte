<script lang="ts">
  /**
   * 확인 다이얼로그 (NFR-10) — 불가능 · 프로그램 전환 · 초기 상태 · 단계 조정에 재사용.
   */
  interface Props {
    title: string;
    body?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
  }
  let { title, body, confirmLabel = '확정', cancelLabel = '취소', onConfirm, onCancel }: Props = $props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onclick={onCancel} onkeydown={(e) => e.key === 'Escape' && onCancel()} tabindex="-1">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="dialog" role="document" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
    <h2 id="confirm-title">{title}</h2>
    {#if body !== undefined}<p>{body}</p>{/if}
    <div class="row">
      <button type="button" onclick={onCancel}>{cancelLabel}</button>
      <button type="button" class="confirm" onclick={onConfirm}>{confirmLabel}</button>
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
    border: 1px solid var(--border);
  }
  h2 { margin: 0 0 0.5rem; font-size: 1.1rem; }
  p { margin: 0 0 1rem; color: var(--muted); font-size: 0.95rem; }
  .row { display: flex; gap: 0.5rem; justify-content: flex-end; }
  button {
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
  button.confirm { background: var(--danger-bg); border-color: var(--danger); color: var(--fg); }
</style>

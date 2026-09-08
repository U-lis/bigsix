<script lang="ts">
  /**
   * 횟수(reps) 입력. FR-6.2 / FR-6.2a / FR-6.2b.
   * - <input type="number" inputmode="numeric"> — 숫자 키패드.
   * - 초기값 = 그 세트의 목표 수치.
   * - 음수·비정수 거부, 상한 없음 (max 는 하한이라 초과 수행이 승급 근거).
   */
  interface Props {
    initial: number;
    /** 확정 콜백 — value 는 정수, > 0. */
    onConfirm: (value: number) => void;
    label?: string;
  }
  let { initial, onConfirm, label = '확정' }: Props = $props();
  // 초기값은 그 세트의 목표 수치다 (FR-6.2a). 이후 사용자가 자유롭게 편집한다.
  // 세트가 바뀌면 {#key workDone} 로 이 컴포넌트가 remount 돼서 initial 이 다시 반영된다.
  // svelte-ignore state_referenced_locally
  let value = $state(String(initial));
  let error = $state<string | null>(null);

  function submit() {
    const n = Number(value);
    if (!Number.isFinite(n)) { error = '숫자를 입력한다'; return; }
    if (!Number.isInteger(n)) { error = '정수만 입력한다'; return; }
    if (n < 1) { error = '1 이상만 입력한다'; return; }
    error = null;
    onConfirm(n);
  }
</script>

<div class="reps-input">
  <input
    type="number"
    inputmode="numeric"
    step="1"
    min="1"
    bind:value
    aria-label="세트 수치"
  />
  <button type="button" onclick={submit}>{label}</button>
  {#if error !== null}
    <p class="error" role="alert">{error}</p>
  {/if}
</div>

<style>
  .reps-input { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  input {
    font-size: 1.25rem;
    padding: 0.75rem;
    min-width: 6rem;
    min-height: 44px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
  }
  button {
    min-height: 44px;
    min-width: 44px;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
    color: var(--fg);
    cursor: pointer;
  }
  .error { color: var(--danger); margin: 0.25rem 0 0; font-size: 0.85rem; width: 100%; }
</style>

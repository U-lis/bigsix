<script lang="ts">
  /**
   * 세트별 RPE 선택 입력 (FR-6.7).
   * - 선택 입력. 한 세트도 입력하지 않고 세션을 마칠 수 있다.
   * - 1~10 정수. 격려 문구 없이 숫자만 표시.
   */
  interface Props {
    value: number | undefined;
    onSelect: (rpe: number | undefined) => void;
  }
  let { value, onSelect }: Props = $props();
</script>

<div class="rpe">
  <span class="label">RPE</span>
  {#each [1,2,3,4,5,6,7,8,9,10] as n (n)}
    <button
      type="button"
      class:selected={value === n}
      onclick={() => onSelect(value === n ? undefined : n)}
    >{n}</button>
  {/each}
</div>

<style>
  .rpe {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    align-items: center;
  }
  .label { font-size: 0.85rem; color: #ccc; margin-right: 0.25rem; }
  button {
    min-width: 44px;
    min-height: 44px;
    padding: 0.5rem;
    border: 1px solid #444;
    border-radius: 6px;
    background: #222;
    color: #ccc;
    cursor: pointer;
    font-size: 0.9rem;
  }
  button.selected { background: #446; color: #fff; border-color: #88a; }
</style>

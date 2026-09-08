<script lang="ts">
  /**
   * 세트별 RPE 선택 입력 (FR-6.7).
   * - 선택 입력. 한 세트도 입력하지 않고 세션을 마칠 수 있다.
   * - 1~10 정수. 격려 문구 없이 숫자만 표시.
   *
   * ChipGroup 을 쓰기로 통일 (steps 조정 · FreeExerciseForm RPE 와 같은 컴포넌트).
   * 이미 선택된 값을 다시 탭하면 해제한다.
   */
  import ChipGroup from '../ChipGroup.svelte';

  interface Props {
    value: number | undefined;
    onSelect: (rpe: number | undefined) => void;
  }
  let { value, onSelect }: Props = $props();

  const RPES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  function tap(v: number): void {
    onSelect(value === v ? undefined : v);
  }
</script>

<div class="rpe">
  <span class="label">RPE</span>
  <ChipGroup options={RPES} {value} onSelect={tap} ariaLabel="RPE 선택" name="rpe" />
</div>

<style>
  .rpe {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .label { font-size: 0.85rem; color: var(--muted); margin-right: 0.25rem; }
</style>

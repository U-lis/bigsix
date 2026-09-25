<!--
  선택 버튼 그룹 (RPE 1-10, 단계 1-10 등).

  같은 자리에 나란히 놓인 여러 값 중 하나가 "선택됨" 표시가 붙는다. 이전에는
  RpeInput, FreeExerciseForm 의 RPE, steps/+page 의 step-grid 세 곳에 같은
  마크업·스타일이 각각 나뉘어 있었다. 하나로 모은다.

  cube-study 의 `SegToggle.svelte` 는 2~4지선다 세그먼티드 토글이고, "다섯을 넘으면
  이 컨트롤이 아니라 목록이 맞다" 는 주석대로 10칸 grid 에는 안 맞는다. 그래서
  같은 설계 원칙(선택 표시는 class:on, disabled 는 투명도+커서, 잠금은 {#if} 로
  없애지 않는다, 훅은 data-{역할})만 가져와 이 컴포넌트로 정리한다.

  onSelect 는 탭된 값을 그대로 넘긴다. "이미 선택된 것을 다시 탭하면 해제" 같은
  정책은 호출부가 정한다 (RPE 는 해제 허용, steps 는 조정 확인 다이얼로그).
-->
<script lang="ts" generics="T extends string | number">
  interface Props<TVal extends string | number> {
    /** 표시할 값 목록. 이 순서대로 그려진다. */
    options: readonly TVal[];
    /** 현재 선택된 값. undefined 면 아무 것도 선택 안 됨. */
    value: TVal | undefined;
    /** 사용자가 chip 을 탭했다. 파라미터는 탭된 값(선택 여부와 무관). */
    onSelect: (v: TVal) => void;
    /** chip 위에 쓸 라벨. 기본은 String(v). */
    label?: (v: TVal) => string;
    /** 그룹 aria-label. */
    ariaLabel?: string;
    /** 한 줄에 몇 칸. 기본은 flex-wrap (전부 한 줄, 넘치면 접힘). 숫자면 grid-cols 로 고정. */
    cols?: number;
    /** 잠금. {#if} 로 없애지 않는다 — 자리를 지킨 채 투명도와 커서로 표시. */
    disabled?: boolean;
    /** data-chips 훅에 붙일 이름. 테스트가 그룹을 짚는다. */
    name?: string;
  }
  let {
    options,
    value,
    onSelect,
    label = (v: T) => String(v),
    ariaLabel,
    cols,
    disabled = false,
    name,
  }: Props<T> = $props();
</script>

<div
  class="chips"
  class:grid={cols !== undefined}
  data-chips={name}
  data-value={value === undefined ? '' : String(value)}
  data-locked={disabled ? 'true' : 'false'}
  role="group"
  aria-label={ariaLabel}
  style={cols !== undefined ? `--cols: ${cols}` : undefined}
>
  {#each options as opt (opt)}
    <button
      type="button"
      class:on={value === opt}
      data-option={String(opt)}
      aria-pressed={value === opt}
      {disabled}
      onclick={() => onSelect(opt)}
    >{label(opt)}</button>
  {/each}
</div>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    align-items: center;
  }
  .chips.grid {
    display: grid;
    grid-template-columns: repeat(var(--cols, 5), 1fr);
    gap: 0.35rem;
  }
  button {
    min-width: 44px;
    min-height: 44px;
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
    font-size: 0.9rem;
  }
  /* 선택 표시는 채우기가 아니라 색·테두리 (앱 전반의 .on 규약과 일관). */
  button.on {
    background: transparent;
    color: var(--accent);
    border-color: var(--accent);
  }
  /* 잠금은 색 하나로 알리지 않는다 — 투명도와 커서가 함께 바뀐다. */
  .chips[data-locked='true'] {
    opacity: 0.5;
  }
  .chips[data-locked='true'] button {
    cursor: not-allowed;
  }
</style>

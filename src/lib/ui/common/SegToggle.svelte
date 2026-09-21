<!--
  2지선다 세그먼티드 토글.

  단일 버튼으로 상태만 보여주면 "누르면 무엇이 되는지"를 알 수 없다.
  선택지를 나란히 두고 활성 쪽을 강조한다.

  선택지는 둘에서 넷이다. 다섯을 넘으면 모바일 폭에서 글자가 잘리기 시작하므로
  그때는 이 컨트롤이 아니라 목록이 맞다.

  넷은 한 줄에 넣지 않는다. 360px 폭에서 한 칸이 90px 이 되어 두 글자 넘는 라벨이
  잘린다 — `cols` 로 줄을 접는다 (2×2).

  설명은 항상 보이는 한 줄로 둔다. 모바일에는 hover 가 없어서
  title 툴팁에만 의존하면 정작 주 사용처에서 안 보인다.
-->
<script lang="ts" generics="T extends string">
	interface Option {
		value: T;
		label: string;
		/** 항상 보이는 짧은 설명 */
		hint: string;
		/** 데스크탑 hover 툴팁 */
		title: string;
	}

	let {
		name,
		heading = '',
		value = $bindable(),
		options,
		cols = options.length,
		disabled = false
	}: {
		name: string;
		/**
		 * 무엇을 고르는 자리인가. 라벨만으로는 알 수 없다.
		 *
		 * 비워 두면 머리말을 그리지 않는다 — 이 컨트롤을 이미 쓰고 있는 조회·퀴즈
		 * 화면은 문맥이 제목으로 서 있어서 한 줄이 더 붙으면 군더더기다.
		 */
		heading?: string;
		value: T;
		options: Option[];
		/**
		 * 한 줄에 몇 칸인가. 기본은 한 줄에 전부다 — 선택지가 둘·셋이면 그것이 맞다.
		 * 넷일 때 `2` 를 주면 2×2 로 접힌다.
		 */
		cols?: number;
		/**
		 * 잠금. 요소를 `{#if}` 로 없애지 않는다 (AD-14) — 자리를 지켜야 화면이
		 * 밀리지 않는다. 잠긴 표시는 **색이 아니라** 투명도와 커서다.
		 */
		disabled?: boolean;
	} = $props();

	let active = $derived(options.find((o) => o.value === value) ?? options[0]);
</script>

<div class="wrap">
	{#if heading}<p class="heading" data-heading={name}>{heading}</p>{/if}
	<div
		class="seg"
		data-toggle={name}
		data-value={value}
		data-locked={disabled ? 'true' : 'false'}
		role="group"
		aria-label={heading || name}
		style="--cols: {cols}"
	>
		{#each options as o (o.value)}
			<button
				type="button"
				data-option={o.value}
				class:on={value === o.value}
				aria-pressed={value === o.value}
				title={o.title}
				{disabled}
				onclick={() => (value = o.value)}
			>
				{o.label}
			</button>
		{/each}
	</div>
	<p class="hint" data-hint={name} title={active.title}>{active.hint}</p>
</div>

<style>
	.wrap {
		min-width: 0;
	}
	.seg {
		display: grid;
		/* 선택지 개수는 호출부가 정한다. 인라인 변수로 받아 CSS 를 갈라두지 않는다. */
		grid-template-columns: repeat(var(--cols, 2), 1fr);
		gap: 2px;
		padding: 2px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 9px;
	}
	button {
		min-height: 40px;
		padding: 0 0.15rem;
		font-family: var(--mono);
		font-size: 0.78rem;
		letter-spacing: -0.02em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--muted);
		background: transparent;
		border: none;
		border-radius: 7px;
		cursor: pointer;
		touch-action: manipulation;
	}
	button.on {
		color: var(--bg);
		background: var(--fg);
		font-weight: 600;
	}
	/* 잠금은 색 하나로 알리지 않는다 — 투명도와 커서가 함께 바뀐다 (#26). */
	.seg[data-locked='true'] {
		opacity: 0.5;
	}
	.seg[data-locked='true'] button {
		cursor: not-allowed;
	}
	.heading {
		margin: 0 0 0.25rem;
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--muted);
	}
	.hint {
		margin: 0.3rem 0 0;
		font-size: 0.72rem;
		line-height: 1.35;
		color: var(--muted);
		text-align: center;
	}
</style>

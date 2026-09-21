<script lang="ts">
  /**
   * 동작 설명 카드 안 조각 (FR-30 · UI-11).
   *
   * 표시 전용이다. 접기는 `<details>` 로 처리한다 — CSS 로 동작하며 접힌 상태에서도
   * DOM 에 본문이 남는다 (CLAUDE.md 「접기는 CSS 로 한다」). 펼침 상태는 기억하지
   * 않는다 (UI-11).
   *
   * `summary` 가 빈 단계는 `howtoFor` 가 배열에서 미리 뺀다 (EC-71). 결과가 비면
   * 이 컴포넌트 자체를 그리지 않아 빈 상자를 두지 않는다.
   *
   * `perSide` 좌우 고지는 여기서 다시 내지 않는다 — 카드가 `plan.sideNote` 로
   * 이미 한 번 보여준다. 자유 운동 폼처럼 `sideNote` 를 보여줄 자리가 없는 곳에서는
   * 이 컴포넌트의 `perSide` 데이터를 근거로 호출부가 알아서 처리한다.
   *
   * 마지막 줄에 출처를 한 번 밝힌다 (FR-30.6).
   */

  import type { Catalog, ProgressionId } from '$lib/domain/types';
  import { howtoFor } from './howto';
  import { unitLabel } from './labels';

  interface Props {
    catalog: Catalog;
    progressionId: ProgressionId;
    /** 실제로 수행하는 단계 (FR-30.2). 다지기면 이전 단계, 자유 운동이면 선택 단계. */
    performedStep: number;
  }
  let { catalog, progressionId, performedStep }: Props = $props();

  let items = $derived(howtoFor(catalog, progressionId, performedStep));
</script>

{#if items.length > 0}
  <details class="howto" data-howto>
    <summary data-howto-toggle>동작 설명</summary>
    <div class="body">
      {#each items as it (it.step)}
        <section class="entry" data-howto-step={it.step}>
          <h4>
            <span class="n">{it.step}단계</span>
            <span class="ko">{it.nameKo}</span>
            <span class="en">{it.nameEn}</span>
            <span class="page">{it.page}쪽</span>
            <span class="unit">단위: {unitLabel(it.unit)}</span>
          </h4>
          <ul>
            {#each it.lines as line (line)}
              <li>{line}</li>
            {/each}
          </ul>
        </section>
      {/each}
      <p class="source">동작 설명은 책 원문이 아니라 자체 요약</p>
    </div>
  </details>
{/if}

<style>
  .howto {
    margin: 0.5rem 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
  }
  .howto > summary {
    list-style: none;
    cursor: pointer;
    min-height: 44px;
    padding: 0.6rem 0.75rem;
    color: var(--muted);
    font-size: 0.9rem;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .howto > summary::-webkit-details-marker { display: none; }
  .howto > summary::before {
    content: '▸';
    color: var(--muted);
    font-size: 0.75rem;
  }
  .howto[open] > summary::before { content: '▾'; }
  .body {
    padding: 0 0.75rem 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .entry h4 {
    margin: 0.35rem 0 0.25rem;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--fg);
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.35rem;
  }
  .entry h4 .n { color: var(--muted); font-weight: 500; }
  .entry h4 .en { color: var(--muted); font-weight: 400; font-size: 0.85rem; }
  .entry h4 .page,
  .entry h4 .unit {
    color: var(--muted);
    font-weight: 400;
    font-size: 0.8rem;
    margin-left: auto;
  }
  .entry ul {
    margin: 0.15rem 0 0;
    padding-left: 1.15rem;
    color: var(--fg);
  }
  .entry li { line-height: 1.55; font-size: 0.9rem; }
  .source {
    margin: 0.35rem 0 0;
    color: var(--muted);
    font-size: 0.75rem;
  }
</style>

<script lang="ts">
  /**
   * 종목별 추이 표 (FR-25 / UI-4).
   *
   * 그래프 · 강조 · 배지 · 추세선 없이 표만. 숫자 열은 `tabular-nums` + 오른쪽 정렬.
   * 색은 `app.css` 토큰만 쓴다. 문자열은 도메인이 준 것을 가공 없이 노출한다 (NFR-2).
   *
   * 단계 경계(승급 · 다지기)는 얇은 구분선 한 줄과 짧은 문구로 알린다 (FR-25.4).
   */
  import type {
    Catalog, ProgressionId, StandardLabel,
  } from '$lib/domain/types';
  import { getProgression, getStep } from '$lib/domain';
  import ChipGroup from '$lib/ui/common/ChipGroup.svelte';
  import type { AppState } from '$lib/domain/types';
  import {
    buildProgressionRows, defaultProgressionId, type ProgressionRow,
  } from './progression';

  interface Props {
    appState: AppState;
    catalog: Catalog;
  }
  let { appState, catalog }: Props = $props();

  // 빅6 6종. 표시 순서는 도메인의 관용 순서를 따른다.
  const IDS: readonly ProgressionId[] = [
    'pushup', 'squat', 'pullup', 'legraise', 'bridge', 'hspu',
  ] as const;

  // 진입 시 기본 종목만 정하고, 이후 사용자의 선택을 잊지 않도록 한 번만 읽는다.
  // appState 가 나중에 바뀌어도 (import 등) 선택은 유지한다 — 그 방침이라 초기값
  // 캡처가 의도된 것이다.
  // svelte-ignore state_referenced_locally
  let selected: ProgressionId = $state(defaultProgressionId(appState));
  let rows: ProgressionRow[] = $derived(buildProgressionRows(appState, selected));

  function progKo(id: ProgressionId): string {
    return getProgression(catalog, id).name.ko;
  }

  function stepKo(id: ProgressionId, n: number): string {
    return getStep(catalog, id, n).name.ko;
  }

  function unitKo(id: ProgressionId, n: number): string {
    return getStep(catalog, id, n).unit === 'seconds' ? '초' : '회';
  }

  function standardKo(label: StandardLabel): string {
    switch (label) {
      case 'beginner': return '초보자';
      case 'intermediate': return '중급자';
      case 'progression': return '상급자';
      case 'elite': return '최상급자';
    }
  }

  /** "8 · 7 · 6" — 세트 값을 · 으로 잇는다 (단위는 열 머리글이 아니라 여기 붙지 않는다). */
  function setsText(sets: number[]): string {
    return sets.join(' · ');
  }

  /** "beginner 2×8" 형태 문구. 목표가 없으면 빈 문자열. */
  function goalText(row: ProgressionRow): string {
    if (!row.goal) return '';
    return `${standardKo(row.goal.label)} ${row.goal.sets}×${row.goal.value}`;
  }

  /** 목표 충족 문구. undefined 는 "—". */
  function meetsText(row: ProgressionRow): string {
    if (row.meetsGoal === undefined) return '—';
    return row.meetsGoal ? '달성' : '미달';
  }

  function meetsAttr(row: ProgressionRow): 'yes' | 'no' | '' {
    if (row.meetsGoal === undefined) return '';
    return row.meetsGoal ? 'yes' : 'no';
  }

  /** 세션 성격 라벨. 'work' 는 정규라 문구를 두지 않는다. */
  function kindText(row: ProgressionRow): string {
    if (row.kind === 'consolidation') return '다지기';
    if (row.kind === 'free') return '자유';
    if (row.outcome === 'abandoned') return '중단';
    return '';
  }

  function promotionText(row: ProgressionRow): string {
    if (row.promotedTo === undefined) return '';
    return `${row.promotedTo}단계로 승급`;
  }

  /** 경계 행의 안내 문구 ("승급 → N단계" / "다지기 → M단계" / "→ N단계"). */
  function boundaryText(row: ProgressionRow): string {
    if (row.kind === 'consolidation') return `다지기 → ${row.performedStep}단계`;
    return `승급 → ${row.performedStep}단계`;
  }
</script>

<section class="wrap" data-history-progression={selected}>
  <ChipGroup
    options={IDS}
    value={selected}
    onSelect={(v) => (selected = v)}
    label={progKo}
    ariaLabel="종목 선택"
    name="history-progression"
  />

  {#if rows.length === 0}
    <p class="empty" data-prog-empty>이 종목의 기록이 아직 없습니다.</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">날짜</th>
            <th scope="col" class="num">단계</th>
            <th scope="col" class="num">세트 값</th>
            <th scope="col" class="num">합계</th>
            <th scope="col" class="num">목표</th>
            <th scope="col">충족</th>
            <th scope="col" class="num">RPE</th>
            <th scope="col">성격</th>
            <th scope="col">승급</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row, i (row.date + ':' + i)}
            {#if row.stepBoundary}
              <tr class="boundary" data-prog-boundary={row.performedStep}>
                <td colspan="9">{boundaryText(row)}</td>
              </tr>
            {/if}
            <tr
              data-prog-row="{row.date}:{i}"
              data-prog-meets={meetsAttr(row)}
            >
              <td class="date">{row.date}</td>
              <td class="num">{row.performedStep}</td>
              <td class="num">{setsText(row.sets)} {unitKo(selected, row.performedStep)}</td>
              <td class="num">{row.total}</td>
              <td class="num">{goalText(row) || '—'}</td>
              <td>{meetsText(row)}</td>
              <td class="num">{row.rpe ?? '—'}</td>
              <td>{kindText(row) || '—'}</td>
              <td>{promotionText(row) || '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!--
      단계 이름 참조 (선택된 종목의 현재 최신 세션 기준).
      표에는 단계 숫자만 들어가 자릿수를 맞춘다 — 단계 이름은 표 밖 한 줄로 뺀다.
    -->
    <p class="step-legend" data-prog-legend>
      {progKo(selected)} · 최근 {rows[0].performedStep}단계 · {stepKo(selected, rows[0].performedStep)}
    </p>
  {/if}
</section>

<style>
  .wrap {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .empty {
    color: var(--muted);
    margin: 1rem 0;
  }
  .table-wrap {
    /* 좁은 화면에서 표가 가로로 넘칠 수 있다 — 가로 스크롤로 자리를 지킨다. */
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }
  table {
    /* UI-4: 표만. 강조 · 배지 · 추세선 없음. */
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }
  thead th {
    padding: 0.5rem 0.5rem;
    text-align: left;
    font-weight: 600;
    color: var(--muted);
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  tbody td {
    padding: 0.45rem 0.5rem;
    color: var(--fg);
    border-top: 1px solid var(--border);
    vertical-align: baseline;
    white-space: nowrap;
  }
  /* 숫자 열: tabular-nums + 오른쪽 정렬 (UI-4). */
  th.num, td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  td.date {
    font-family: var(--mono);
  }
  tr.boundary td {
    padding: 0.35rem 0.5rem;
    font-size: 0.75rem;
    color: var(--muted);
    background: var(--bg);
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }
  .step-legend {
    margin: 0.25rem 0 0;
    font-size: 0.78rem;
    color: var(--muted);
  }
</style>

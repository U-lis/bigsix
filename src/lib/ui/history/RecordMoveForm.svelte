<script lang="ts">
  /**
   * 세션 기록 하나의 날짜 옮기기 (FR-1, FR-3).
   *
   * 적용은 `onMove` 로 올린다. 성공하면 상위 `{#key moveGeneration}` 이 이 인스턴스를
   * 다시 만들므로, 여기서 닫거나 포커스를 옮기지 않는다.
   */
  import { tick } from 'svelte';
  import type { IsoDate } from '$lib/domain/types';
  import type { RecordMoveError, RecordMoveResult } from './moveGuard';

  interface Props {
    date: IsoDate;
    recordIndex: number;
    today: IsoDate;
    onMove: (recordIndex: number, toDate: IsoDate) => RecordMoveResult;
  }
  let { date, recordIndex, today, onMove }: Props = $props();

  let open = $state(false);
  let toDate: IsoDate = $state('');
  let error: RecordMoveError | null = $state(null);
  let dateInput: HTMLInputElement | undefined = $state();
  let trigger: HTMLButtonElement | undefined = $state();

  // `default` 를 두지 않아 사유가 늘면 `pnpm check` 가 빠진 문구를 잡는다 (AD-8).
  function rejectionText(reason: RecordMoveError): string {
    switch (reason) {
      case 'invalid-index': return '기록을 찾을 수 없습니다.';
      case 'invalid-date': return '날짜가 올바르지 않습니다.';
      case 'future': return '미래 날짜로는 옮길 수 없습니다.';
      case 'same-date': return '지금과 같은 날짜입니다.';
      case 'crosses-same-progression': return '같은 종목의 다른 기록을 건너뛸 수 없습니다.';
      case 'crosses-adjustment': return '이 종목의 단계 조정 시점을 건너뛸 수 없습니다.';
      case 'open-draft': return '오늘 진행 중인 이 종목 칸이 있습니다. 먼저 마치거나 버리세요.';
    }
  }

  // 숨김은 CSS 라, DOM 에 열림 상태가 반영된 뒤(`tick`)에야 포커스를 받을 수 있다.
  async function openForm() {
    toDate = date;
    open = true;
    await tick();
    dateInput?.focus();
  }

  async function closeForm() {
    open = false;
    error = null;
    await tick();
    trigger?.focus();
  }

  function applyMove() {
    const result = onMove(recordIndex, toDate);
    if (!result.ok) error = result.reason;
  }
</script>

<!-- 폼을 버튼 앞에 둔다. 열린 폼의 다음 형제로 버튼을 접어 같은 훅 하나로 둘을 맞춘다. -->
<div class="form" data-record-move-form={open ? 'open' : 'closed'}>
  <label class="field">
    <span>옮길 날짜</span>
    <input type="date" data-record-move-date max={today} bind:this={dateInput} bind:value={toDate} />
  </label>
  {#if error !== null}
    <p class="error" role="alert" data-record-move-error={error}>{rejectionText(error)}</p>
  {/if}
  <div class="actions">
    <button type="button" data-record-move-cancel onclick={closeForm}>취소</button>
    <button type="button" class="apply" data-record-move-apply onclick={applyMove}>옮기기</button>
  </div>
</div>
<button type="button" class="trigger" data-record-move bind:this={trigger} onclick={openForm}>날짜 옮기기</button>

<style>
  .form {
    margin-top: 0.4rem;
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
  }
  [data-record-move-form='closed'] {
    display: none;
  }
  [data-record-move-form='open'] + .trigger {
    display: none;
  }
  .field {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  input {
    flex: 1 1 10rem;
    min-width: 0;
    min-height: 44px;
    padding: 0.5rem;
    font-family: var(--sans);
    font-size: 1rem;
    color: var(--fg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .error {
    margin: 0.5rem 0 0;
    font-size: 0.85rem;
    color: var(--danger);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  button {
    min-height: 44px;
    padding: 0.5rem 0.9rem;
    font-family: var(--sans);
    font-size: 0.9rem;
    color: var(--fg);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    touch-action: manipulation;
  }
  .apply {
    color: var(--bg);
    background: var(--accent);
    border-color: var(--accent);
  }
  .trigger {
    display: block;
    margin-top: 0.4rem;
    color: var(--muted);
  }
</style>

<script lang="ts" module>
  import type { ImportCounts } from './importJson';

  /**
   * 확인 다이얼로그 본문 (FR-27.3 · FR-27.5).
   *
   * "현재 기록: N건 (from ~ to) · 가져올 기록: M건 (from ~ to). 기존 데이터는
   * 사라집니다. 필요하면 먼저 「JSON 내보내기」 로 백업하세요."
   *
   * 순수 함수로 뽑아 문구 검증 테스트가 쉬워지도록 한다. `Confirm.svelte` 는
   * `body` 를 텍스트 바인딩으로만 그린다 — `{@html}` 없음 (NFR-28).
   */
  export function confirmBody(counts: ImportCounts): string {
    const cur = describe(counts.current, counts.currentRange);
    const inc = describe(counts.incoming, counts.incomingRange);
    return (
      `현재 기록: ${cur} · 가져올 기록: ${inc}. `
      + '기존 데이터는 사라집니다. 필요하면 먼저 「JSON 내보내기」 로 백업하세요.'
    );
  }

  function describe(
    n: number, range: { from: string; to: string } | null,
  ): string {
    if (range === null) return `${n}건`;
    return `${n}건 (${range.from} ~ ${range.to})`;
  }
</script>

<script lang="ts">
  /**
   * 가져오기 다이얼로그 (FR-27.1 · FR-27.3 · FR-27.4 · FR-27.5).
   *
   * 순서:
   *   1. 진행 중 세션이 있으면 파일 입력 자체를 렌더하지 않고 안내 문구
   *      (`data-import-block="inprogress"`) — 파일이 열리지 않는다 (EC-62).
   *   2. `<input type="file" accept="application/json">` 로 파일 하나를 받는다.
   *   3. `file.text()` 로 문자열을 얻고 `parseImport(text, appState)` 를 부른다.
   *   4. 결과가 `ok === false` 이면 `data-import-error="{reason}"` 로 사유 문구.
   *   5. 결과가 `ok === true` 이면 `Confirm` 다이얼로그로 덮어쓰기 확인.
   *      확인 시 부모가 넘긴 `onConfirm(appState)` 콜백을 부른다 (부모가 스토어
   *      교체를 담당한다 — 이 컴포넌트는 순수 UI).
   *
   * NFR-28 준수: 문구는 전부 Svelte 텍스트 바인딩으로만 그린다. `{@html}` 없음.
   */
  import type { AppState } from '$lib/domain/types';
  import Confirm from '$lib/ui/common/Confirm.svelte';
  import { parseImport, type ImportResult } from './importJson';

  interface Props {
    /** 현재 앱 상태. counts 계산과 확인 문구의 근원. */
    appState: AppState;
    /** 진행 중 세션 존재 여부 (FR-27.4 / EC-62). true 이면 파일 입력이 렌더되지 않는다. */
    hasInProgress: boolean;
    /** 사용자가 확인 다이얼로그의 「확정」 을 눌렀을 때 부모가 스토어를 교체한다. */
    onConfirm: (next: AppState) => void;
  }
  let { appState, hasInProgress, onConfirm }: Props = $props();

  // 파일 선택 → 파싱 결과. null 이면 아직 시도 전.
  let result: ImportResult | null = $state(null);
  // 같은 파일을 다시 고를 수 있도록 <input> 을 강제로 리셋하기 위한 key.
  let inputKey = $state(0);

  async function onFileChange(e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    const file = target.files && target.files[0];
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      // 파일 읽기 자체가 실패 — 사용자가 재선택할 수 있도록 not-json 문구를 재사용한다.
      result = { ok: false, reason: 'not-json' };
      inputKey += 1;
      return;
    }
    result = parseImport(text, appState);
    inputKey += 1;
  }

  function onConfirmClick() {
    if (result !== null && result.ok) {
      onConfirm(result.appState);
    }
    result = null;
  }

  function onCancelClick() {
    result = null;
  }
</script>

<div class="import" data-import-dialog>
  {#if hasInProgress}
    <p class="block" data-import-block="inprogress">
      진행 중인 세션이 있어 가져오기를 시작할 수 없습니다. 먼저 세션을 완료하거나 취소하세요.
    </p>
  {:else}
    <label class="btn" data-import>
      {#key inputKey}
        <input
          type="file"
          accept="application/json,.json"
          onchange={onFileChange}
        />
      {/key}
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <path d="M14 3v6h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
        <path d="M12 18v-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <path d="M9 15l3-3 3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="btn-label">JSON 가져오기</span>
    </label>
  {/if}

  {#if result !== null && !result.ok}
    <p class="error" data-import-error={result.reason}>
      {#if result.reason === 'not-json'}
        JSON 이 아닙니다.
      {:else if result.reason === 'schema-missing'}
        이 파일은 bigsix 내보내기 형식이 아닙니다.
      {:else if result.reason === 'shape'}
        저장 형태가 맞지 않습니다.
      {:else if result.reason === 'future-version'}
        앱이 이 파일보다 오래됐습니다. 앱을 갱신하세요.
      {/if}
    </p>
  {/if}

  {#if result !== null && result.ok}
    <Confirm
      title="가져오기로 덮어쓸까요?"
      body={confirmBody(result.counts)}
      confirmLabel="가져오기"
      cancelLabel="취소"
      onConfirm={onConfirmClick}
      onCancel={onCancelClick}
    />
  {/if}
</div>

<style>
  .import {
    display: contents;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 44px;
    padding: 0.5rem 0.9rem;
    font-family: var(--sans);
    font-size: 0.9rem;
    color: var(--fg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
    touch-action: manipulation;
  }
  .btn:hover {
    background: var(--bg);
  }
  .btn input[type="file"] {
    /* 접근성상 label 이 대신 눌리도록 실제 input 은 감춘다. */
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .btn-label {
    font-weight: 500;
  }
  .block {
    width: 100%;
    margin: 0.25rem 0 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .error {
    width: 100%;
    margin: 0.25rem 0 0;
    font-size: 0.85rem;
    color: var(--danger);
  }
</style>

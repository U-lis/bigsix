<script lang="ts">
  /**
   * 커스텀 프로그램 만들기 · 고치기 폼 (#13).
   *
   * 요일마다 그날 할 종목을 고른다. 한 요일에 여러 종목, 같은 종목을 여러 요일에 넣을 수
   * 있다. 검사 문구는 도메인(`validateCustomProgram`)이 준 것을 그대로 보인다 (NFR-2).
   *
   * 잠긴 종목(브리지 · 핸드스탠드 푸시업)도 넣을 수 있다. 그날 오늘 화면에 잠김으로 서고,
   * 빅4 를 마치면 그대로 열린다 — 기존 5종의 요일표와 같은 동작이다.
   */
  import {
    addCustomProgram, checkGate, CUSTOM_NAME_MAX, updateCustomProgram, validateCustomProgram,
    WEEKDAYS,
  } from '$lib/domain';
  import type { Catalog, CustomProgramInput } from '$lib/domain/types';
  import { appState } from '$lib/ui/state/state.svelte';
  import { progressionName } from '$lib/ui/session/labels';
  import { PICK_ORDER, toggleDay, trainingDayCount } from './customForm';

  interface Props {
    catalog: Catalog;
    /** 처음 값. 새로 만들기면 빈 입력, 고치기 · 복제면 그 프로그램의 입력. */
    initial: CustomProgramInput;
    /** 고칠 프로그램 id. 없으면 새로 만든다. */
    editId?: string;
    onDone: () => void;
    onCancel: () => void;
  }
  let { catalog, initial, editId, onDone, onCancel }: Props = $props();

  // 폼은 열릴 때의 값에서 시작해 사용자의 입력만 따라간다.
  // svelte-ignore state_referenced_locally
  let input = $state<CustomProgramInput>(initial);
  let error = $state<string | null>(null);

  let dayCount = $derived(trainingDayCount(input));
  let lockedPicked = $derived(
    PICK_ORDER.filter((id) =>
      !checkGate(appState.value, catalog, id).unlocked
      && WEEKDAYS.some((w) => (input.days[w] ?? []).includes(id))),
  );

  function save() {
    const msg = validateCustomProgram(appState.value, catalog, input, editId);
    if (msg !== null) {
      error = msg;
      return;
    }
    const next = editId === undefined
      ? addCustomProgram(appState.value, catalog, input).state
      : updateCustomProgram(appState.value, catalog, editId, input);
    appState.apply(next);
    onDone();
  }
</script>

<div
  class="backdrop"
  role="presentation"
  onclick={onCancel}
  onkeydown={(e) => { if (e.key === 'Escape') onCancel(); }}
>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="custom-title"
    tabindex="-1"
    data-custom-form={editId ?? 'new'}
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    <h2 id="custom-title">{editId === undefined ? '새 프로그램' : '프로그램 고치기'}</h2>

    <label class="name">
      <span>이름</span>
      <input
        type="text"
        maxlength={CUSTOM_NAME_MAX}
        bind:value={input.name}
        placeholder="예: 주 4일 빅4"
        data-custom-name
      />
    </label>

    <p class="hint">요일마다 그날 할 종목을 고릅니다. 아무것도 고르지 않은 요일은 휴식일입니다.</p>

    <div class="days">
      {#each WEEKDAYS as w (w)}
        {@const picked = input.days[w] ?? []}
        <fieldset class="day" data-custom-day={w}>
          <legend>{w} <span class="day-state">{picked.length === 0 ? '휴식' : `${picked.length}종목`}</span></legend>
          <div class="picks">
            {#each PICK_ORDER as id (id)}
              <button
                type="button"
                class:on={picked.includes(id)}
                aria-pressed={picked.includes(id)}
                data-custom-pick={id}
                onclick={() => { input = toggleDay(input, w, id); error = null; }}
              ><span class="mark" aria-hidden="true">{picked.includes(id) ? '✓ ' : ''}</span>{progressionName(catalog, id)}</button>
            {/each}
          </div>
        </fieldset>
      {/each}
    </div>

    <p class="summary" data-custom-summary>운동일 {dayCount}일 / 7</p>

    {#if lockedPicked.length > 0}
      <p class="note" data-custom-locked>
        {lockedPicked.map((id) => progressionName(catalog, id)).join(', ')}: 아직 잠긴 종목입니다.
        빅4 를 6단계까지 마치기 전에는 그날 카드에 잠김으로 표시됩니다.
      </p>
    {/if}

    {#if error !== null}
      <p class="error" role="alert" data-custom-error>{error}</p>
    {/if}

    <div class="actions">
      <button type="button" data-custom-cancel onclick={onCancel}>취소</button>
      <button type="button" class="save" data-custom-save onclick={save}>저장</button>
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
    max-height: 90vh;
    overflow-y: auto;
    border: 1px solid var(--border);
  }
  h2 { margin: 0 0 0.75rem; font-size: 1.15rem; }
  .name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .name > span { min-width: 3rem; color: var(--muted); font-size: 0.9rem; }
  input {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    padding: 0.5rem;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 1rem;
  }
  .hint { color: var(--muted); font-size: 0.85rem; margin: 0.75rem 0 0.5rem; }
  .days { display: flex; flex-direction: column; gap: 0.5rem; }
  .day {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.5rem;
    margin: 0;
  }
  legend { padding: 0 0.25rem; font-weight: 600; }
  .day-state { color: var(--muted); font-weight: 400; font-size: 0.8rem; }
  .picks {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.35rem;
  }
  .picks button {
    min-height: 44px;
    padding: 0.35rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
    font-size: 0.82rem;
    line-height: 1.2;
  }
  /* 선택 표시는 ChipGroup 과 같은 규약 — 채우기가 아니라 색 · 테두리. 색만으로 알리지 않도록
     ✓ 표시가 함께 선다. 스크린 리더는 aria-pressed 로 읽는다. */
  .picks button.on {
    background: transparent;
    color: var(--accent);
    border-color: var(--accent);
    font-weight: 600;
  }
  .summary { margin: 0.75rem 0 0; font-size: 0.9rem; }
  .note { color: var(--muted); font-size: 0.85rem; margin: 0.5rem 0 0; }
  .error { color: var(--danger); margin: 0.5rem 0 0; font-size: 0.9rem; }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .actions button {
    min-height: 44px;
    padding: 0.5rem 1.25rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
    color: var(--fg);
    cursor: pointer;
    font-size: 1rem;
  }
  .actions .save {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
</style>

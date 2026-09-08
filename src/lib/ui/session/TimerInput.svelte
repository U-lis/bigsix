<script lang="ts">
  /**
   * 유지 시간(seconds) 입력 — 내장 카운트업 타이머 (FR-6.12~6.17 / EC-14).
   * 정지 시각이 곧 그 세트 기록이다.
   */
  import { onDestroy, untrack } from 'svelte';
  import { createTimer } from '../timer.svelte.ts';
  import { alert as notifyAlert, type NotifyHandle } from '../notify.ts';
  import { unitLabel } from './labels.ts';

  interface Props {
    targetSec: number;
    /** 확정 콜백 — seconds 는 정수, > 0. */
    onConfirm: (seconds: number) => void;
  }
  let { targetSec, onConfirm }: Props = $props();
  const timer = createTimer();
  let alertHandle: NotifyHandle | null = null;
  let manualOverride = $state(false);
  let overrideValue = $state('');

  // 화면 리렌더용 틱 루프. requestAnimationFrame 은 브라우저 전용이니 존재 확인.
  let rafId: number | null = null;
  function schedule() {
    if (typeof requestAnimationFrame === 'undefined') return;
    rafId = requestAnimationFrame(() => {
      timer.tick();
      if (timer.phase === 'ready' || timer.phase === 'running') schedule();
    });
  }

  function start() {
    timer.start(targetSec, () => {
      // 목표 도달 — 5초만 울리고 자동 조용 (FR-6.14).
      alertHandle = notifyAlert({ durationMs: 5_000 });
    });
    schedule();
  }

  function stop() {
    const { seconds } = timer.stop();
    if (rafId !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafId);
    rafId = null;
    if (alertHandle !== null) { alertHandle.cancel(); alertHandle = null; }
    if (seconds > 0) onConfirm(seconds);
  }

  function confirmOverride() {
    const n = Number(overrideValue);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return;
    timer.overrideSeconds(n);
    onConfirm(n);
  }

  onDestroy(() => {
    if (rafId !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafId);
    if (alertHandle !== null) alertHandle.cancel();
  });

  // 표시용 파생값.
  let elapsedSec = $derived(Math.floor(timer.elapsedMs / 1000));
  let readySec = $derived(Math.ceil(timer.readyRemainingMs / 1000));
  let overGoal = $derived(elapsedSec >= targetSec);
  // untrack 은 무의미하지만 반응성 경고를 방지하기 위한 안전장치.
  untrack(() => {});
</script>

<div class="timer">
  <p class="target">목표 {targetSec}{unitLabel('seconds')}</p>
  {#if timer.phase === 'idle'}
    <button type="button" onclick={start}>시작</button>
  {:else if timer.phase === 'ready'}
    <p class="ready">준비 {readySec}초</p>
    <button type="button" onclick={stop}>취소</button>
  {:else if timer.phase === 'running'}
    <p class="elapsed" class:over={overGoal}>{elapsedSec}초</p>
    <button type="button" class="stop" onclick={stop}>정지 · 기록</button>
  {:else if timer.phase === 'stopped'}
    <p class="elapsed">{elapsedSec}초 · 기록됨</p>
  {/if}

  <details class="manual">
    <summary>수동 정정</summary>
    <p class="note">타이머가 잘못 잡혔으면 값을 직접 고칠 수 있습니다.</p>
    {#if !manualOverride}
      <button type="button" onclick={() => manualOverride = true}>수동 입력 열기</button>
    {:else}
      <input
        type="number"
        inputmode="numeric"
        min="1"
        step="1"
        bind:value={overrideValue}
        aria-label="수동 초 입력"
      />
      <button type="button" onclick={confirmOverride}>확정</button>
    {/if}
  </details>
</div>

<style>
  .timer { display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start; }
  .target { margin: 0; color: var(--muted); font-size: 0.9rem; }
  .ready { margin: 0; font-size: 2rem; font-weight: bold; }
  .elapsed { margin: 0; font-size: 2.5rem; font-weight: bold; font-variant-numeric: tabular-nums; }
  .elapsed.over { color: var(--ok); }
  button {
    min-height: 44px;
    min-width: 44px;
    padding: 0.75rem 1.25rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
    color: var(--fg);
    cursor: pointer;
    font-size: 1rem;
  }
  button.stop { background: var(--danger-bg); border-color: var(--danger); }
  .manual { margin-top: 0.5rem; font-size: 0.85rem; color: var(--muted); }
  .manual summary { cursor: pointer; padding: 0.5rem 0; }
  .note { margin: 0.25rem 0; }
  input {
    font-size: 1rem;
    padding: 0.5rem;
    min-height: 44px;
    min-width: 6rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    margin-right: 0.5rem;
  }
</style>

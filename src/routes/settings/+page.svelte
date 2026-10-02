<script lang="ts">
  /**
   * 화면 5 — 설정 (SPEC4 FR-33 · UI-12~16 · PHASE_4_PLAN 4단계).
   *
   * 알림 섹션 하나로 시작한다. 「켜짐 여부」의 정본은 로컬이 아니라 `PushRelay.state()`
   * 다 (ADR-29) — 마운트 시 릴레이 클라이언트를 붙여 상태를 읽는다.
   *
   * 룬 규약 (CLAUDE.md): 파생은 `$derived`, 부작용(릴레이 로드 · enable/disable
   * 호출 · 상태 재조회)에만 `$effect`. `export let` · `$:` · `on:click` · `<slot>` · 스토어 금지.
   *
   * 접기 규약 (CLAUDE.md): 켜기/끄기/테스트 버튼은 모두 DOM 에 남겨 두고 CSS 로
   * 숨긴다 — 하이드레이션과 포커스가 흔들리지 않도록. 잠금은 투명도 + 커서 +
   * `disabled` 속성 세 가지로 표시한다 (UI-15).
   *
   * 색은 `src/lib/styles/app.css` 토큰만 쓴다 — 이 파일에 hex 가 없다 (FR-16.4).
   * 터치 타깃은 44px 이상 (CLAUDE.md).
   */
  import { PUBLIC_PUSH_RELAY_URL } from '$env/static/public';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';

  import { appState } from '$lib/ui/state/state.svelte';
  import { loadCatalog } from '$lib/data/catalog';
  import { currentStint } from '$lib/domain';

  import { pushRecord } from '$lib/ui/push/push.svelte';
  import { buildMeta } from '$lib/ui/push/meta';
  import { loadRelay } from '$lib/ui/push/relay';
  import {
    stateToLabel,
    errorToLabel,
    canEnable,
    canDisable,
    timeInputEnabled,
    isDevRelay,
  } from '$lib/ui/push/pushUI';
  import type { PushErrorCode, PushMeta, PushState } from '$lib/ui/push/types';

  // 알림 상태. 초기값은 「확인 중」 — 릴레이 클라이언트를 붙이기 전.
  let pushState = $state<PushState>('loading');

  // 가장 최근 오류 code. 없으면 null — 성공 조작 뒤에 비운다.
  let errorCode = $state<PushErrorCode | null>(null);

  // 켜기·끄기·시각 변경·테스트 발송 중 비동기 호출 중복을 막는다.
  let busy = $state(false);

  const catalog = loadCatalog();
  const showTest = isDevRelay(PUBLIC_PUSH_RELAY_URL);

  // 프로그램 선택 여부. meta 조립 전에 쓰는 판정이므로 `$derived` 로 뽑는다.
  let hasProgramSelected = $derived(currentStint(appState.value) !== null);

  // 기기 타임존. 마운트 뒤 한 번 읽는다 — 세션 중 바뀌면 autoSync (Phase 5) 가 잡는다.
  let tz = $state<string>('UTC');
  onMount(() => {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  });

  /** 현재 입력 상태로 base meta 를 만든다. 프로그램 미선택이면 null. */
  function makeBaseMeta(): PushMeta | null {
    return buildMeta(appState.value, catalog, tz, pushRecord.value.notifyAt);
  }

  /** 릴레이 클라이언트를 붙이고 상태를 읽어 UI 에 반영한다. */
  async function refreshState(): Promise<void> {
    if (!browser) return;
    try {
      await loadRelay();
    } catch {
      // 로드 실패 — 지금은 상태를 알 수 없다. 사용자가 조작하면 그때 다시 시도한다.
      pushState = 'off';
      errorCode = 'network';
      return;
    }
    const relay = window.PushRelay;
    if (relay === undefined) {
      pushState = 'off';
      errorCode = 'network';
      return;
    }
    pushState = relay.state();
  }

  onMount(() => {
    void refreshState();
  });

  /**
   * 릴레이 오류 객체에서 `code` 를 뽑는다. 알려지지 않은 모양이면 `server` 로 떨어뜨린다
   * — 사용자에게 사실 문구를 주되 분기가 끊기지 않도록 (FR-33.8).
   */
  function errorCodeOf(e: unknown): PushErrorCode {
    const known: readonly PushErrorCode[] = [
      'denied',
      'unsupported',
      'no-service-worker',
      'origin-not-allowed',
      'push-service-not-allowed',
      'subscribe',
      'network',
      'server',
    ];
    if (e !== null && typeof e === 'object' && 'code' in e) {
      const c = (e as { code?: unknown }).code;
      if (typeof c === 'string' && (known as readonly string[]).includes(c)) {
        return c as PushErrorCode;
      }
    }
    return 'server';
  }

  async function onEnable(): Promise<void> {
    if (busy) return;
    if (!canEnable(pushState, hasProgramSelected)) return;
    busy = true;
    errorCode = null;
    try {
      await loadRelay();
      const base = makeBaseMeta();
      if (base === null) {
        // 프로그램 미선택인데 눌렸다면 UI 가 비활성 상태였어야 한다 — 안전 가드.
        busy = false;
        return;
      }
      await window.PushRelay!.enable(base);
      pushRecord.setSentMeta(JSON.stringify(base));
      pushState = window.PushRelay!.state();
    } catch (e) {
      errorCode = errorCodeOf(e);
      // 권한 거부·미지원이면 state 가 바뀌어 있다. 그 외는 상태를 다시 읽어 둔다.
      try {
        if (window.PushRelay !== undefined) pushState = window.PushRelay.state();
      } catch {
        // 상태 조회 자체가 실패하면 그대로 둔다.
      }
    } finally {
      busy = false;
    }
  }

  async function onDisable(): Promise<void> {
    if (busy) return;
    if (!canDisable(pushState)) return;
    busy = true;
    errorCode = null;
    try {
      await loadRelay();
      await window.PushRelay!.disable();
      // `sentMeta` 는 비운다 — 다음 켤 때 자동 동기화가 반드시 enable 을 다시 부른다.
      pushRecord.setSentMeta(null);
      pushState = window.PushRelay!.state();
    } catch (e) {
      errorCode = errorCodeOf(e);
      try {
        if (window.PushRelay !== undefined) pushState = window.PushRelay.state();
      } catch {
        // 상태 조회 자체가 실패하면 그대로 둔다.
      }
    } finally {
      busy = false;
    }
  }

  async function onTimeChange(e: Event): Promise<void> {
    const target = e.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    const next = target.value;
    if (next === '' || next === pushRecord.value.notifyAt) return;

    pushRecord.setNotifyAt(next);

    // 알림이 켜져 있으면 새 meta 로 재등록 (구독 ID 는 유지, FR-33.5).
    if (pushState !== 'on') return;
    if (busy) return;
    busy = true;
    errorCode = null;
    try {
      await loadRelay();
      const base = makeBaseMeta();
      if (base === null) {
        busy = false;
        return;
      }
      await window.PushRelay!.enable(base);
      pushRecord.setSentMeta(JSON.stringify(base));
    } catch (err) {
      errorCode = errorCodeOf(err);
    } finally {
      busy = false;
    }
  }

  /**
   * 테스트 발송 — base meta 에 `test: <UTC ISO 초 단위>` 를 더해 재등록한다 (FR-33.11).
   * `sentMeta` 는 갱신하지 않는다 — 자동 동기화(FR-34.3) 가 test 로 트리거되지 않도록.
   */
  async function onTest(): Promise<void> {
    if (busy) return;
    if (pushState !== 'on') return;
    busy = true;
    errorCode = null;
    try {
      await loadRelay();
      const base = makeBaseMeta();
      if (base === null) {
        busy = false;
        return;
      }
      const test = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      const testMeta = { ...base, test };
      await window.PushRelay!.enable(testMeta);
    } catch (e) {
      errorCode = errorCodeOf(e);
    } finally {
      busy = false;
    }
  }

  // disabled 플래그 — 사용자 입력에 쓸 수 있는 상태인지. `busy` 중에도 잠근다.
  let enableDisabled = $derived(busy || !canEnable(pushState, hasProgramSelected));
  let disableDisabled = $derived(busy || !canDisable(pushState));
  let testDisabled = $derived(busy || pushState !== 'on');
  let timeDisabled = $derived(!timeInputEnabled(pushState));
</script>

<svelte:head>
  <title>설정 · bigsix</title>
</svelte:head>

<section class="push" data-push-state={pushState} aria-labelledby="push-h">
  <h2 id="push-h">알림</h2>

  <!-- 상태 문구. 색 하나로 알리지 않는다 (UI-14). -->
  <p class="status">{stateToLabel(pushState)}</p>

  <!-- 프로그램 미선택 안내 (FR-33.7 / EC-77). -->
  <p
    class="need-program"
    data-push-need-program
    class:hidden={hasProgramSelected}
  >
    프로그램을 먼저 선택하세요
  </p>

  <!-- 시각 입력. 꺼져 있어도 쓸 수 있다 (FR-33.5). -->
  <label class="time">
    <span class="time-label">알림 시각</span>
    <input
      type="time"
      step="60"
      data-push-time
      value={pushRecord.value.notifyAt}
      onchange={onTimeChange}
      disabled={timeDisabled}
    />
  </label>

  <!-- 켜기/끄기/테스트 버튼. DOM 에 유지하고 CSS 로 숨긴다 (CLAUDE.md 접기 규약). -->
  <div class="buttons">
    <button
      type="button"
      class="btn primary"
      data-push-enable
      class:hidden={pushState === 'on'}
      onclick={onEnable}
      disabled={enableDisabled}
    >
      알림 켜기
    </button>

    <button
      type="button"
      class="btn"
      data-push-disable
      class:hidden={pushState !== 'on'}
      onclick={onDisable}
      disabled={disableDisabled}
    >
      알림 끄기
    </button>

    <button
      type="button"
      class="btn"
      data-push-test
      class:hidden={!(showTest && pushState === 'on')}
      onclick={onTest}
      disabled={testDisabled}
    >
      지금 푸시 보내기
    </button>
  </div>

  <!-- 오류 표시. 코드가 있으면 사실 문구로 (FR-33.8). -->
  {#if errorCode !== null}
    <p class="error" data-push-error={errorCode} role="alert">
      {errorToLabel(errorCode)}
    </p>
  {/if}
</section>

<style>
  /* 색 토큰은 `$lib/styles/app.css` 한 곳에서 가져온다 — 이 파일에 hex 없음. */

  .push {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1rem 0;
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--fg);
  }

  .status {
    margin: 0;
    font-size: 0.95rem;
    color: var(--fg);
  }

  .need-program {
    margin: 0;
    font-size: 0.9rem;
    color: var(--muted);
  }

  .time {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .time-label {
    font-size: 0.9rem;
    color: var(--muted);
  }
  .time input {
    min-height: 44px;
    padding: 0 0.6rem;
    font-size: 1rem;
    color: var(--fg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .time input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .buttons {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .btn {
    width: 100%;
    min-height: 44px;
    padding: 0 1rem;
    font-size: 0.95rem;
    color: var(--fg);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
  }
  .btn.primary {
    color: var(--bg);
    background: var(--fg);
    border-color: var(--fg);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /*
   * CLAUDE.md 접기 규약: `{#if}` 로 DOM 에서 빼지 않는다 — 하이드레이션·포커스 보호.
   * `visibility: hidden; position: absolute;` 로 공간도 흐름에서 뺀다 (버튼이 자리를
   * 차지한 채 비어 있으면 이상하다). 접근 보조에도 숨기도록 `visibility: hidden` 선택.
   */
  .hidden {
    visibility: hidden;
    position: absolute;
    pointer-events: none;
  }

  .error {
    margin: 0;
    padding: 0.6rem 0.8rem;
    font-size: 0.9rem;
    color: var(--danger);
    background: var(--danger-bg);
    border: 1px solid var(--danger);
    border-radius: 8px;
  }
</style>

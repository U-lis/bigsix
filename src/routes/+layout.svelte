<script lang="ts">
  /**
   * 루트 레이아웃 (FR-1.7 / FR-1.8 / FR-9 / FR-11).
   *
   * 부팅 시퀀스 실행 → 스토어에 심음 → 하단 3탭 네비 표시 →
   * 저장 실패 / 손상 / 미래 버전 배너 → 서비스 워커 등록.
   *
   * 부팅은 클라이언트 마운트 시점에만 실행한다 (localStorage 는 SSR 에 없다).
   * prerender=true 이므로 서버는 정적 HTML 만 낸다.
   */
  import { browser, dev } from '$app/environment';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { boot } from '$lib/ui/boot';
  import { appState } from '$lib/ui/state.svelte';
  import { inProgress } from '$lib/ui/session.svelte';
  import { todayClock } from '$lib/ui/today.svelte';
  import { sw } from '$lib/ui/sw.svelte';
  import Confirm from '$lib/ui/Confirm.svelte';

  let { children } = $props();
  let booted = $state(false);
  let showResetConfirm = $state(false);

  onMount(() => {
    if (!browser) return;
    todayClock.start();
    const result = boot(todayClock.today);
    appState.initFromBoot({
      state: result.state,
      storageStatus: result.storageStatus,
      futureVersion: result.futureVersion,
      corruptRaw: result.corruptRaw,
      readError: result.readError,
    });
    inProgress.init(result.inProgress);
    booted = true;

    // 첫 실행이면 시작 단계 선택 화면(steps) 으로 (FR-3.5, FR-3.6). 이미 그 화면이면 유지.
    // no-program 리다이렉트는 제거 (FR-17.1) — 오늘 화면이 안내 상태를 직접 말한다.
    if (result.needsFirstRun && page.url.pathname !== '/steps') {
      goto('/steps');
    }

    // 서비스 워커 등록 — dev 에서는 건너뜀 (sw.js 자체가 없어 404).
    if (document.readyState === 'complete') void sw.register();
    else window.addEventListener('load', () => void sw.register(), { once: true });
  });

  function resetInitial() {
    showResetConfirm = false;
    appState.resetToInitial();
    goto('/steps');
  }
</script>

<svelte:head>
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="theme-color" content="#111113" />
</svelte:head>

{#if booted}
  {#if appState.saveStatus === 'write-blocked'}
    <div class="banner err" role="alert">
      저장 실패 — 다음 조작이 반영되지 않을 수 있습니다. 저장 용량 또는 사생활 보호
      모드를 확인하세요.
    </div>
  {/if}

  {#if appState.storageStatus === 'corrupt'}
    <div class="banner warn" role="alert">
      저장 데이터가 손상되었습니다. 원본은 그대로 보존되어 있습니다.
      <button type="button" onclick={() => showResetConfirm = true}>초기 상태로 시작</button>
    </div>
  {/if}

  {#if appState.storageStatus === 'future-version'}
    <div class="banner warn" role="alert">
      알 수 없는 최신 버전(v{appState.futureVersion}) 의 저장 데이터를 발견했습니다.
      덮어쓰지 않기 위해 임시 상태로 실행 중입니다. 앱을 최신으로 갱신하세요.
    </div>
  {/if}

  {#if appState.storageStatus === 'read-blocked'}
    <div class="banner err" role="alert">
      저장소에 접근할 수 없습니다. 사생활 보호 모드이거나 브라우저 설정으로 차단되어
      있습니다. 이 세션의 조작은 유지되지 않습니다.
    </div>
  {/if}

  {#if inProgress.saveStatus === 'write-blocked'}
    <div class="banner err" role="alert">
      진행 중 세션 저장 실패 — 앱이 죽으면 지금까지의 세트를 잃을 수 있습니다.
    </div>
  {/if}
{/if}

<main class:booted>
  {@render children()}
</main>

<nav class="tabs" aria-label="화면 이동">
  <a href="/" class:active={page.url.pathname === '/'}>오늘</a>
  <a href="/programs" class:active={page.url.pathname === '/programs'}>프로그램</a>
  <a href="/steps" class:active={page.url.pathname === '/steps'}>단계</a>
</nav>

{#if showResetConfirm}
  <Confirm
    title="정말 초기 상태로 시작하시겠습니까?"
    body="현재 저장된 데이터는 보존되지만 새 초기 상태가 그 위에 저장됩니다. 이후 조작에서 원본에 접근할 수 없습니다."
    confirmLabel="초기 상태로 시작"
    onConfirm={resetInitial}
    onCancel={() => showResetConfirm = false}
  />
{/if}

<!-- dev 안내 (dev 에서만) -->
{#if dev && !booted}
  <p class="dev-note">부팅 중…</p>
{/if}

<style>
  :global(html, body) {
    background: #111113;
    color: #eee;
    margin: 0;
    padding: 0;
    font-family: system-ui, -apple-system, sans-serif;
    overflow-x: hidden;
  }
  :global(body[data-flash="on"]) {
    animation: flash 0.5s steps(2, end) infinite;
  }
  @keyframes flash {
    from { background: #111113; }
    to { background: #363; }
  }
  main { min-height: 100vh; padding-bottom: 4rem; }
  main:not(.booted) { visibility: hidden; }
  .banner {
    padding: 0.75rem 1rem;
    font-size: 0.9rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .banner button {
    min-height: 44px;
    padding: 0.5rem 1rem;
    background: #333;
    color: #eee;
    border: 1px solid #888;
    border-radius: 6px;
    cursor: pointer;
  }
  .banner.err { background: #422; color: #fcc; border-bottom: 1px solid #a66; }
  .banner.warn { background: #322; color: #fca; border-bottom: 1px solid #a86; }
  .tabs {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    background: #1a1a1a;
    border-top: 1px solid #333;
    z-index: 10;
  }
  .tabs a {
    flex: 1;
    text-align: center;
    padding: 0.85rem 0.25rem;
    color: #aaa;
    text-decoration: none;
    font-size: 0.9rem;
    min-height: 44px;
  }
  .tabs a.active { color: #fff; background: #222; border-top: 2px solid #6a6; padding-top: calc(0.85rem - 2px); }
  .dev-note { padding: 1rem; color: #999; }
</style>

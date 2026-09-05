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
  import { theme, THEME_LABEL } from '$lib/ui/theme.svelte';
  import { wakeLock } from '$lib/ui/wakelock.svelte';
  import { install } from '$lib/ui/install.svelte';
  import About from '$lib/ui/About.svelte';

  let { children } = $props();
  let booted = $state(false);
  let about = $state<ReturnType<typeof About> | undefined>();

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

    // 상단 바가 소비할 룬들의 리스너 초기화 (FR-16.2 / FR-16.5).
    wakeLock.start();
    install.start();

    // 첫 실행이면 시작 단계 선택 화면(steps) 으로 (FR-3.5, FR-3.6). 이미 그 화면이면 유지.
    // no-program 리다이렉트는 제거 (FR-17.1) — 오늘 화면이 안내 상태를 직접 말한다.
    if (result.needsFirstRun && page.url.pathname !== '/steps') {
      goto('/steps');
    }

    // 서비스 워커 등록 — dev 에서는 건너뜀 (sw.js 자체가 없어 404).
    if (document.readyState === 'complete') void sw.register();
    else window.addEventListener('load', () => void sw.register(), { once: true });
  });

  function openAbout() {
    about?.open();
  }
</script>

<svelte:head>
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="theme-color" content="#111113" />
</svelte:head>

<!-- FR-16.1 상단 바 — 하단 탭은 그대로 유지한다. -->
<header class="topbar" aria-label="앱 컨트롤">
  <span class="brand">bigsix</span>
  <div class="controls">
    {#if install.available}
      <!-- FR-16.2 / EC-31 — 프롬프트 없으면 안 그린다 (NFR-22). -->
      <button type="button" class="ctrl" onclick={() => void install.prompt()} aria-label="앱 설치">
        설치
      </button>
    {/if}
    <!-- FR-16.3 테마 토글. 항상 그린다 (지원 여부와 무관). -->
    <button type="button" class="ctrl" onclick={() => theme.cycle()}
            aria-label="테마 순환: 현재 {THEME_LABEL[theme.value]}">
      {THEME_LABEL[theme.value]}
    </button>
    {#if wakeLock.supported}
      <!-- FR-16.5 화면 유지. 지원 안 하면 안 그린다 (NFR-22 / EC-33).
           enabled / held 를 구분해 표시한다 (FR-16.7 / EC-34). -->
      <button type="button" class="ctrl"
              class:on={wakeLock.enabled}
              class:pending={wakeLock.enabled && !wakeLock.held}
              onclick={() => void wakeLock.toggle()}
              aria-label={wakeLock.enabled
                ? (wakeLock.held ? '화면 유지: 켜짐' : '화면 유지: 켜짐(대기 중)')
                : '화면 유지: 꺼짐'}>
        화면
      </button>
    {/if}
    <!-- FR-19.1 About 진입. -->
    <button type="button" class="ctrl" onclick={openAbout} aria-label="정보">
      정보
    </button>
  </div>
</header>

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
      <button type="button" onclick={openAbout}>초기 상태로 시작</button>
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

<!-- About 모달: 상단 바에서도, 손상 배너에서도 여는 진입점 (FR-19.4). -->
<About bind:this={about} />

<!-- dev 안내 (dev 에서만) -->
{#if dev && !booted}
  <p class="dev-note">부팅 중…</p>
{/if}

<style>
  /*
   * FR-16.4 CSS 이중 정의.
   *
   * 세 겹으로 나눠 놓아 테마 토글이 시스템 미디어 쿼리를 이긴다:
   * 1) `:root` — 라이트 팔레트 기본값.
   * 2) `@media (prefers-color-scheme: dark)` — 시스템이 다크면 다크 팔레트.
   * 3) `:root[data-theme="dark|light"]` — 사용자가 명시 선택하면 그 값이 이긴다.
   */
  :global(:root) {
    --bg: #fafafa;
    --fg: #111113;
    --muted: #666;
    --card-bg: #fff;
    --card-border: #ddd;
    --banner-err-bg: #fee;
    --banner-err-fg: #822;
    --banner-err-border: #c66;
    --banner-warn-bg: #ffd;
    --banner-warn-fg: #653;
    --banner-warn-border: #b93;
    --tab-bg: #f0f0f0;
    --tab-fg: #666;
    --tab-active-bg: #fff;
    --tab-active-fg: #111;
    --tab-active-mark: #6a6;
    --ctrl-bg: #eee;
    --ctrl-fg: #222;
    --ctrl-border: #bbb;
    --ctrl-on: #245;
    --ctrl-on-fg: #cfe;
  }
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme="light"])) {
      --bg: #111113;
      --fg: #eee;
      --muted: #999;
      --card-bg: #1a1a1a;
      --card-border: #333;
      --banner-err-bg: #422;
      --banner-err-fg: #fcc;
      --banner-err-border: #a66;
      --banner-warn-bg: #322;
      --banner-warn-fg: #fca;
      --banner-warn-border: #a86;
      --tab-bg: #1a1a1a;
      --tab-fg: #aaa;
      --tab-active-bg: #222;
      --tab-active-fg: #fff;
      --tab-active-mark: #6a6;
      --ctrl-bg: #222;
      --ctrl-fg: #ccc;
      --ctrl-border: #444;
      --ctrl-on: #245;
      --ctrl-on-fg: #cfe;
    }
  }
  :global(:root[data-theme="dark"]) {
    --bg: #111113;
    --fg: #eee;
    --muted: #999;
    --card-bg: #1a1a1a;
    --card-border: #333;
    --banner-err-bg: #422;
    --banner-err-fg: #fcc;
    --banner-err-border: #a66;
    --banner-warn-bg: #322;
    --banner-warn-fg: #fca;
    --banner-warn-border: #a86;
    --tab-bg: #1a1a1a;
    --tab-fg: #aaa;
    --tab-active-bg: #222;
    --tab-active-fg: #fff;
    --tab-active-mark: #6a6;
    --ctrl-bg: #222;
    --ctrl-fg: #ccc;
    --ctrl-border: #444;
    --ctrl-on: #245;
    --ctrl-on-fg: #cfe;
  }

  :global(html, body) {
    background: var(--bg);
    color: var(--fg);
    margin: 0;
    padding: 0;
    font-family: system-ui, -apple-system, sans-serif;
    overflow-x: hidden;
  }
  :global(body[data-flash="on"]) {
    animation: flash 0.5s steps(2, end) infinite;
  }
  @keyframes flash {
    from { background: var(--bg); }
    to { background: #363; }
  }
  main { min-height: 100vh; padding-bottom: 4rem; padding-top: 3rem; }
  main:not(.booted) { visibility: hidden; }

  /* FR-16.1 상단 바 */
  .topbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.75rem;
    background: var(--tab-bg);
    border-bottom: 1px solid var(--card-border);
    min-height: 3rem;
    z-index: 9;
  }
  .brand {
    font-weight: 600;
    color: var(--fg);
    font-size: 1rem;
  }
  .controls { display: flex; gap: 0.35rem; }
  .ctrl {
    min-height: 44px;
    min-width: 44px;
    padding: 0.35rem 0.65rem;
    background: var(--ctrl-bg);
    color: var(--ctrl-fg);
    border: 1px solid var(--ctrl-border);
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .ctrl.on {
    background: var(--ctrl-on);
    color: var(--ctrl-on-fg);
    border-color: var(--ctrl-on);
  }
  .ctrl.pending {
    opacity: 0.7;
  }

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
    background: var(--ctrl-bg);
    color: var(--ctrl-fg);
    border: 1px solid var(--ctrl-border);
    border-radius: 6px;
    cursor: pointer;
  }
  .banner.err {
    background: var(--banner-err-bg);
    color: var(--banner-err-fg);
    border-bottom: 1px solid var(--banner-err-border);
  }
  .banner.warn {
    background: var(--banner-warn-bg);
    color: var(--banner-warn-fg);
    border-bottom: 1px solid var(--banner-warn-border);
  }
  .tabs {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    background: var(--tab-bg);
    border-top: 1px solid var(--card-border);
    z-index: 10;
  }
  .tabs a {
    flex: 1;
    text-align: center;
    padding: 0.85rem 0.25rem;
    color: var(--tab-fg);
    text-decoration: none;
    font-size: 0.9rem;
    min-height: 44px;
  }
  .tabs a.active {
    color: var(--tab-active-fg);
    background: var(--tab-active-bg);
    border-top: 2px solid var(--tab-active-mark);
    padding-top: calc(0.85rem - 2px);
  }
  .dev-note { padding: 1rem; color: var(--muted); }
</style>

<script lang="ts">
  /**
   * 루트 레이아웃 (FR-1.7 / FR-1.8 / FR-9 / FR-11 / FR-16 / FR-19).
   *
   * 부팅 시퀀스 실행 → 스토어에 심음 → 상단 바 → 배너 → 하단 3탭 네비.
   *
   * 부팅은 클라이언트 마운트 시점에만 실행한다 (localStorage 는 SSR 에 없다).
   * prerender=true 이므로 서버는 정적 HTML 만 낸다.
   *
   * 상단 바는 CubeStudy 의 +layout.svelte 를 그대로 가져왔다 — 아이콘 3종,
   * pill 버튼, 라벨, 좁은 화면 접기까지 동일하다
   * (참조: ~/Documents/cube-study/src/routes/+layout.svelte:99~269).
   */
  import '$lib/styles/app.css';
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

<div class="shell">
  <!-- FR-16.1 상단 바 -->
  <div class="bar">
    {#if install.available}
      <!-- FR-16.2 / EC-31 — 프롬프트가 없으면 아예 안 그린다 (NFR-22). -->
      <button type="button" data-install onclick={() => void install.prompt()}>설치</button>
    {/if}
    {#if wakeLock.supported}
      <!-- 세션 도중 세트를 세느라 화면에 손이 안 닿아 꺼진다 (FR-16.5 / EC-33).
           enabled(켜두겠다) 와 held(실제로 잡혔다) 를 구분한다 (FR-16.7 / EC-34). -->
      <button
        type="button"
        data-wake-lock={wakeLock.enabled}
        class:on={wakeLock.enabled}
        class:pending={wakeLock.enabled && !wakeLock.held}
        onclick={() => void wakeLock.toggle()}
        aria-pressed={wakeLock.enabled}
        aria-label="화면 자동 꺼짐 방지"
        title={wakeLock.enabled
          ? wakeLock.held
            ? '화면을 켜둡니다'
            : '화면을 켜둡니다 (대기 중)'
          : '화면 자동 꺼짐 방지'}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <rect
            x="3"
            y="4"
            width="18"
            height="13"
            rx="2"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          />
          <path d="M9 21h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          {#if wakeLock.enabled}
            <circle cx="12" cy="10.5" r="2.5" fill="currentColor" />
          {/if}
        </svg>
        <!-- 아이콘만으로는 무슨 버튼인지 알 수 없다. 상태는 색이, 정체는 글자가 맡는다. -->
        <span class="btn-label">화면 켜기</span>
      </button>
    {/if}

    <!--
      아이콘으로 보여준다. '시스템' 이라는 글자만 있으면 테마 버튼인 줄 모르고
      시스템 정보를 보여주는 버튼으로 읽힌다.
    -->
    <button
      type="button"
      data-theme-toggle
      data-theme={theme.value}
      onclick={() => theme.cycle()}
      aria-label={`테마 전환 (현재 ${THEME_LABEL[theme.value]})`}
      title={`테마: ${THEME_LABEL[theme.value]}`}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        {#if theme.value === 'light'}
          <!-- 해 -->
          <circle cx="12" cy="12" r="4.5" fill="currentColor" />
          {#each [0, 45, 90, 135, 180, 225, 270, 315] as deg (deg)}
            <path
              d="M12 2.5v3"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              transform="rotate({deg} 12 12)"
            />
          {/each}
        {:else if theme.value === 'dark'}
          <!-- 달 -->
          <path
            d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"
            fill="currentColor"
            stroke="none"
          />
        {:else}
          <!-- 시스템: 반은 해, 반은 달 -->
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" />
          <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
        {/if}
      </svg>
      <span class="theme-label">{THEME_LABEL[theme.value]}</span>
    </button>
    <!-- FR-19.1 About 진입. -->
    <button type="button" data-about-open onclick={openAbout} aria-label="앱 정보">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
        <circle cx="12" cy="7.6" r="1.2" fill="currentColor" />
        <path d="M12 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </button>
  </div>

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

  <nav aria-label="화면 이동">
    <a href="/" class:on={page.url.pathname === '/'}>오늘</a>
    <a href="/programs" class:on={page.url.pathname === '/programs'}>프로그램</a>
    <a href="/steps" class:on={page.url.pathname === '/steps'}>단계</a>
  </nav>
</div>

<!-- About 모달: 상단 바에서도, 손상 배너에서도 여는 진입점 (FR-19.4). -->
<About bind:this={about} />

<!-- dev 안내 (dev 에서만) -->
{#if dev && !booted}
  <p class="dev-note">부팅 중…</p>
{/if}

<style>
  /* 색 토큰은 `$lib/styles/app.css` 한 곳에만 있다 (FR-16.4). 여기서 다시 정의하지 않는다. */
  :global(body[data-flash='on']) {
    animation: flash 0.5s steps(2, end) infinite;
  }
  @keyframes flash {
    from {
      background: var(--bg);
    }
    to {
      background: var(--ok-bg);
    }
  }

  .shell {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    max-width: 720px;
    margin: 0 auto;
  }
  .bar {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
    padding: 0.4rem 0.9rem 0;
  }
  /* 설치 버튼은 설치 가능할 때만 나타난다. 눈에 띄어야 하지만 강요하지 않는다. */
  .bar button[data-install] {
    color: var(--accent);
    border-color: var(--accent);
  }
  /* 켜져 있는 토글은 색으로 알린다. 아이콘만으로는 상태가 안 읽힌다. */
  .bar button.on {
    color: var(--accent);
    border-color: var(--accent);
  }
  /* 켜달라고 했으나 아직 못 잡은 상태 (절전 모드 등, EC-34). */
  .bar button.pending {
    opacity: 0.6;
  }
  .bar button svg {
    flex: none;
  }
  /*
   * 아이콘 옆 글자. 아이콘만으로는 무슨 버튼인지 알 수 없으므로 되도록 남긴다.
   * 330px 보다 좁을 때만 아이콘으로 접는다.
   */
  .theme-label,
  .btn-label {
    margin-left: 0.35rem;
    white-space: nowrap;
  }
  @media (max-width: 330px) {
    .theme-label,
    .btn-label {
      display: none;
    }
  }
  .bar button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 32px;
    padding: 0 0.6rem;
    font-size: 0.78rem;
    color: var(--muted);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 999px;
    cursor: pointer;
  }

  main {
    flex: 1;
    padding: 0 0.9rem 1rem;
  }
  main:not(.booted) {
    visibility: hidden;
  }

  .banner {
    margin: 0.5rem 0.9rem 0;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    font-size: 0.9rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .banner button {
    min-height: 44px;
    padding: 0.5rem 1rem;
    color: var(--fg);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
  }
  .banner.err {
    background: var(--danger-bg);
    color: var(--danger);
    border: 1px solid var(--danger);
  }
  .banner.warn {
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--accent);
  }

  nav {
    position: sticky;
    bottom: 0;
    display: flex;
    background: var(--surface);
    border-top: 1px solid var(--border);
  }
  nav a {
    flex: 1;
    min-height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.95rem;
    color: var(--muted);
    text-decoration: none;
  }
  nav a.on {
    color: var(--accent);
    font-weight: 600;
  }
  .dev-note {
    padding: 1rem;
    color: var(--muted);
  }
</style>

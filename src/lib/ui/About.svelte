<script lang="ts">
  /**
   * About 모달 (FR-19).
   *
   * CubeStudy 의 About.svelte 를 이식했다 — <dialog> 요소로 ESC 닫기와
   * 포커스 트랩을 브라우저에 위임한다 (FR-19.1).
   *
   * 표시 항목 (FR-19.2): 이름, 제작자, 버전(__APP_VERSION__), 커밋(__COMMIT_HASH__).
   * 업데이트 확인 (FR-19.3): sw.checkNow() 호출.
   * 전체 데이터 초기화 (FR-19.4): 2단계 확인 후 실행.
   */
  import { goto } from '$app/navigation';
  import { sw } from './sw.svelte.ts';
  import {
    nextResetState, isResetReady, performReset, type ResetState,
  } from './reset.ts';

  let dialog: HTMLDialogElement | undefined = $state();

  const APP_NAME = 'bigsix';
  // cube-study 와 같은 표기를 쓴다. 이메일 주소에서 유추한 문자열을 쓰지 않는다.
  const AUTHOR = 'ulismoon';

  const info = [
    { label: '제작자', value: AUTHOR },
    { label: '버전', value: __APP_VERSION__ },
    { label: '커밋', value: __COMMIT_HASH__ },
  ];

  // 2단계 확인 상태.
  let resetState = $state<ResetState>('idle');

  function onResetClick() {
    if (isResetReady(resetState, 'click')) {
      performReset();
      resetState = 'idle';
      dialog?.close();
      goto('/steps');
      return;
    }
    resetState = nextResetState(resetState, 'click');
  }

  export function open() {
    dialog?.showModal();
  }
</script>

<dialog
  bind:this={dialog}
  data-about
  onclick={(e) => e.target === dialog && dialog.close()}
  onclose={() => (resetState = 'idle')}
>
  <div class="body">
    <h2 data-info="이름">{APP_NAME}</h2>
    <dl>
      {#each info as row (row.label)}
        <dt>{row.label}</dt>
        <dd data-info={row.label}>{row.value}</dd>
      {/each}
    </dl>

    <!-- FR-19.3: 자동 갱신이 막혔을 때 빠져나올 구멍. -->
    <button
      type="button"
      class="check"
      data-check-update
      onclick={() => void sw.checkNow()}
      disabled={sw.checking}
    >
      {sw.checking ? '확인 중' : '업데이트 확인'}
    </button>
    {#if sw.message !== null}
      <p class="msg" data-update-message>{sw.message}</p>
    {/if}

    <!-- FR-19.4: 전체 데이터 초기화. 2단계 확인. -->
    {#if resetState === 'idle'}
      <button type="button" class="reset" data-reset="idle" onclick={onResetClick}>
        전체 데이터 초기화
      </button>
    {:else}
      <button type="button" class="reset confirming" data-reset="confirming" onclick={onResetClick}>
        정말 초기화합니다 (되돌릴 수 없음)
      </button>
    {/if}

    <p class="copyright">MIT License · © 2026 ulismoon</p>
    <button type="button" data-about-close class="close" onclick={() => dialog?.close()}>닫기</button>
  </div>
</dialog>

<style>
  dialog {
    width: min(22rem, calc(100vw - 2rem));
    padding: 0;
    color: var(--fg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.5);
  }
  .body {
    padding: 1.1rem;
  }
  h2 {
    margin: 0 0 0.8rem;
    font-family: var(--mono);
    font-size: 1.3rem;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.4rem 0.9rem;
    margin: 0;
  }
  dt {
    font-size: 0.82rem;
    color: var(--muted);
  }
  dd {
    margin: 0;
    font-family: var(--mono);
    font-size: 0.9rem;
    word-break: break-all;
  }
  .check {
    margin-top: 1rem;
    color: var(--fg);
    background: transparent;
    border: 1px solid var(--border);
  }
  .check:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .msg {
    margin: 0.5rem 0 0;
    font-size: 0.78rem;
    color: var(--muted);
  }
  /*
   * FR-19.4 전체 초기화. idle 은 업데이트 확인 버튼과 시각적으로 대등하되 문구가
   * 파괴적 동작임을 알린다. confirming 은 insert 색으로 경고를 준다.
   */
  .reset {
    margin-top: 0.5rem;
    color: var(--fg);
    background: transparent;
    border: 1px solid var(--border);
  }
  .reset.confirming {
    color: var(--bg);
    background: var(--insert);
    border-color: var(--insert);
  }
  .copyright {
    margin: 0.9rem 0;
    font-size: 0.75rem;
    color: var(--muted);
  }
  button {
    width: 100%;
    min-height: 44px;
    font-size: 0.95rem;
    color: var(--bg);
    background: var(--fg);
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }
</style>

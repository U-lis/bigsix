<!--
  짧은 알림. 스스로 사라지고, 탭하면 즉시 닫힌다.
  화면을 가리지 않도록 하단 네비 위에 띄운다.

  판단 기준:
  - 지나가도 되는 알림(sw 갱신 완료 등) → 이 컴포넌트
  - 사라지면 안 되는 상태(저장 실패·손상·미래 버전) → +layout 의 .banner 유지

  참조: `~/Documents/cube-study/src/lib/ui/Toast.svelte`.
-->
<script lang="ts">
  interface Props {
    text: string;
    onclose: () => void;
    duration?: number;
  }
  let { text, onclose, duration = 4000 }: Props = $props();

  $effect(() => {
    const t = setTimeout(onclose, duration);
    return () => clearTimeout(t);
  });
</script>

<button type="button" class="toast" data-toast onclick={onclose}>{text}</button>

<style>
  .toast {
    position: fixed;
    left: 50%;
    /* 하단 네비 52px 위에 얹는다. iOS 홈 인디케이터 여유는 safe-area 로 밀린다. */
    bottom: calc(52px + 0.7rem + env(safe-area-inset-bottom, 0px));
    z-index: 10;
    transform: translateX(-50%);
    max-width: min(22rem, calc(100vw - 2rem));
    padding: 0.6rem 0.9rem;
    font-family: var(--sans);
    font-size: 0.85rem;
    text-align: left;
    color: var(--bg);
    background: var(--fg);
    border: none;
    border-radius: 999px;
    box-shadow: 0 2px 12px rgb(0 0 0 / 0.25);
    cursor: pointer;
  }
</style>

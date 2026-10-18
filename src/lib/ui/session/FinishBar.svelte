<script lang="ts">
  /**
   * 「오늘 운동 마치기」 영역 (SPEC5 FR-42.1~2 · UI-18 · ADR-46).
   *
   * 종목 카드의 「세션 완료 기록」 을 대신한다 — 오늘 화면 하단, 「자유 운동 기록」
   * 위 페이지 흐름 안에 자리한다. sticky 가 아니다 (ADR-46).
   *
   * 활성 조건 (FR-42.2):
   *   - 하나라도 세트가 쌓인 칸이 있다
   *   - 또는 하나라도 abandoned === true 로 표시된 칸이 있다
   * 비활성은 「투명도 + 커서 + `disabled`」 로 표시한다 (CLAUDE.md 잠금 규칙).
   */
  interface Props {
    enabled: boolean;
    onOpen: () => void;
  }
  let { enabled, onOpen }: Props = $props();
</script>

<div class="bar" data-finish-bar>
  <button
    type="button"
    class="finish"
    data-finish
    disabled={!enabled}
    onclick={onOpen}
  >오늘 운동 마치기</button>
</div>

<style>
  .bar {
    margin: 1.25rem 0 0.5rem;
    display: flex;
    justify-content: center;
  }
  .finish {
    min-height: 52px;
    min-width: 44px;
    padding: 0.85rem 1.5rem;
    background: var(--accent);
    color: var(--bg);
    border: 1px solid var(--accent);
    border-radius: 8px;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 600;
  }
  .finish[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>

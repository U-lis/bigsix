<script module lang="ts">
  /**
   * 화면 4 — 기록 (FR-23). Phase 2 시점의 stub.
   *
   * 실제 내용(날짜별 목록·종목별 추이·내보내기·가져오기)은 Phase 4~7 에서 채운다.
   * 지금은 하단 네비의 4번째 탭이 이 경로로 이동해 「기록」 화면이 뜨는지만
   * 확인할 수 있으면 된다.
   *
   * 루트 `+layout.ts` 가 이미 `prerender = true` 를 세팅했지만, 이 화면이 정적
   * 파일로 만들어져야 한다는 사실을 파일 자체에서도 명시한다.
   */
  export const prerender = true;
</script>

<h1>기록</h1>
<p class="note">준비 중입니다.</p>

<style>
  .note {
    color: var(--muted);
  }
</style>

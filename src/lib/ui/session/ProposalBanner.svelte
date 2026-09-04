<script lang="ts">
  /**
   * 전환 제안 배너 (FR-5.7).
   * `proposal` 이 pending 이면 승인/거절 두 동작을 제공한다.
   */
  import type { SwitchProposal, Catalog } from '../../domain/types.ts';
  import { getProgram } from '../../domain/schedule.ts';

  interface Props {
    proposal: SwitchProposal;
    catalog: Catalog;
    onAccept: () => void;
    onDecline: () => void;
  }
  let { proposal, catalog, onAccept, onDecline }: Props = $props();

  let fromKo = $derived(getProgram(catalog, proposal.fromProgramId).name.ko);
  let toKo = $derived(getProgram(catalog, proposal.toProgramId).name.ko);
</script>

<div class="banner">
  <p><strong>다음 프로그램으로 전환 제안</strong></p>
  <p>{fromKo} → {toKo} ({proposal.proposedAt})</p>
  <div class="row">
    <button type="button" class="accept" onclick={onAccept}>승인</button>
    <button type="button" class="decline" onclick={onDecline}>거절</button>
  </div>
</div>

<style>
  .banner {
    border: 1px solid #4a6;
    background: #132;
    color: #eee;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
  }
  .banner p { margin: 0 0 0.5rem; }
  .row { display: flex; gap: 0.5rem; }
  button {
    min-height: 44px;
    min-width: 44px;
    padding: 0.75rem 1.25rem;
    border-radius: 6px;
    border: 1px solid #666;
    cursor: pointer;
    font-size: 1rem;
  }
  .accept { background: #253; color: #eee; }
  .decline { background: #333; color: #ccc; }
</style>

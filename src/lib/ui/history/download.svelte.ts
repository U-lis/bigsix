/**
 * 파일 저장 얇은 층 (FR-26.5 · EC-61 · RISK-5).
 *
 * 시도 순서:
 *   1. `Blob` + `URL.createObjectURL` + `<a download>` 클릭 → `revokeObjectURL`.
 *   2. Web Share API (`navigator.canShare({ files: [...] })` 가 true 이면
 *      `navigator.share({ files: [...] })`).
 *   3. 둘 다 실패 시 `'unavailable'`.
 *
 * 두 단계 모두 **사전 판정 + 예외 catch 두 겹** 이다 (RISK-5) — 브라우저가 API 를
 * 노출은 해도 실제로는 안 되는 케이스(iOS Safari 의 `<a download>` 무시, 원치
 * 않는 사용자 취소 등)를 안전하게 다음 단계로 흘린다.
 *
 * 룬(`$state`) 을 쓰지 않는다 — 이 함수 자체는 상태를 소유하지 않는다.
 * 파일 확장자 `.svelte.ts` 는 규약(ADR-26) 상 UI 층에 놓이는 파일을 뜻할 뿐,
 * 실제 룬 사용은 없어도 무방하다.
 */

export type SaveResult = 'downloaded' | 'shared' | 'unavailable';

export interface SaveFileArgs {
  /** `bigsix-YYYY-MM-DD.json` 등. `todayClock.today` + 확장자로 컴포넌트가 만든다. */
  name: string;
  /** `application/json` 또는 `text/csv;charset=utf-8`. */
  mime: string;
  /** 파일 본문. */
  content: string;
}

/**
 * `<a download>` 이 실제로 동작하는 환경인지 사전 판정.
 * 모바일 사파리처럼 `download` 속성 자체를 무시하는 환경이면 false 를 돌려준다.
 */
function canDownloadAnchor(): boolean {
  if (typeof document === 'undefined') return false;
  if (typeof Blob === 'undefined') return false;
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  try {
    const a = document.createElement('a');
    // `download` 속성이 지원되면 in 검사에서 true 다.
    return 'download' in a;
  } catch {
    return false;
  }
}

/**
 * Web Share API 가 파일을 공유할 수 있는지 사전 판정.
 * `canShare({ files: [...] })` 는 iOS Safari 와 최신 안드로이드에서만 true 다.
 */
function canShareFile(file: File): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.share !== 'function') return false;
  // canShare 는 옵셔널이지만 files 지원 여부는 이 함수로만 확인 가능.
  const canShare = (navigator as Navigator & { canShare?: (data: ShareData) => boolean }).canShare;
  if (typeof canShare !== 'function') return false;
  try {
    return canShare.call(navigator, { files: [file] });
  } catch {
    return false;
  }
}

/**
 * 1) `<a download>` 다운로드. 성공하면 `'downloaded'`, 실패하면 null.
 * 실패 사유(예외)는 다음 단계에서 로그로만 보고 계속 진행한다.
 */
function tryDownloadAnchor(args: SaveFileArgs): SaveResult | null {
  if (!canDownloadAnchor()) return null;
  let url: string | null = null;
  try {
    const blob = new Blob([args.content], { type: args.mime });
    url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = args.name;
    // 일부 환경에서 body 에 붙여야 클릭이 먹는다.
    a.style.display = 'none';
    document.body.appendChild(a);
    try {
      a.click();
    } finally {
      document.body.removeChild(a);
    }
    return 'downloaded';
  } catch {
    return null;
  } finally {
    if (url !== null) {
      try { URL.revokeObjectURL(url); } catch { /* revoke 실패는 무시 */ }
    }
  }
}

/**
 * 2) Web Share API. 사전 판정과 예외 catch 를 함께 건다.
 * 사용자가 공유 다이얼로그를 취소한 경우도 예외(AbortError)로 온다 — 다음 단계로 넘긴다.
 */
async function tryShareFile(args: SaveFileArgs): Promise<SaveResult | null> {
  if (typeof File === 'undefined' || typeof Blob === 'undefined') return null;
  let file: File;
  try {
    file = new File([args.content], args.name, { type: args.mime });
  } catch {
    return null;
  }
  if (!canShareFile(file)) return null;
  try {
    await navigator.share({ files: [file] });
    return 'shared';
  } catch {
    return null;
  }
}

/**
 * 파일을 저장한다. 두 경로 모두 실패하면 `'unavailable'` (EC-61).
 * 이 함수는 상태를 바꾸지 않는다 (FR-26.6) — 데이터를 읽기만 한다.
 */
export async function saveFile(args: SaveFileArgs): Promise<SaveResult> {
  const downloaded = tryDownloadAnchor(args);
  if (downloaded !== null) return downloaded;
  const shared = await tryShareFile(args);
  if (shared !== null) return shared;
  return 'unavailable';
}

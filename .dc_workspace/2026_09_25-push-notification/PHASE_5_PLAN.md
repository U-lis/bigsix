# Phase 5 — 알림 설정 UI (About 알림 섹션)

**목표**
FR-32 · UI-12~16. About 모달에 알림 섹션을 얹고, 감지·구독 로직을 순수 함수(`pushSupport.ts`) + 룬 스토어(`push.svelte.ts`) 로 나눈다. Phase 4 완료 후이므로 실제 서버에 subscribe 가 통한다. **재등록 후크(FR-33)는 Phase 6 에서.**

## SPEC 참조

- FR-32.1~6: About 알림 섹션 · 권한 상태 · 구독 상태 · 시각 선택 · 켜기/끄기 · 저장 별도 키.
- FR-33.1·2·4: 구독 등록 · 해지 흐름 · 실패 표시.
- FR-38 은 Phase 1 완료.
- UI-12~16: `<dl>`·`<button>` 패턴, 라벨+아이콘, 시각 선택기 활성화 규칙, `data-push-*` 훅, iOS 안내 (`install.svelte.ts` 연동 없음, ADR-34).
- ADR-34 (감지), ADR-36 (`bigsix.push` 저장), ADR-37 (재등록 진입점은 Phase 6 에서 후크).
- EC-74~79: 권한 거부/철회, 미지원, iOS 미설치, 프로그램 미선택.

## 변경 파일

| 파일 | 편집 종류 | 내용 |
|---|---|---|
| `src/lib/data/vapid.ts` | 신규 | `VAPID_PUBLIC_KEY` 상수 (Phase 4 발급 값 반영) |
| `src/lib/ui/shell/pushSupport.ts` | 신규 | `isPushSupported`, `isStandalone`, `isIos`, `pushBlocker` (순수 함수) |
| `src/lib/ui/shell/pushStore.ts` | 신규 | `bigsix.push` 봉투 load/save/emptyStore + shape 검증 (순수) |
| `src/lib/ui/shell/push.svelte.ts` | 신규 | 룬 스토어 — 권한 상태 · 구독 상태 · `enable` · `disable` · `setNotifyAt` |
| `src/lib/ui/state/reset.ts` | 편집 | `performReset` 이 `bigsix.push` 도 지움 |
| `src/lib/ui/shell/About.svelte` | 편집 | 알림 섹션 (권한/상태/시각/버튼) |
| `src/routes/+layout.svelte` | 편집 | onMount 에서 `push.init()` 부팅 |
| `tests/unit/pushSupport.test.ts` | 신규 | 감지 유틸 (mock UA · matchMedia) |
| `tests/unit/pushStore.test.ts` | 신규 | 봉투 load/save/shape 검증 |
| `tests/unit/push.svelte.test.ts` | 신규 | 스토어 상태 전이 (모의 PushManager · fetch) |
| `tests/unit/structure.test.ts` | 편집 | LAYER_ROOTS 규약 무변경 확인 (`src/lib/ui/shell/` 안 새 파일 3개) |

## `pushSupport.ts` 초안 (순수)

```ts
export function isPushSupported(): boolean {
  return 'PushManager' in globalThis
    && 'Notification' in globalThis
    && 'serviceWorker' in navigator;
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mm = window.matchMedia?.('(display-mode: standalone)');
  if (mm?.matches === true) return true;
  const nav = navigator as { standalone?: boolean };
  return nav.standalone === true;
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}

export type Blocker = 'none' | 'unsupported' | 'ios-not-installed';

export function pushBlocker(): Blocker {
  if (isPushSupported()) return 'none';
  if (isIos() && !isStandalone()) return 'ios-not-installed';
  return 'unsupported';
}
```

## `pushStore.ts` (봉투) 초안

```ts
export const PUSH_KEY = 'bigsix.push';
export const PUSH_SCHEMA_VERSION = 1;

export interface PushEnvelope {
  schemaVersion: 1;
  push: {
    enabled: boolean;
    notifyAt: string | null;      // "HH:MM"
    endpoint: string | null;
    lastError: string | null;
    updatedAt: string;
  };
}

export function emptyPush(): PushEnvelope['push'] {
  return { enabled: false, notifyAt: null, endpoint: null, lastError: null, updatedAt: new Date(0).toISOString() };
}

export function readPush(store: Pick<Storage, 'getItem'>): PushEnvelope['push'] {
  try {
    const raw = store.getItem(PUSH_KEY);
    if (raw === null) return emptyPush();
    const parsed = JSON.parse(raw) as unknown;
    if (!isPushEnvelope(parsed)) return emptyPush();
    return parsed.push;
  } catch { return emptyPush(); }
}

export function writePush(store: Pick<Storage, 'setItem'>, push: PushEnvelope['push']): void {
  const env: PushEnvelope = { schemaVersion: 1, push };
  store.setItem(PUSH_KEY, JSON.stringify(env));
}

export function clearPush(store: Pick<Storage, 'removeItem'>): void {
  store.removeItem(PUSH_KEY);
}

function isPushEnvelope(v: unknown): v is PushEnvelope { /* shape 검사 */ }
```

- 저장 실패는 던지지 않고 no-op (기존 `storage.ts` 관용 답습). About 화면이 저장 실패를 배너로 보여줄 필요는 없다 — 알림은 부수 기능.

## `push.svelte.ts` (룬 스토어) 초안

**공개 API** (Phase 6 재등록도 이 클래스에 얹는다 — 지금은 `enable`, `disable`, `setNotifyAt`, `init` 만):

```ts
import { currentStint } from '$lib/domain';
import { appState } from '$lib/ui/state/state.svelte';
import { VAPID_PUBLIC_KEY } from '$lib/data/vapid';
import { readPush, writePush, clearPush, emptyPush } from './pushStore';
import { pushBlocker, type Blocker } from './pushSupport';

export type PushStatus = 'on' | 'off' | 'blocked' | 'unsupported' | 'ios-not-installed' | 'no-program';

class PushStore {
  permission = $state<NotificationPermission>('default');
  #push = $state(emptyPush());
  #blocker = $state<Blocker>('none');
  lastError = $state<string | null>(null);

  init(): void {
    if (typeof window === 'undefined') return;
    this.#blocker = pushBlocker();
    if ('Notification' in globalThis) this.permission = Notification.permission;
    if (this.#blocker !== 'none') return;
    this.#push = readPush(localStorage);
  }

  get enabled(): boolean { return this.#push.enabled; }
  get notifyAt(): string | null { return this.#push.notifyAt; }
  get endpoint(): string | null { return this.#push.endpoint; }
  get blocker(): Blocker { return this.#blocker; }

  get status(): PushStatus {
    if (this.#blocker === 'ios-not-installed') return 'ios-not-installed';
    if (this.#blocker === 'unsupported') return 'unsupported';
    if (this.permission === 'denied') return 'blocked';
    if (currentStint(appState.value) === null) return 'no-program';
    return this.#push.enabled ? 'on' : 'off';
  }

  async enable(notifyAt: string): Promise<void> {
    // 1) 권한 요청 (사용자 제스처 하에서만 호출됨)
    if (this.permission === 'default') {
      this.permission = await Notification.requestPermission();
    }
    if (this.permission !== 'granted') { this.lastError = 'permission-denied'; return; }

    // 2) programId 확보 — ADR-21 · ADR-37 규약: currentStint 로만
    const stint = currentStint(appState.value);
    if (stint === null) { this.lastError = 'no-program'; return; }

    // 3) 브라우저 구독 생성
    const reg = await navigator.serviceWorker.ready;
    let sub;
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8(VAPID_PUBLIC_KEY),
      });
    } catch { this.lastError = 'subscribe-failed'; return; }

    // 4) 서버 등록
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const body = {
      endpoint: sub.endpoint,
      keys: { p256dh: btoaBase64Url(sub.getKey('p256dh')), auth: btoaBase64Url(sub.getKey('auth')) },
      programId: stint.programId,
      notifyAt, tz,
    };
    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`server ${res.status}`);
    } catch {
      await sub.unsubscribe().catch(() => {});
      this.lastError = 'server-unreachable'; return;
    }

    // 5) 로컬 저장
    this.#push = { enabled: true, notifyAt, endpoint: sub.endpoint, lastError: null, updatedAt: new Date().toISOString() };
    this.lastError = null;
    writePush(localStorage, this.#push);
  }

  async disable(): Promise<void> {
    const endpoint = this.#push.endpoint;
    if (endpoint !== null) {
      try {
        await fetch('/api/push/subscribe', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
      } catch { /* 서버 도달 불가여도 로컬은 정리 */ }
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
    } catch { /* 무시 */ }
    this.#push = emptyPush();
    this.lastError = null;
    clearPush(localStorage);
  }

  async setNotifyAt(hhmm: string): Promise<void> {
    if (!this.#push.enabled) return;
    this.#push = { ...this.#push, notifyAt: hhmm, updatedAt: new Date().toISOString() };
    writePush(localStorage, this.#push);
    // 재등록은 Phase 6 에서 얹는다. 이 페이즈에서는 로컬만 갱신.
  }
}

export const push = new PushStore();
```

**주의**
- `currentStint` 는 `$lib/domain` 에서만 부른다 (ADR-21). `appState.value.stints[...]` 식 접근 0건 — 검증은 `tests/unit/structure.test.ts` grep.
- `Notification.requestPermission()` 은 promise 반환 형이 표준. 구형 콜백 형은 지원하지 않는다 (SPEC 명시 목표 iOS 16.4+ · 최신 Chrome/Firefox).

## About.svelte 편집 (요지)

기존 순서(앱 정보 → 업데이트 확인 → 초기화) 사이에 **알림** 절 삽입 (FR-32.1: 앱정보 → 업데이트 → **알림** → 초기화).

```svelte
<!-- 알림 섹션 -->
<section class="push" data-push-status={push.status}>
  <h3>알림</h3>
  <dl>
    <dt>권한</dt>
    <dd data-push-permission={push.permission}>
      {#if push.permission === 'default'}아직 허용 안 함
      {:else if push.permission === 'granted'}허용됨
      {:else}거부됨 (브라우저 설정에서 변경){/if}
    </dd>
    <dt>상태</dt>
    <dd>
      {#if push.status === 'unsupported'}이 브라우저는 푸시 알림을 지원하지 않습니다
      {:else if push.status === 'ios-not-installed'}홈 화면에 추가 후 이 기능을 쓸 수 있습니다
      {:else if push.status === 'no-program'}프로그램을 먼저 선택하세요
      {:else if push.status === 'on'}알림 켜져 있음
      {:else if push.status === 'blocked'}브라우저 설정에서 허용해주세요
      {:else}알림 꺼져 있음{/if}
    </dd>
  </dl>

  {#if push.status === 'on' || push.status === 'off'}
    <label class="time" data-push-notify-at={notifyAt}>
      <span>알림 시각</span>
      <input
        type="time"
        bind:value={notifyAt}
        disabled={!push.enabled}
        onchange={() => void push.setNotifyAt(notifyAt)}
      />
    </label>
  {/if}

  {#if push.status === 'off'}
    <button type="button" data-push-enable onclick={() => void push.enable(notifyAt)}>
      알림 켜기
    </button>
  {:else if push.status === 'on'}
    <button type="button" data-push-disable onclick={() => void push.disable()}>
      알림 끄기
    </button>
  {/if}

  {#if push.lastError !== null}
    <p class="err" data-push-error={push.lastError}>
      {#if push.lastError === 'permission-denied'}권한이 거부되었습니다
      {:else if push.lastError === 'subscribe-failed'}브라우저 구독 실패
      {:else if push.lastError === 'server-unreachable'}서버에 연결할 수 없습니다{/if}
    </p>
  {/if}
</section>
```

- `notifyAt` 은 컴포넌트 안 룬 로컬 (`$state<string>(push.notifyAt ?? '19:00')`), input change 시 push.setNotifyAt.
- 스타일은 기존 `dl/dd/button` 패턴 재사용 — 새 CSS 는 여백/구분선 정도만.

## `+layout.svelte` 편집

`onMount` 안 `install.start()` 다음 줄에 `push.init()` 추가. push 는 `boot` 이후에 부팅되어 `currentStint` 를 안전하게 부른다 (booted 순서 존중).

```ts
wakeLock.start();
install.start();
push.init();
```

## `reset.ts` 편집

`performReset` 마지막 부분에 `clearPush(localStorage)` 한 줄 추가. 「전체 데이터 초기화」 (FR-19.4) 시 알림 설정도 함께 지워지도록.

## 커밋 경계 (3개)

### (a) `feat(push): pushSupport · pushStore · vapid 공개키`

- `src/lib/data/vapid.ts`, `src/lib/ui/shell/pushSupport.ts`, `src/lib/ui/shell/pushStore.ts` 신규.
- `tests/unit/pushSupport.test.ts`, `tests/unit/pushStore.test.ts` 신규.
- `pnpm test` 797 → 797 + N (신규 8~12 케이스).

### (b) `feat(push): 룬 스토어 · About 알림 섹션`

- `src/lib/ui/shell/push.svelte.ts` 신규.
- `src/lib/ui/shell/About.svelte` 편집 (알림 섹션).
- `src/routes/+layout.svelte` 편집 (`push.init()`).
- `src/lib/ui/state/reset.ts` 편집 (`clearPush`).
- `tests/unit/push.svelte.test.ts` 신규 — happy-dom + PushManager mock.
- 실제 서버에 fetch 하는 경로는 tests 에서 `fetch` mock.

### (c) `test(structure): $lib/domain 경유 규약 확인 (`push.svelte.ts`)`

- `tests/unit/structure.test.ts` 편집: `push.svelte.ts` 가 `appState.value.stints` 등 내부 필드에 접근하지 않고 `currentStint` 만 부르는지 grep 규칙 추가. 규약 위반 시 실패.

## 완료 기준

- 커밋 a~c 전부에서 `pnpm check` 0/0, `pnpm test` 통과. 앱 tests 수 797 → ≥ 809.
- `bash tests/server/run.sh` 통과 그대로 (변화 없어야 함).
- `bash tests/deploy/run.sh` 통과 그대로.
- **실물 확인 (홈서버 배포 후)**:
  - Chrome for Android · 설치된 PWA 에서 About 열기 → 알림 섹션 표시.
  - 「알림 켜기」 → 권한 프롬프트 → granted 후 구독 등록. `journalctl -u bigsix-api` 에 `POST /subscribe 201`.
  - 「알림 시각」 을 오늘 시각 몇 분 후로 설정 → Phase 6 재등록 후크가 없으므로 이 페이즈에서는 시각 변경이 서버에 반영되지 않고 로컬만 갱신. (Phase 6 완료 후 실물 발송 검증 재수행)
  - iOS Safari 탭에서 About 열기 → "홈 화면에 추가 후 이 기능을 쓸 수 있습니다" 표시.

## 위험

- **RISK-3** (`programId` 내부 접근 유혹): `push.svelte.ts` 가 `appState.value` 를 직접 만지는 실수 방지. 구조 검사(c) 로 잡는다.
- **PushManager · Notification mock**: happy-dom 은 기본 미제공. 각 test 에서 `globalThis.PushManager = ...` 로 stub. 실제 통합은 브라우저에서만.
- **VAPID 공개키 재빌드 필요**: 최초 발급 후 `src/lib/data/vapid.ts` 값이 placeholder 이면 실제 구독이 실패. Phase 5 커밋 (a) 는 Phase 4 배포 후에 진행해 실제 값으로 커밋.
- **`push.setNotifyAt` 재등록 미포함**: 이 페이즈에서는 로컬만 갱신하고 서버 재등록은 Phase 6. 시각을 바꿔도 이 시점에는 발송이 이전 값 기준. 이 사실을 커밋 메시지에 명시.

## 임시 배포

이 페이즈에 포함하지 않는다. Phase 6 완료 후 UI 통합 검증까지 마친 뒤 재배포.

# Phase 6 — 재등록 통합 (프로그램·제안·시각 후크)

**목표**
FR-33.3. 네 트리거(프로그램 선택 · 수동 전환 · 제안 승인 · 알림 시각 변경) 가 하나의 진입점(`push.reregister`) 을 부른다. UI 파일 두 곳(`routes/programs/+page.svelte`, `routes/+page.svelte`) 에 최소 후크만 삽입. FR-33.4 재등록 실패 표시 완결.

## SPEC 참조

- FR-33.3.a: `programs/+page.svelte:27` `selectProgram` 뒤. GLOBAL ADR-37 확장 — `switchProgram` 뒤에도 후크 (두 자리).
- FR-33.3.b: `programs/+page.svelte:39` `switchProgram` (`confirmSwitch`) 뒤. SPEC 신규 트리거.
- FR-33.3.c: `+page.svelte:62` `acceptProposal` 뒤.
- FR-33.3.d: About 시각 변경 시 재등록 (Phase 5 는 로컬만 갱신했음).
- FR-33.4 · EC-80: 재등록 실패 → 알림 꺼진 상태로 되돌리고 About 에 실패 표시. 이전 endpoint 는 서버가 다음 410/404 에서 정리.
- ADR-37 (단일 진입점, 두 UI 파일 후크, 도메인 공개 API 경유).

## 변경 파일

| 파일 | 편집 종류 | 내용 |
|---|---|---|
| `src/lib/ui/shell/push.svelte.ts` | 편집 | `reregister()` 메서드 추가. `setNotifyAt` 에서 재등록 부름 |
| `src/routes/programs/+page.svelte` | 편집 | `onSelect` (미선택 브랜치) · `confirmSwitch` 두 곳에서 `push.reregister()` 호출 |
| `src/routes/+page.svelte` | 편집 | `onAccept` 에서 `push.reregister()` 호출 |
| `tests/unit/push.svelte.test.ts` | 편집 | `reregister` 케이스 추가. setNotifyAt 이 서버 재등록 부르는지 확인 |
| `tests/unit/structure.test.ts` | 편집 (선택) | 라우트 파일에서 `push.enable/disable/subscribe` 를 직접 부르지 않고 `push.reregister` 만 부르는지 grep (선택 강화) |

## `push.reregister()` 초안

```ts
async reregister(): Promise<void> {
  // FR-33.3: enabled 아니면 아무 것도 하지 않는다 (사용자가 켜지 않은 상태).
  if (!this.#push.enabled) return;

  // programId 는 도메인 공개 API 로만 (ADR-21 · ADR-37).
  const stint = currentStint(appState.value);
  const notifyAt = this.#push.notifyAt;
  if (stint === null || notifyAt === null) {
    // 프로그램이 사라졌거나 시각이 없다 — 상태 안전화.
    await this.disable();
    this.lastError = 'no-program';
    return;
  }

  const prevEndpoint = this.#push.endpoint;

  // 1) 기존 구독 정리 (같은 기기에 중복 방지, FR-33.3 문구).
  try {
    if (prevEndpoint !== null) {
      await fetch('/api/push/subscribe', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: prevEndpoint }),
      });
    }
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
  } catch { /* 이전 endpoint 정리 실패는 흐름을 막지 않는다 — 다음 410 에서 서버가 정리 */ }

  // 2) 새 구독 생성 + 서버 등록. enable 의 3~5단계 재사용을 위해 내부 헬퍼로 분리.
  const ok = await this.#doSubscribe(stint.programId, notifyAt);
  if (!ok) {
    // FR-33.4: 실패 시 알림 꺼진 상태로.
    this.#push = { ...emptyPush(), lastError: 'server-unreachable', updatedAt: new Date().toISOString() };
    // localStorage 는 남겨두지 말고 정리 (사용자가 다시 켜도록).
    clearPush(localStorage);
  }
}
```

- `#doSubscribe(programId, notifyAt)` 는 `enable` 에서 subscribe + fetch POST 부분을 뽑아낸 사설 헬퍼. `enable`, `reregister` 두 자리에서 재사용.
- `setNotifyAt` 을 재정의:
  ```ts
  async setNotifyAt(hhmm: string): Promise<void> {
    if (!this.#push.enabled) return;
    // 로컬 먼저 갱신 (UI 즉시 반영).
    this.#push = { ...this.#push, notifyAt: hhmm, updatedAt: new Date().toISOString() };
    writePush(localStorage, this.#push);
    // 서버 재등록 트리거.
    await this.reregister();
  }
  ```

## `routes/programs/+page.svelte` 편집

```ts
import { push } from '$lib/ui/shell/push.svelte';

function onSelect(id: string) {
  if (id === currentProgramId) { goto('/'); return; }
  if (currentProgramId === null) {
    const next = selectProgram(appState.value, catalog, id, todayClock.today);
    appState.apply(next);
    void push.reregister();       // ← 신규 (FR-33.3.a)
    goto('/');
  } else {
    pending = id;
  }
}

function confirmSwitch() {
  const id = pending;
  if (id === null) return;
  const next = switchProgram(appState.value, catalog, id, todayClock.today);
  appState.apply(next);
  void push.reregister();         // ← 신규 (FR-33.3.a 확장, ADR-37)
  pending = null;
  goto('/');
}
```

- `void` 로 fire-and-forget — `goto` 를 막지 않는다 (ADR-37).

## `routes/+page.svelte` 편집

```ts
import { push } from '$lib/ui/shell/push.svelte';

function onAccept() {
  const next = acceptProposal(appState.value, catalog, todayClock.today);
  appState.apply(next);
  void push.reregister();         // ← 신규 (FR-33.3.c)
}
```

- `onDecline` 에는 후크하지 않는다 — 제안 거절은 `programId` 를 바꾸지 않는다.

## 커밋 경계 (2개)

### (a) `feat(push): reregister · setNotifyAt 이 서버 재등록을 부른다`

- `push.svelte.ts` 편집: `#doSubscribe` 사설 헬퍼 추출, `reregister` 신설, `setNotifyAt` 재정의.
- `tests/unit/push.svelte.test.ts` 편집:
  - `reregister` — enabled=false 이면 no-op.
  - `reregister` — currentStint=null 이면 disable + lastError='no-program'.
  - `reregister` — 정상 시 이전 endpoint DELETE, 새 endpoint POST, `bigsix.push.endpoint` 갱신.
  - `reregister` — 새 subscribe 실패 → 알림 꺼짐 + lastError='server-unreachable', `bigsix.push` 정리.
  - `setNotifyAt('20:00')` — 새로 reregister 를 부른다 (기존 endpoint DELETE + 신규 POST).

### (b) `feat(routes): 프로그램·제안 후크로 push.reregister 호출`

- `routes/programs/+page.svelte` 편집.
- `routes/+page.svelte` 편집.
- (선택) `tests/unit/structure.test.ts` 편집 — routes/ 파일에서 push.subscribe/enable/disable 직접 호출 금지 (reregister 만 허용) — grep 규칙 추가. 어기면 실패.

## 완료 기준

- 커밋 a·b 전부에서 `pnpm check` 0/0, `pnpm test` 통과. 앱 tests 수 ≥ 813 (Phase 5 + 4 신규).
- `bash tests/server/run.sh`, `bash tests/deploy/run.sh` 통과 그대로.
- **실물 확인 (홈서버 배포 후, 사용자 확인 지시로만 재배포)**:
  1. Chrome PWA 에서 알림 켜기 (모범수 · 19:00) → `journalctl -u bigsix-api -f` 에 POST 201.
  2. 프로그램 화면에서 다른 프로그램(예: 신참) 선택 · 확인 → journal 에 DELETE 204 + POST 200/201.
  3. About 열기 → 알림 시각 20:00 으로 변경 → journal 에 DELETE + POST.
  4. 오늘·해당 시각·해당 프로그램의 운동 요일이면 스케줄러 tick 에서 발송 → 폰에 알림 도착.
  5. 알림 탭 → `/` 로 열림 (또는 이미 열린 창 focus).
- **EC-80** 재등록 실패: 서버 정지 시 프로그램 전환 → About 열면 `data-push-error="server-unreachable"` 표시, 상태 「알림 꺼져 있음」.

## 위험

- **RISK-3 재확인** (`programId` 접근): `reregister` 안 `currentStint` 만 부른다는 규약을 tests 로 못박음. `push.svelte.ts` 안 grep 검사.
- **race condition**: 프로그램 선택 직후 사용자가 곧바로 다른 조작을 하면 두 개의 reregister 가 겹칠 가능성. 현실적으로 사용자 손 속도 감안 무시. 필요 시 `#pending: Promise | null` 로 직렬화 검토 (지금은 안 함).
- **재등록 실패 데이터 유실**: `reregister` 실패 시 `bigsix.push` 를 비우고 알림 꺼진 상태로 되돌리는 결정이 UX 상 옳은가? FR-33.4 명시대로. 사용자가 다시 About 을 열어 켜기를 재시도.
- **서버에 남은 이전 endpoint**: DELETE 가 실패해도 다음 발송 시 서버가 410/404 로 정리 (FR-37.4). 재등록 흐름은 이 사실에 기대어 rollback 없이 진행.

## 임시 배포

**이 페이즈에 포함한다.** Phase 6 완료 후 배포해 위 실물 확인 5단계 검증. 알림 발송이 실제로 오는지 시간을 맞춰 확인 (테스트 목적으로 5분 후 시각을 잡으면 최대 5분 대기).

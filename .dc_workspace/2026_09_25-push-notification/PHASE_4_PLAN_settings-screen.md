# Phase 4: settings-screen

## 목표

`/settings` 라우트와 알림 섹션을 만들고, 릴레이 클라이언트 로드용 `relay.ts` 를 구현하고, 상단 바 「설정」 링크를 추가하고, 전체 초기화 흐름을 연동한다.

## 선행 조건

- Phase 3 완료.

## 구현 지침

### 1. `src/routes/settings/+page.ts` 생성

```ts
export const prerender = true;
```

### 2. `src/lib/ui/push/relay.ts` 생성

릴레이 `client.js` 전역을 감싼다.

다음을 export 한다.

- `loadRelay(): Promise<void>` — `document.head` 에 `<script src="${PUBLIC_PUSH_RELAY_URL}/client.js">` 를 추가하고(없을 때만), 스크립트의 `load` 이벤트에서 resolve, `error` 에서 reject 하는 Promise 를 반환한다. 두 번째 이후 호출은 캐시된 Promise 를 반환한다. `PUBLIC_PUSH_RELAY_URL` 은 `$env/static/public` 에서 import 한다.
- `teardownPush(): Promise<void>` — `PushRelay.state() === 'on'` 이면 `await PushRelay.disable()` 을 호출한다. 오류는 catch 해 무시한다. 릴레이 클라이언트가 로드되지 않은 경우 즉시 반환한다.

릴레이 클라이언트는 스크립트 로드 후 `PushRelay` 를 브라우저 전역으로 노출한다.

### 3. 화면 로직 순수 함수 추출

이 저장소에는 DOM 컴포넌트 테스트 인프라가 없다(Vitest 기본 환경 node, localStorage 전용 happy-dom 만 있음). 테스트 가능하도록 화면 로직을 순수 함수로 뺀다. `src/lib/ui/push/push.svelte.ts` 또는 별도 `src/lib/ui/push/pushUI.ts` 에 둔다.

다음을 export 한다.

- `stateToLabel(state: PushState): string` — FR-33.2(a) 에 정의된 각 `PushState` 문구를 반환한다.
- `errorToLabel(code: PushErrorCode): string` — FR-33.8 에 정의된 각 `PushErrorCode` 문구를 반환한다.
- `canEnable(state: PushState, hasProgramSelected: boolean): boolean` — `state === 'off'` 이고 `hasProgramSelected` 가 true 일 때만 true.
- `canDisable(state: PushState): boolean` — `state === 'on'` 일 때 true.
- `timeInputEnabled(state: PushState): boolean` — `unsupported` · `denied` 를 제외한 모든 상태에서 true (FR-33.5: 알림이 꺼져 있어도 시각 입력은 쓸 수 있다).

### 4. `src/routes/settings/+page.svelte` 생성

CLAUDE.md 제약:

- 페이지 요소에 `padding: 1rem 0` 만 적용한다.
- hex 색 없음 — `src/lib/styles/app.css` 토큰 변수만 사용한다.
- 터치 타깃 44px 이상.
- 아이콘만 있는 버튼 없음.
- 파생 값에는 `$derived`, 부작용(릴레이 로드, enable/disable 호출)에만 `$effect` 를 쓴다.

구조:

- 섹션 제목: `알림`.
- 알림 섹션 루트에 `data-push-state` 속성(현재 `PushState` 값). 릴레이 스크립트 로드 중에는 `확인 중` 를 표시한다.
- 켜기 버튼: 라벨 `알림 켜기`, `data-push-enable`, `!canEnable(...)` 이면 disabled. 비활성 시 투명도 + 커서 + `disabled` 속성(UI-15).
- 끄기 버튼: 라벨 `알림 끄기`, `data-push-disable`, `state === 'on'` 일 때만 표시.
- 시각 입력: `<input type="time">`, `data-push-time`, `step="60"` (분 단위, FR-33.5). `timeInputEnabled(state)` 에 따라 활성화.
- 오류 표시: `data-push-error` 속성에 오류 코드 값.
- 프로그램 미선택 안내: `data-push-need-program`, 프로그램 미선택 시 표시.

켜기 버튼 클릭: `await loadRelay()` 후 `await PushRelay.enable(meta)` 호출. 여기서 `meta = buildMeta(appState, catalog, tz, notifyAt)`. 사용자 제스처 안에서 호출한다(FR-33.3).

끄기 버튼 클릭: `await PushRelay.disable()` (FR-33.4).

시각 입력 `change` 이벤트: 새 값을 `pushRecord.notifyAt` 에 쓰고 `writePushRecord` 로 저장. `state === 'on'` 이면 `await PushRelay.enable(newMeta)` 도 호출(FR-33.5).

`enable` 성공 후: `pushRecord.sentMeta = JSON.stringify(meta)` 로 갱신하고 저장한다.

`catalog` 는 `$lib/data/catalog` `loadCatalog()` 로 로드한다. `tz` 는 `Intl.DateTimeFormat().resolvedOptions().timeZone` 으로 읽는다.

사용 모듈: `$lib/ui/push/push.svelte`, `$lib/ui/push/relay`, `$lib/ui/push/meta`, `$lib/ui/push/storage`, 순수 함수 모듈, `$lib/domain`.

### 5. `src/routes/+layout.svelte` 수정

상단 바 섹션(About 버튼 근처, 약 160행)에 다음을 추가한다.

- `<a href="/settings">` 링크 요소, 라벨 `설정`, `data-settings-open` 속성. 기존 버튼(테마 · wake lock · About)과 같은 모양. 좁은 화면에서도 라벨을 유지한다(CLAUDE.md 아이콘 규칙).

### 6. `src/lib/ui/state/reset.ts` 및 `src/lib/ui/shell/About.svelte` 수정

`reset.ts` `performReset()`: 기존 초기화 동작 뒤에 `deletePushRecord()` (`$lib/ui/push/storage`) 를 추가한다.

`About.svelte:35` (`performReset()` 호출 지점): 아래와 같이 변경한다.

```ts
await teardownPush();
performReset();
```

`teardownPush` 는 `$lib/ui/push/relay` 에서 import 한다. `teardownPush` 가 async 이므로 핸들러를 `async` 로 만든다.

## 완료 체크리스트

- [ ] `src/routes/settings/+page.ts` — `prerender = true`
- [ ] `src/lib/ui/push/relay.ts` — `loadRelay()` · `teardownPush()` 구현
- [ ] 화면 로직 순수 함수 추출·export
- [ ] `src/routes/settings/+page.svelte` — 모든 `data-*` 속성 포함
- [ ] 상단 바 「설정」 링크 추가 (`data-settings-open`)
- [ ] `reset.ts` 에 `bigsix.push` 삭제 추가
- [ ] `About.svelte` 에 `teardownPush()` 선행 호출 추가
- [ ] `pnpm check` 오류 0
- [ ] `pnpm test` 통과
- [ ] 수동: `pnpm dev` 에서 켜기·끄기·시각 변경 확인, iOS 설치/미설치 분기 확인

## 참고

- 모든 사용자 노출 문자열은 SPEC FR-33.2(a) 와 정확히 일치해야 한다.
- 색 토큰만 사용한다 — inline hex 없음.
- `performReset()` 의 직접 호출 지점은 `About.svelte:35` 하나다(grep 확인).

## 페이즈 종료 전 IR 로그 갱신

이 페이즈에서 쓰는 `integration.md` 절: **§2 화면** (`enable` · `disable` · `state` API, 오류 code 8종, meta 갱신 방법). 릴레이 API 구현 중 발견한 `integration.md` 이슈를 SPEC IR 로그에 기록한다.

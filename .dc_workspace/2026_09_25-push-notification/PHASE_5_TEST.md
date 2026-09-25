# Phase 5 — TEST 체크리스트

## `pushSupport.ts` (ADR-34)

- [ ] `isPushSupported()` — `PushManager`/`Notification`/`serviceWorker` 셋 다 있으면 true, 하나라도 없으면 false.
- [ ] `isStandalone()` — `matchMedia('(display-mode: standalone)').matches === true` 이면 true.
- [ ] `isStandalone()` — matchMedia 없고 `navigator.standalone === true` 이면 true (iOS Safari).
- [ ] `isIos()` — UA `iPhone`/`iPad`/`iPod` 매치 + `!MSStream`.
- [ ] `pushBlocker()` — 지원 있으면 `'none'`.
- [ ] `pushBlocker()` — iOS && !standalone && !supported → `'ios-not-installed'`.
- [ ] `pushBlocker()` — 그 외 !supported → `'unsupported'`.

## `pushStore.ts` (ADR-36, C.1)

- [ ] `readPush(stub)` — 빈 저장소면 `emptyPush()` 반환.
- [ ] `readPush(stub)` — 손상된 JSON 은 `emptyPush()` (에러 던지지 않음).
- [ ] `readPush(stub)` — `schemaVersion !== 1` 은 `emptyPush()`.
- [ ] `writePush(stub, push)` 후 `readPush(stub)` — 같은 값 왕복.
- [ ] `clearPush(stub)` — `removeItem` 호출.
- [ ] `PUSH_KEY === 'bigsix.push'` 확인.
- [ ] `PUSH_SCHEMA_VERSION === 1` 확인.

## `push.svelte.ts` 스토어 (FR-32, FR-33.1·2, EC-74~79)

- [ ] `init()` 후 `permission === Notification.permission` 반영.
- [ ] `init()` 이 blocker !== 'none' 이면 `readPush` 를 스킵 (블록된 상태에서 옛 저장 상태 노출 방지).
- [ ] `status` — 미지원 브라우저 → `'unsupported'` (EC-76).
- [ ] `status` — iOS 미설치 → `'ios-not-installed'` (EC-77).
- [ ] `status` — 권한 denied → `'blocked'` (EC-74).
- [ ] `status` — `currentStint === null` → `'no-program'` (EC-79).
- [ ] `status` — enabled=true → `'on'`.
- [ ] `status` — enabled=false → `'off'`.
- [ ] `enable('19:00')` — permission=default → requestPermission 호출, granted 반환 시 진행.
- [ ] `enable('19:00')` — permission=denied 반환 시 `lastError='permission-denied'`, 서버 요청 없음.
- [ ] `enable('19:00')` — currentStint=null 이면 `lastError='no-program'`, 서버 요청 없음.
- [ ] `enable('19:00')` — PushManager.subscribe 실패 → `lastError='subscribe-failed'`, 서버 요청 없음.
- [ ] `enable('19:00')` — 서버 400 응답 → 브라우저 subscription unsubscribe, `lastError='server-unreachable'`.
- [ ] `enable('19:00')` — 서버 201 → `bigsix.push` 저장에 enabled=true · notifyAt · endpoint 반영.
- [ ] `disable()` — DELETE /api/push/subscribe 호출 · brwoser unsubscribe · localStorage 정리.
- [ ] `disable()` — 서버 도달 불가여도 로컬 정리는 수행.
- [ ] `setNotifyAt('20:30')` — enabled 이면 로컬만 갱신. **Phase 5 에서는 서버 재등록 없음** (Phase 6 에서 추가).
- [ ] `setNotifyAt('20:30')` — !enabled 이면 no-op.

## FR-32.6 — 저장 별도 키

- [ ] `localStorage.getItem('bigsix.push')` 형태가 `{ schemaVersion:1, push:{...} }`.
- [ ] `localStorage.getItem('bigsix.state')` 는 push 관련 필드 없음 (AppState 봉투 미변경).
- [ ] AppState envelope shape 검사에서 push 관련 필드가 존재해도 무관 (하지만 실제로 존재하지 않음).

## About.svelte 알림 섹션 (UI-12~16)

- [ ] `data-push-status` 가 push.status 값을 반영 (7가지 중 하나).
- [ ] `data-push-permission` 이 Notification.permission 값 반영.
- [ ] `<input type="time">` 이 존재하며 `push.enabled === false` 이면 `disabled` 속성 붙음.
- [ ] 알림 켜기 버튼: `data-push-enable` 훅 존재, 라벨 「알림 켜기」.
- [ ] 알림 끄기 버튼: `data-push-disable` 훅 존재, 라벨 「알림 끄기」.
- [ ] 두 버튼은 status 에 따라 정확히 하나만 렌더 (`{#if}` 로 상반된 조건).
- [ ] `push.status === 'ios-not-installed'` 이면 "홈 화면에 추가 후..." 문구 표시, 켜기 버튼 없음.
- [ ] `push.status === 'unsupported'` 이면 "이 브라우저는 푸시 알림을 지원하지 않습니다" 표시, 켜기 버튼 없음.
- [ ] `push.status === 'no-program'` 이면 "프로그램을 먼저 선택하세요" 표시, 켜기 버튼 비활성화 (buttons 자체는 안 그려짐).
- [ ] `push.lastError !== null` 이면 `data-push-error` 훅과 문구 표시.
- [ ] 아이콘만 있는 버튼 없음 — 라벨 모두 표기.
- [ ] 색만으로 상태 알림 없음 — 문구가 함께 존재.

## FR-19.4 (reset) 연동

- [ ] `performReset()` 실행 후 `localStorage.getItem('bigsix.push')` === null.

## 구조 규약 (RISK-3, ADR-21·36)

- [ ] `grep -n "appState.value.stints\\|appState.value.proposals" src/lib/ui/shell/push.svelte.ts` — 0건.
- [ ] `grep -n "from '\\$lib/domain'" src/lib/ui/shell/push.svelte.ts` — `currentStint` 등 import.
- [ ] `tests/unit/structure.test.ts` — 새 검사 케이스 통과 (push.svelte.ts 가 도메인 내부에 접근하지 않음).

## `+layout.svelte`

- [ ] `grep -n "push.init" src/routes/+layout.svelte` — 1건.
- [ ] push.init 이 boot 이후 · install.start 이후에 호출됨 (순서 확인).

## 통합

- [ ] `pnpm check` 0/0.
- [ ] `pnpm test` 통과. 총 테스트 수 ≥ 809 (신규 12+).
- [ ] `bash tests/server/run.sh` 통과 (변화 없음).
- [ ] `bash tests/deploy/run.sh` 통과 (변화 없음).

## 실물 확인 (Phase 4 배포 완료 상태에서)

- [ ] Chrome for Android 설치 PWA 에서 About 열기 → 알림 섹션 정상 표시.
- [ ] 「알림 켜기」 누름 → 권한 프롬프트 → granted → 서버에 `POST /subscribe 201` 로그.
- [ ] About 재열기 시 상태 「알림 켜져 있음」 표시.
- [ ] 「알림 끄기」 → 서버에 `DELETE /subscribe 204` 로그, 상태 「알림 꺼져 있음」.
- [ ] iOS Safari 탭 (미설치): 알림 섹션에 "홈 화면에 추가 후 이 기능을 쓸 수 있습니다" 표시, 버튼 없음.
- [ ] iOS 설치 PWA (16.4+): 「알림 켜기」 정상 동작 (수동 검증).
- [ ] 지원 안 되는 브라우저 (임의 UA): "이 브라우저는 푸시 알림을 지원하지 않습니다" 표시.
- [ ] 프로그램 미선택 상태 → 알림 섹션 "프로그램을 먼저 선택하세요" 표시.

## 엣지 케이스 (권한 철회)

- [ ] EC-75: 브라우저 설정에서 권한을 철회한 뒤 About 모달을 다시 열면 권한 상태를 다시 읽어 "거부됨" 으로 갱신한다. `bigsix.push` 에 남은 구독 데이터가 UI 를 켜진 것처럼 보이게 하지 않는다.

## 품질 게이트

- [ ] `pnpm check` 오류 0, 경고 0. (NFR-33)
- [ ] `pnpm test` 통과. 앱 tests **797 이상** 유지 (main `dc84f1e` 기준선 797 / 38 files).
- [ ] `bash tests/server/run.sh` 통과 (Phase 2 이후 스위트 회귀 없음).

## 비기능·화면 규약 (NFR-29 · NFR-34 · UI-13 · UI-14 · UI-16)

- [ ] NFR-29: 알림 섹션 문구가 사실만 적는다 — 백분율·격려·게이미피케이션 없음.
- [ ] NFR-34: `src/lib/domain/**` 에 변경이 없다 (`git diff --stat` 으로 확인). 알림 로직은 `src/lib/ui/` 아래에만 있다.
- [ ] UI-13: 켜기/끄기 버튼에 글자 라벨이 함께 선다. 아이콘만 있는 버튼이 없다.
- [ ] UI-14: `<input type="time">` 이 구독 중일 때만 활성이고, 비활성 상태가 시각적으로 구분된다.
- [ ] UI-16: iOS 미설치 상태에서 "홈 화면에 추가 후 이 기능을 쓸 수 있습니다" 한 줄이 뜨고 켜기 버튼이 없다 (EC-77). 설치 링크는 두지 않는다 (ADR-34).

---

## 검증 메모

<!-- Coder 가 채운다. -->

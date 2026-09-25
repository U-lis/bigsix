# Phase 6 — TEST 체크리스트

## `push.reregister()` (ADR-37, FR-33.3)

- [ ] `enabled === false` 상태에서 호출 → no-op. 서버 요청 없음. `bigsix.push` 무변경.
- [ ] `currentStint === null` (프로그램 미선택) 상태 + enabled=true → `disable()` 흐름 후 `lastError='no-program'`, 알림 꺼짐 상태.
- [ ] 정상 흐름: 이전 endpoint 로 DELETE 요청 · 새 subscription 생성 · POST 요청. 성공 시 `bigsix.push.endpoint` 신규 값, `enabled=true` 유지.
- [ ] 새 subscribe 실패 (PushManager 예외) → `enabled=false`, `bigsix.push` 정리, `lastError='subscribe-failed'`.
- [ ] 서버 POST 실패 (400/500/네트워크) → `enabled=false`, `bigsix.push` 정리, `lastError='server-unreachable'` (FR-33.4).
- [ ] 이전 endpoint DELETE 가 실패해도 흐름을 막지 않고 새 구독 시도 진행. 이 사실이 콘솔 경고 없이 조용히 넘어감.

## `push.setNotifyAt('HH:MM')` (Phase 5 재정의)

- [ ] `enabled=true` 상태에서 호출 → 로컬 즉시 갱신 (`bigsix.push.notifyAt`), 이어서 `reregister()` 호출됨.
- [ ] `enabled=false` 상태에서 호출 → no-op.
- [ ] 서버 요청은 `reregister` 를 통해 발생 (DELETE 이전 endpoint, POST 새 endpoint).

## FR-33.3.a — programs/+page.svelte 후크

- [ ] `grep -n "push.reregister" src/routes/programs/+page.svelte` — 2건 (onSelect · confirmSwitch).
- [ ] `onSelect` 미선택 브랜치: `selectProgram` 호출 뒤 `void push.reregister()`.
- [ ] `confirmSwitch`: `switchProgram` 호출 뒤 `void push.reregister()`.
- [ ] `goto('/')` 는 `void` 로 fire-and-forget 이므로 재등록 완료 전에 실행됨 (Non-block 확인).

## FR-33.3.c — routes/+page.svelte 후크 (acceptProposal)

- [ ] `grep -n "push.reregister" src/routes/+page.svelte` — 1건 (`onAccept`).
- [ ] `onDecline` 안에는 `push.reregister` 호출 없음 (제안 거절은 programId 를 바꾸지 않음).

## FR-33.3.d — 시각 변경 (Phase 5 재확인)

- [ ] About 모달 `<input type="time">` `onchange` → `push.setNotifyAt(...)` → `push.reregister()`.
- [ ] About 모달 닫기만 하면 저장 안 됨 — `<input>` 이 `bind:value` 지만 서버 반영은 change 이벤트에서만.
- [ ] 별도 「저장」 버튼 없음.

## 구조 규약

- [ ] `grep -n "push.subscribe\\|push.enable\\|push.disable" src/routes/**/*.svelte` — 0건 (routes 는 reregister 만 부른다, ADR-37).
- [ ] `grep -n "appState.value.stints\\|appState.value.proposals" src/lib/ui/shell/push.svelte.ts` — 0건 (RISK-3 재확인).
- [ ] `tests/unit/structure.test.ts` 통과.

## 통합

- [ ] `pnpm check` 0/0.
- [ ] `pnpm test` 통과. 총 테스트 수 ≥ 813 (Phase 5 + 4 신규).
- [ ] `bash tests/server/run.sh` 통과 그대로.
- [ ] `bash tests/deploy/run.sh` 통과 그대로.

## 실물 확인 (홈서버 배포 후, 사용자 확인 지시로만)

- [ ] `./deploy/deploy.sh feature/push-notification` — 배포 성공, 프리캐시 대조 · API 응답 대조 통과.
- [ ] Chrome PWA (Android) 에서 다음 시나리오:
  1. About → 알림 켜기 (good_behavior · 아래 검증에서 사용할 시각) → 서버 로그 `POST /subscribe 201`.
  2. `/programs` → veterano 선택·전환 확인 → 서버 로그 `DELETE 204` + `POST 200 or 201`.
  3. About 열어 「알림 켜져 있음」 확인, 시각을 다음 분(3분 후) 로 변경 → 서버 로그 `DELETE 204` + `POST 200`.
  4. 스케줄러 tick 로그 (`journalctl -u bigsix-scheduler -f`) 에서 매칭·발송 확인 (`tick { sent: 1, ... }`).
  5. **폰에 실제 알림 도착** — 「빅6 / 베테랑 · {요일에 맞는 종목}」 형식.
  6. 알림 탭 → 앱 `/` 열림 (또는 focus). notificationclick 정상.
- [ ] EC-80: 배포 후 임시로 `sudo systemctl stop bigsix-api.service` 로 서버 정지 → 다시 프로그램 전환 → About 열면 `data-push-error="server-unreachable"` 표시, 상태 「알림 꺼져 있음」. `bigsix.push` 정리 확인.
- [ ] EC-82: 같은 기기 · 같은 프로그램으로 알림 켜기를 두 번 (한 번 끄고 다시 켜기) → 서버 subscriptions.json 에 endpoint 하나만 (upsert 동작 확인).

## 엣지 케이스 (실패·취소 경로)

- [ ] EC-81: 서버 도달 불가 상태에서 등록·해지를 시도하면 EC-80 흐름으로 떨어진다 (알림 꺼짐 + 실패 표시).
- [ ] EC-84: 시각을 바꾸다가 저장 전에 About 모달을 닫으면 그 변경은 버려지고 마지막 저장 값이 유효하다.

## 품질 게이트

- [ ] `pnpm check` 오류 0, 경고 0. (NFR-33)
- [ ] `pnpm test` 통과. 앱 tests **797 이상** 유지 (main `dc84f1e` 기준선 797 / 38 files).
- [ ] `bash tests/server/run.sh` 통과 (Phase 2 이후 스위트 회귀 없음).

---

## 검증 메모

<!-- Coder 가 채운다. 실물 발송 시각과 알림 캡처 등. -->

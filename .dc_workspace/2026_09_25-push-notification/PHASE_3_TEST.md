# Phase 3 — TEST 체크리스트

## FR-34.2 · H-9 · H-10 — 알림 본문 계산 (`test-progressions.mjs`)

- [ ] `programName('good_behavior')` → `'모범수'`.
- [ ] `programName('unknown')` → `null`.
- [ ] `progressionsForDay('good_behavior', '월')` → `['푸시업', '레그 레이즈']`.
- [ ] `progressionsForDay('good_behavior', '화')` → `[]` (휴식일).
- [ ] `progressionsForDay('new_blood', '목')` → `['풀업', '스쿼트']`.
- [ ] `progressionsForDay('supermax', '일')` → `[]` (모든 프로그램에서 일요일 휴식).
- [ ] `buildPayload('good_behavior', '월')` → `{title:'빅6', body:'모범수 · 푸시업, 레그 레이즈', icon:'/icon-192.png'}`.
- [ ] `buildPayload('good_behavior', '화')` → `null` (휴식일).
- [ ] `buildPayload('unknown', '월')` → `null`.

## FR-37.2 — 스케줄러 매칭 (`test-scheduler.mjs`)

- [ ] `localizeToTz(new Date('2026-11-30T10:00:00Z'), 'Asia/Seoul')` → `{ date:'2026-11-30', hhmm:'19:00', weekday:'월' }`.
- [ ] `localizeToTz(same, 'America/New_York')` → `{ date:'2026-11-30', hhmm:'05:00', weekday:'월' }`.
- [ ] `localizeToTz(same, 'Foo/Bar')` → `null`.
- [ ] tick — good_behavior 구독, tz=Seoul, notifyAt=19:00. now=2026-11-30 10:00Z (=서울 19:00 월). → `sent=1, skipped=0`.
- [ ] tick — 화요일 now → `sent=0, skipped=1` (휴식일).
- [ ] tick — now=19:01 로 세팅 → `sent=0, skipped=1`.
- [ ] tick — 두 번 연속 실행 → 두 번째 `sent=0` (dedup).
- [ ] 두 구독 (Seoul 19:00 · NY 19:00), 같은 UTC now → Seoul 만 매칭되면 `sent=1`.

## FR-37.3 — dedup 로그 pruning

- [ ] `pruneSentLog({'e|2026-11-21':'...'}, new Date('2026-11-30'), 8)` → 유지 (9일 전이지만 경계).
- [ ] `pruneSentLog({'e|2026-11-20':'...'}, new Date('2026-11-30'), 8)` → 제거 (10일 전).
- [ ] `pruneSentLog({'e|2026-11-30':'...'}, new Date('2026-11-30'), 8)` → 유지 (오늘).
- [ ] tick 실행 후 store 파일에서 오래된 sentLog 엔트리가 실제로 사라짐.
- [ ] 최근 sentLog 엔트리는 유지.

## FR-37.4 — 만료 구독 정리 (`test-scheduler.mjs`)

- [ ] `sendPush` stub 이 `{ kind: 'gone' }` 반환 시 tick 결과 `removed=1`.
- [ ] tick 후 store 재로드: `subscriptions[endpoint]` 없음.
- [ ] tick 후 store 재로드: 해당 endpoint 로 시작하는 `sentLog` 키도 제거됨 (removeSubscription 이 함께 정리, ADR-31).
- [ ] `sendPush` stub 이 `{ kind: 'auth' }` 반환 시 저장소 변화 없음 (`removed=0, sent=0`).
- [ ] `sendPush` stub 이 `{ kind: 'network' }` 반환 시 저장소 변화 없음.

## `web-push` 래퍼 (`test-push-wrapper.mjs`)

- [ ] `sendNotification` 이 성공 → `{ kind:'ok' }`.
- [ ] `statusCode: 404` → `{ kind:'gone', status:404 }`.
- [ ] `statusCode: 410` → `{ kind:'gone', status:410 }`.
- [ ] `statusCode: 401` → `{ kind:'auth', status:401 }`.
- [ ] `statusCode: 403` → `{ kind:'auth', status:403 }`.
- [ ] `statusCode: 500` → `{ kind:'other', status:500 }`.
- [ ] throw (네트워크 오류, statusCode 없음) → `{ kind:'network' }`.
- [ ] `setVapidDetails` 가 `vapid.subject/publicKey/privateKey` 세 값으로 호출됨.

## CLI 진입점

- [ ] `node --experimental-strip-types server/src/scheduler.ts` — VAPID 키 파일 부재 시 명확한 에러 메시지 후 non-zero exit.
- [ ] VAPID 키 파일 존재 + 빈 subscriptions.json → 정상 실행, 콘솔 `tick { sent: 0, skipped: 0, removed: 0 }`, exit 0.

## 통합 검사

- [ ] `bash tests/server/run.sh` 전 스위트 통과.
- [ ] `pnpm check` 오류 0, 경고 0. (NFR-33)
- [ ] `pnpm test` 통과, 앱 tests 수 797 그대로.
- [ ] 서버 tests 수 (Phase 2 대비): +2 스위트 (progressions · scheduler) +1 스위트 (push-wrapper) = 3 스위트 추가.

## 엣지 케이스 (스케줄러)

- [ ] EC-78: 발송이 `410 Gone` 또는 `404 Not Found` 를 받으면 해당 구독을 저장소에서 즉시 삭제한다 (FR-37.4).
- [ ] EC-83: 휴식일(해당 요일 schedule 배열이 빔)에는 발송하지 않는다 (FR-37.2).
- [ ] EC-85: 삭제·재설치로 endpoint 가 바뀌면 옛 endpoint 는 410 을 받아 정리되고 새 구독으로 발송이 이어진다.

## endpoint 발송 대상 제한 (Phase 2 검증 인계)

- [ ] 알려진 푸시 서비스 도메인(FCM · Mozilla · Apple)의 endpoint 는 통과한다.
- [ ] 임의 도메인(`https://example.com/...`)의 endpoint 는 거절한다 — 등록 시점과 발송 시점 양쪽.
- [ ] `http://` 스킴, `localhost`·사설 IP 를 가리키는 endpoint 는 거절한다.
- [ ] 허용 도메인 목록 상수 자체를 검사한다 (오타·빈 목록 방지).

---

## 검증 메모

<!-- Coder 가 채운다. -->

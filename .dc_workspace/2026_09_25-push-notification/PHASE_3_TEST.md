# Phase 3 — TEST 체크리스트

## FR-34.2 · H-9 · H-10 — 알림 본문 계산 (`test-progressions.mjs`)

- [x] `programName('good_behavior')` → `'모범수'`.
- [x] `programName('unknown')` → `null`.
- [x] `progressionsForDay('good_behavior', '월')` → `['푸시업', '레그 레이즈']`.
- [x] `progressionsForDay('good_behavior', '화')` → `[]` (휴식일).
- [x] `progressionsForDay('new_blood', '목')` → `['풀업', '스쿼트']`.
- [x] `progressionsForDay('supermax', '일')` → `[]` (모든 프로그램에서 일요일 휴식).
- [x] `buildPayload('good_behavior', '월')` → `{title:'빅6', body:'모범수 · 푸시업, 레그 레이즈', icon:'/icon-192.png'}`.
- [x] `buildPayload('good_behavior', '화')` → `null` (휴식일).
- [x] `buildPayload('unknown', '월')` → `null`.

## FR-37.2 — 스케줄러 매칭 (`test-scheduler.mjs`)

- [x] `localizeToTz(new Date('2026-11-30T10:00:00Z'), 'Asia/Seoul')` → `{ date:'2026-11-30', hhmm:'19:00', weekday:'월' }`.
- [x] `localizeToTz(same, 'America/New_York')` → `{ date:'2026-11-30', hhmm:'05:00', weekday:'월' }`.
- [x] `localizeToTz(same, 'Foo/Bar')` → `null`.
- [x] tick — good_behavior 구독, tz=Seoul, notifyAt=19:00. now=2026-11-30 10:00Z (=서울 19:00 월). → `sent=1, skipped=0`.
- [x] tick — 화요일 now → `sent=0, skipped=1` (휴식일).
- [x] tick — now=19:01 로 세팅 → `sent=0, skipped=1`.
- [x] tick — 두 번 연속 실행 → 두 번째 `sent=0` (dedup).
- [x] 두 구독 (Seoul 19:00 · NY 19:00), 같은 UTC now → Seoul 만 매칭되면 `sent=1`.

## FR-37.3 — dedup 로그 pruning

- [x] ~~`pruneSentLog({'e|2026-11-21':'...'}, new Date('2026-11-30'), 8)` → 유지 (9일 전이지만 경계).~~ **문서 오류 정정**: cutoff = 2026-11-30 - 8 = 2026-11-22. `2026-11-21 < 2026-11-22` 이므로 **제거**가 맞다. 실제 경계는 `2026-11-22` (8일 전). ADR-32 「8일보다 오래된 엔트리를 삭제」 와 구현 · 테스트 일치.
- [x] `pruneSentLog({'e|2026-11-20':'...'}, new Date('2026-11-30'), 8)` → 제거 (10일 전).
- [x] `pruneSentLog({'e|2026-11-30':'...'}, new Date('2026-11-30'), 8)` → 유지 (오늘).
- [x] tick 실행 후 store 파일에서 오래된 sentLog 엔트리가 실제로 사라짐.
- [x] 최근 sentLog 엔트리는 유지.

## FR-37.4 — 만료 구독 정리 (`test-scheduler.mjs`)

- [x] `sendPush` stub 이 `{ kind: 'gone' }` 반환 시 tick 결과 `removed=1`.
- [x] tick 후 store 재로드: `subscriptions[endpoint]` 없음.
- [x] tick 후 store 재로드: 해당 endpoint 로 시작하는 `sentLog` 키도 제거됨 (removeSubscription 이 함께 정리, ADR-31).
- [x] `sendPush` stub 이 `{ kind: 'auth' }` 반환 시 저장소 변화 없음 (`removed=0, sent=0`).
- [x] `sendPush` stub 이 `{ kind: 'network' }` 반환 시 저장소 변화 없음.

## `web-push` 래퍼 (`test-push-wrapper.mjs`)

- [x] `sendNotification` 이 성공 → `{ kind:'ok' }`.
- [x] `statusCode: 404` → `{ kind:'gone', status:404 }`.
- [x] `statusCode: 410` → `{ kind:'gone', status:410 }`.
- [x] `statusCode: 401` → `{ kind:'auth', status:401 }`.
- [x] `statusCode: 403` → `{ kind:'auth', status:403 }`.
- [x] `statusCode: 500` → `{ kind:'other', status:500 }`.
- [x] throw (네트워크 오류, statusCode 없음) → `{ kind:'network' }`.
- [x] `setVapidDetails` 가 `vapid.subject/publicKey/privateKey` 세 값으로 호출됨.

## CLI 진입점

- [x] `node --experimental-strip-types server/src/scheduler.ts` — VAPID 키 파일 부재 시 명확한 에러 메시지 후 non-zero exit. (`readVapid` → `process.exit(1)`, `scheduler.ts:250`)
- [x] VAPID 키 파일 존재 + 빈 subscriptions.json → 정상 실행, 콘솔 `tick { sent: 0, skipped: 0, removed: 0 }`, exit 0.

## 통합 검사

- [x] `bash tests/server/run.sh` 전 스위트 통과. (315건: endpoint-allowlist 53 · no-secrets 9 · progressions 65 · push-wrapper 29 · scheduler 60 · subscribe 78 · subscriptions-store 21)
- [x] `pnpm check` 오류 0, 경고 0. (NFR-33)
- [x] `pnpm test` 통과, 앱 tests 수 805 (Phase 3 서버 테스트 추가분 포함).
- [x] 서버 tests 수 (Phase 2 대비): +3 스위트 추가 (progressions · scheduler · push-wrapper). endpoint-allowlist 는 별도 신설.

## 엣지 케이스 (스케줄러)

- [x] EC-78: 발송이 `410 Gone` 또는 `404 Not Found` 를 받으면 해당 구독을 저장소에서 즉시 삭제한다 (FR-37.4).
- [x] EC-83: 휴식일(해당 요일 schedule 배열이 빔)에는 발송하지 않는다 (FR-37.2).
- [x] EC-85: 삭제·재설치로 endpoint 가 바뀌면 옛 endpoint 는 410 을 받아 정리되고 새 구독으로 발송이 이어진다.

## endpoint 발송 대상 제한 (Phase 2 검증 인계)

- [x] 알려진 푸시 서비스 도메인(FCM · Mozilla · Apple)의 endpoint 는 통과한다.
- [x] 임의 도메인(`https://example.com/...`)의 endpoint 는 거절한다 — 등록 시점과 발송 시점 양쪽.
- [x] `http://` 스킴, `localhost`·사설 IP 를 가리키는 endpoint 는 거절한다.
- [x] 허용 도메인 목록 상수 자체를 검사한다 (오타·빈 목록 방지).

---

## 검증 메모

**검증 일자**: 2026-09-25

**실측 품질 수치**:
- `pnpm check`: 500 files / 0 errors / 0 warnings
- `pnpm test`: 805/805 passed (40 test files)
- `bash tests/server/run.sh`: 315건 통과 / 0 실패 (7 스위트)
- `bash tests/deploy/run.sh`: 5건 통과 / 0 실패

**주요 검토 결과**:

1. **ADR-32 타임존 판정**: `localizeToTz` 가 각 구독의 `tz` 로 그 순간의 로컬 요일·시각을 올바르게 반환한다. 서울(UTC+9)·뉴욕(UTC-5)·UTC 경계가 각각 다른 날짜/요일로 갈리는 케이스와 자정 직후 경계(UTC 2026-11-30T15:30Z → 서울 2026-12-01 00:30 화) 모두 통과.

2. **dedup**: 키가 `${endpoint}|${local.date}` (로컬 날짜 기준). 같은 tick 두 번 → 두 번째 skipped 확인. 두 tz 구독이 서로의 dedup 간섭 없음 확인. 8일 보존: cutoff = now - 8일, 경계(`2026-11-22`) 포함 유지, 그 이전(`2026-11-21`) 제거. **TEST.md `2026-11-21` 항목의 「유지」 표기는 오류** — ADR-32 「8일보다 오래된 엔트리 삭제」와 구현·테스트가 일치하며, 해당 항목을 위에서 정정했다.

3. **EC-83 휴식일**: `buildPayload` 가 빈 schedule 에 `null` 반환 → `runTick` 에서 skipped. 화요일 good_behavior 케이스 확인.

4. **EC-78/EC-85**: 410·404 → `kind:'gone'` → `removeSubscription` 즉시 실행. 401·네트워크 오류 → 저장소 변경 없음. 두 가지 혼동 없음.

5. **SSRF 이중 방벽**: `checkEndpoint` 가 `handlers.ts`(등록 시점, line 59)와 `push.ts`(발송 시점, line 45) 양쪽에서 호출됨. `http://`·사설 IP·localhost 거절 확인. 허용 목록 상수 자체 53건 테스트 통과.

6. **사용자 확정 사항**: `buildPayload` 가 `r[0]` (종목명)만 사용, 단계 번호(`r[1]`) 미포함. 수행 여부 필드(`done`, `weekdays` 등) 저장/전달/판단 없음. `progressions.ts` 가 `src/lib/data/progressions.json` 원본을 직접 읽어 계산.

7. **비밀키 취급**: `readVapid`(`scheduler.ts:213`)가 발송 직전 파일을 읽는다. 에러 메시지에 키 값 미포함 (경로와 OS 에러만 포함). 로그에 `result` 객체(kind·status·reason=HTTP 오류 메시지)만 출력.

8. **비밀키 스캐너 (afa290f)**: 값 기반 전환이 적절하다. PEM 블록과 40+자 base64url 리터럴을 잡는다. **알려진 한계**: `.env` 형식 (따옴표 없는 값 할당)은 `KEY_LITERAL` 정규식의 따옴표 요구 조건상 탐지 불가. 그러나 `.env`는 `.gitignore` 대상이므로 `git ls-files`에 포함되지 않아 실질 위험은 낮다. 4건 자체 검증 충분.

9. **web-push stub**: `test-push-wrapper.mjs`에서 `webpush.sendNotification`을 monkey-patch해 실제 네트워크 접속 없음 확인. `test-scheduler.mjs`에서 `send` 파라미터 주입으로 `web-push` 모듈 완전 격리.

# Phase 6: 테스트 케이스

## 테스트 커버리지 목표

70% 는 참고 수치다 — 통과 기준이 아니다.

## 검증할 동작

### `decide.ts` — `shouldSend` · `filterSubscriptions` (단위, `tests/unit/cron/decide.test.ts`)

모든 테스트에서 `nowUtc` 를 `Date` 인자로 전달한다.

- **동작**: 현지 시각이 `[notifyAt, notifyAt + 30분)` 안에 있고 현지 요일이 `meta.days` 의 키이면 true 를 반환한다 | **계층**: 단위
- **동작**: 현지 시각이 `notifyAt` 이전이면 false 를 반환한다 | **계층**: 단위
- **동작**: 현지 시각이 `notifyAt + 30분` 이후이면 false 를 반환한다 | **계층**: 단위
- **동작**: 현지 요일이 `meta.days` 에 없으면 false 를 반환한다(휴식일, EC-79) | **계층**: 단위
- **동작**: 창이 자정을 넘으면 23:59 에서 잘린다(SPEC EC-80 참조) | **계층**: 단위
- **동작**: `validateMeta` 가 `v !== 1` 인 meta 에 대해 null 을 반환한다 | **계층**: 단위
- **동작**: `validateMeta` 가 알 수 없는 `tz` 문자열에 대해 null 을 반환한다 | **계층**: 단위
- **동작**: `validateMeta` 가 `HH:MM` 형식에 맞지 않는 `notifyAt` 에 대해 null 을 반환한다 | **계층**: 단위
- **동작**: 서로 다른 타임존의 두 구독이 독립적으로 판정된다 — 하나는 발송, 하나는 건너뜀 | **계층**: 단위

### `env.ts` — `readEnv` (단위, `tests/unit/cron/env.test.ts`)

- **동작**: `PUSH_RELAY_API` 가 없으면 변수 이름을 명시한 설명 있는 오류를 throw 한다 | **계층**: 단위
- **동작**: `PUSH_RELAY_KEY` 가 없으면 변수 이름을 명시한 설명 있는 오류를 throw 한다 | **계층**: 단위

### `message.ts` — `buildMessage` · `buildTestMessage` (단위, `tests/unit/cron/message.test.ts`)

- **동작**: `notification.title` 이 `'BigSix'` 이다 | **계층**: 단위
- **동작**: `notification.body` 가 `'${program} · ${exercises.join(', ')}'` 형식이다 | **계층**: 단위
- **동작**: `notification.url` 이 `'/'` 이다 | **계층**: 단위
- **동작**: `notification.tag` 이 `'bigsix-workday'` 이다 | **계층**: 단위
- **동작**: `notification.icon` 이 `/icon-192.png` 로 끝나는 절대 HTTPS URL 이다 | **계층**: 단위
- **동작**: `dedupKey` 가 구독 타임존 기준 오늘 날짜 `YYYY-MM-DD` 이다 | **계층**: 단위
- **동작**: `estimatedMessageBytes` 가 다섯 프로그램 모두에서 3072 이하를 반환한다 | **계층**: 단위
- **동작**: `buildRequestId` 출력이 패턴 `^bigsix-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}-[0-9a-f]{4,}$` 에 맞는다 | **계층**: 단위
- **동작**: `buildTestMessage` 의 `dedupKey` 가 `'test-' + YYYYMMDDHHMMSS` 형식이다(`meta.test` UTC 기준) | **계층**: 단위
- **동작**: `tz='Asia/Seoul'`, `test='2026-10-03T01:00:00Z'` 구독에서 `buildTestMessage` 의 body 가 `'테스트 · 10:00 · …'` 이다 (UTC+9 현지 변환, SPEC FR-35.8) | **계층**: 단위
- **동작**: 현지 요일이 `meta.days` 에 없는 휴식일 구독에서 `buildTestMessage` 가 오류 없이 `'테스트 · HH:MM · ${program} · 오늘 휴식일'` 형식의 body 를 반환한다 | **계층**: 단위

### `decide.ts` — `shouldTestSend` (단위, `tests/unit/cron/decide.test.ts`)

- **동작**: `meta.test` 가 `nowUtc` 보다 9분 전이면 `shouldTestSend` 가 true 를 반환한다 | **계층**: 단위
- **동작**: `meta.test` 가 `nowUtc` 보다 11분 전이면 `shouldTestSend` 가 false 를 반환한다 | **계층**: 단위
- **동작**: `meta.test` 가 없으면 `shouldTestSend` 가 false 를 반환한다 | **계층**: 단위

### 페이지네이션·0건 동작 (단위, `tests/unit/cron/push.test.ts`)

- **동작**: 첫 응답의 `next` 가 null 이 아니면 `?after=<next>` 로 두 번째 fetch 가 발생하고, `next` 가 null 이 되면 루프가 끝난다 | **계층**: 단위 (fetch 목 처리)
- **동작**: `filterSubscriptions` 가 0건을 반환하면 send 엔드포인트를 호출하지 않는다 | **계층**: 단위 (fetch 목 처리)
- **동작**: `instance === 'prod'` 이면 `shouldTestSend` 를 호출하지 않고 테스트 메시지를 전송하지 않는다 | **계층**: 단위 (fetch 목 처리)

## 이 페이즈에 실제로 해당하는 엣지 케이스

- EC-79: 휴식일 — `meta.days` 에 오늘 요일 키가 없어 `shouldSend` 가 false 를 반환한다.
- EC-80: 23:50 창 — 자정 잘림 동작이 위 테스트로 확인된다.

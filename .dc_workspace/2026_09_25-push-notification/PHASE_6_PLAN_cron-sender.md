# Phase 6: cron-sender

## 목표

홈서버에서 1분마다 실행되는 cron 작업을 구현한다. 릴레이 구독 목록을 읽어 발송 창 안에 있는 구독에 한 번에 알림을 보낸다.

## 선행 조건

- Phase 2 완료(`PushMeta` 타입 정의만 공유 — `src/` import 없음).
- 참고: `cron/` 은 앱 페이즈와 import 관계가 없다. `PushMeta` 인터페이스는 `cron/` 안에서 직접 선언한다.

## 구현 지침

### 1. `cron/env.ts` 생성

환경변수를 읽고 검증한다. 다음을 export 한다.

```ts
interface CronEnv {
  relayApi: string;   // PUSH_RELAY_API
  relayKey: string;   // PUSH_RELAY_KEY
}

function readEnv(): CronEnv
```

변수 중 하나라도 없으면 설명이 있는 오류를 throw 한다.

### 2. `cron/decide.ts` 생성

I/O 없는 순수 함수. 현재 시각은 항상 인자로 받는다.

```ts
interface SubscriptionItem {
  id: string;
  meta: unknown;
  createdAt: string;
  updatedAt: string;
}

interface DecideResult {
  subscriptionId: string;
  meta: ValidMeta;
}

interface ValidMeta {
  v: 1;
  tz: string;
  notifyAt: string;   // "HH:MM"
  program: string;
  days: Record<string, string[]>;
  test?: string;      // 선택 필드. ISO 초 단위 UTC ("2026-10-03T10:05:00Z"). dev 인스턴스만 읽는다
}
```

다음을 export 한다.

- `validateMeta(raw: unknown): ValidMeta | null` — 다음 경우에 null 을 반환한다: `v !== 1`, 알 수 없는 `tz`(`Intl.DateTimeFormat` try/catch 로 검증), `notifyAt` 이 `/^\d{2}:\d{2}$/` 에 맞지 않음, 필수 필드 없음.
- `shouldSend(meta: ValidMeta, nowUtc: Date): boolean` — `Intl.DateTimeFormat` 으로 `nowUtc` 를 구독의 현지 시각으로 변환한다. 판정 조건:
  1. 현지 요일이 `meta.days` 의 키 중 하나이고 해당 배열이 비어 있지 않다.
  2. 현지 시각이 `[notifyAt, notifyAt + 30분)` 안에 있다.
  3. 창이 현지 자정을 넘지 않는다 — SPEC EC-80 참조.
- `filterSubscriptions(items: SubscriptionItem[], nowUtc: Date): DecideResult[]` — 각 항목에 `validateMeta` · `shouldSend` 를 적용한다. 검증 실패 항목은 건너뛴다(진입점이 로그에 남김). 보낼 것들만 반환한다.
- `shouldTestSend(meta: ValidMeta, nowUtc: Date): boolean` — 두 조건이 모두 참일 때 true 를 반환한다: (1) `meta.test` 가 유효한 ISO 문자열이다(`new Date(meta.test).toString() !== 'Invalid Date'`), (2) `nowUtc - new Date(meta.test) <= 10분`. dev 인스턴스 전용 — prod 는 호출하지 않는다.

### 3. `cron/message.ts` 생성

순수 함수.

```ts
interface CronMessage {
  to: string;
  notification: {
    title: string;
    body: string;
    url: string;
    tag: string;
    icon: string;
  };
  dedupKey: string;
}
```

다음을 export 한다.

- `buildMessage(result: DecideResult, appBaseUrl: string, nowUtc: Date): CronMessage` — 정규 알림 메시지를 조립한다.
  - `title`: `'BigSix'`
  - `body`: `'${meta.program} · ${days[weekday].join(', ')}'` (오늘 현지 요일 키 사용)
  - `url`: `'/'`
  - `tag`: `'bigsix-workday'`
  - `icon`: `${appBaseUrl}/icon-192.png` (절대 URL — IR-6 의 상대 경로 출처 모호성 우회, Phase 7 실기기 확인)
  - `dedupKey`: `meta.tz` 기준 오늘 날짜 `YYYY-MM-DD`
- `buildTestMessage(result: DecideResult, appBaseUrl: string, nowUtc: Date): CronMessage` — 테스트 알림 메시지를 조립한다. dev 인스턴스 전용.
  - `title`: `'BigSix'`
  - `body`: `'테스트 · HH:MM · ${regularBody}'`. `HH:MM` 은 `meta.test` 를 `meta.tz` 현지 시각으로 변환한 `HH:MM` 값 (`Intl.DateTimeFormat` 사용, SPEC FR-35.8). `regularBody` 는 현지 요일이 `meta.days` 에 있으면 `buildMessage` 의 body 와 같고, 없으면(휴식일) `'${meta.program} · 오늘 휴식일'` 을 쓴다.
  - `url`, `tag`, `icon`: `buildMessage` 와 같음
  - `dedupKey`: `'test-' + YYYYMMDDHHMMSS` — `meta.test` 의 UTC 시각을 `YYYYMMDDHHmmss` 형식으로 변환 (초 단위). 같은 초에 누른 경우 1건만 발송된다.
- `buildRequestId(nowUtc: Date): string` — `bigsix-<UTC YYYY-MM-DDTHH:MM>-<crypto.randomBytes(2).toString('hex')>` 를 반환한다.
- `estimatedMessageBytes(msg: CronMessage): number` — `JSON.stringify(msg).length` (3072 바이트 상한 확인용).

### 4. `cron/push.ts` 생성

진입점 — I/O 와 흐름 제어만 담당한다.

CLI 인자: `--instance <prod|dev>`. 없거나 인식 불가 시 `'prod'` 로 취급한다.

단계:

1. `const instance = parseInstance(process.argv)`. (`'prod' | 'dev'` 를 반환하는 순수 함수)
2. `const { relayApi, relayKey } = readEnv()`.
3. `const nowUtc = new Date()`.
4. `const requestId = buildRequestId(nowUtc)`. stdout 에 기록한다.
5. `next` 가 null 이 될 때까지 `GET ${relayApi}/v1/subscriptions` 를 `?after=<next>` 로 이어 받아 모든 항목을 수집한다. 헤더: `Authorization: Bearer ${relayKey}`.
6. `validateMeta` 가 null 을 반환한 항목마다 건너뜀 사유를 stdout 에 기록한다.
7. **정규 발송**: `const toSend = filterSubscriptions(items, nowUtc)`. `toSend` 가 0건이면 정규 send 를 건너뛴다.
8. 정규 메시지 발송: `messages = toSend.map(r => buildMessage(r, APP_BASE_URL, nowUtc))`. `APP_BASE_URL` = `'https://bigsix.siot-ieung.duckdns.org'` (운영 인스턴스용 상수).
9. **테스트 발송 (dev 전용)**: `instance === 'dev'` 일 때, 수집된 모든 항목 중 `shouldTestSend(meta, nowUtc)` 가 true 인 것들에 대해 `buildTestMessage(r, APP_BASE_URL, nowUtc)` 로 메시지를 조립해 `messages` 에 추가한다. `instance === 'prod'` 이면 이 단계를 건너뛴다(`meta.test` 를 읽지 않는다).
10. `messages` 가 0건이면 send 를 호출하지 않고 종료한다.
11. `POST ${relayApi}/v1/send` 에 `{ requestId, messages }` 를 전송한다.
12. `status !== 'sent'` 인 결과를 모두 stdout 에 기록한다.

Node 24 네이티브 TS 실행: `node --experimental-strip-types cron/push.ts` 로 실행한다. 해당 Node 버전에서 플래그가 필요 없으면 생략하고 이 페이즈에서 확인 결과를 문서화한다.

`APP_BASE_URL` 상수는 `cron/push.ts` 에 정의한다. 추후 dev 인스턴스도 cron 을 돌린다면 `PUSH_APP_BASE_URL` 환경변수로 읽도록 변경한다.

## 완료 체크리스트

- [x] `cron/env.ts` 생성 — 변수 누락 시 설명 있는 오류 throw: Verified in `cron/env.ts:15-30`
- [x] `cron/decide.ts` 생성 — `validateMeta`, `shouldSend`, `filterSubscriptions`, `shouldTestSend`: Verified in `cron/decide.ts:52, 123, 139, 159`
- [x] `cron/message.ts` 생성 — `buildMessage`, `buildTestMessage`, `buildRequestId`, `estimatedMessageBytes`: Verified in `cron/message.ts:86, 113, 149, 160`
- [x] `cron/push.ts` 생성 — `--instance` 파싱, 페이지네이션, 정규+테스트 발송, 0건 시 send 미호출: Verified in `cron/push.ts:42, 81, 148-210`
- [x] prod 인스턴스가 `meta.test` 를 읽지 않음을 확인: `cron/push.ts:175` — `instance === 'dev'` guard
- [x] Node 24 TS 실행 플래그 확인·문서화: Node 24.15.0 — `--experimental-strip-types` is default in 24.3+, no flag needed. Confirmed: `node cron/push.ts --instance dev` runs natively. See `cron/push.ts:3`.
- [x] `pnpm test` 통과: 906 tests passed (50 files)

### 추가 확인 (Phase 6 검증 시)

- [x] `cron/` 이 `src/` 를 import 하지 않음: grep으로 확인, 0건
- [x] 신규 npm 의존성 없음: `package.json` diff 에 `cron/` 관련 의존성 없음
- [x] no env 시 non-zero 종료 + 명확한 메시지: `PUSH_RELAY_API` 오류 메시지 출력 후 exit 1
- [x] icon URL: prod·dev 모두 `https://bigsix.siot-ieung.duckdns.org/icon-192.png` (절대 URL) — dev-relay 빌드도 실제 도메인에 배포되므로 동일 상수 사용이 적절. 추후 유연성이 필요하면 `PUSH_APP_BASE_URL` 환경변수로 전환 (push.ts:124 주석 참조)
- [x] 3072 바이트 상한 초과 메시지 스킵 (coder 추가): `cron/push.ts:185-193` — 요청 전체 400 방지. 코더 추가 사항이나 §6 기준상 적절함
- [x] IR-10, IR-11 SPEC IR 로그에 기록 완료

## 참고

- `cron/` 은 `src/` 를 import 하지 않는다. `PushMeta` 형태는 `cron/` 타입에 인라인 선언한다.
- 모든 시간 계산은 `Intl.DateTimeFormat` 을 사용한다 — 외부 날짜 라이브러리 없음.
- `requestId` 는 send 호출 전에 로그에 남긴다 — 응답을 잃어도 수동으로 조회할 수 있다.

## 페이즈 종료 전 IR 로그 갱신

이 페이즈에서 쓰는 `integration.md` 절: **§6 cron API** (구독 목록 페이지네이션, 발송 요청 형식, 3072 바이트 상한), **§7 재시도 규칙** (`failed` · `gone` · `suppressed` 처리, `requestId` 로그 의무). cron API 구현 중 발견한 `integration.md` 이슈를 SPEC IR 로그에 기록한다.

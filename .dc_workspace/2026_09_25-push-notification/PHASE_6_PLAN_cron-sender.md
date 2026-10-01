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
}
```

다음을 export 한다.

- `validateMeta(raw: unknown): ValidMeta | null` — 다음 경우에 null 을 반환한다: `v !== 1`, 알 수 없는 `tz`(`Intl.DateTimeFormat` try/catch 로 검증), `notifyAt` 이 `/^\d{2}:\d{2}$/` 에 맞지 않음, 필수 필드 없음.
- `shouldSend(meta: ValidMeta, nowUtc: Date): boolean` — `Intl.DateTimeFormat` 으로 `nowUtc` 를 구독의 현지 시각으로 변환한다. 판정 조건:
  1. 현지 요일이 `meta.days` 의 키 중 하나이고 해당 배열이 비어 있지 않다.
  2. 현지 시각이 `[notifyAt, notifyAt + 30분)` 안에 있다.
  3. 창이 현지 자정을 넘지 않는다 — SPEC EC-80 참조.
- `filterSubscriptions(items: SubscriptionItem[], nowUtc: Date): DecideResult[]` — 각 항목에 `validateMeta` · `shouldSend` 를 적용한다. 검증 실패 항목은 건너뛴다(진입점이 로그에 남김). 보낼 것들만 반환한다.

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

- `buildMessage(result: DecideResult, appBaseUrl: string): CronMessage` — 메시지를 조립한다.
  - `title`: `'빅6'`
  - `body`: `'${meta.program} · ${days[weekday].join(', ')}'` (오늘 현지 요일 키 사용)
  - `url`: `'/'`
  - `tag`: `'bigsix-workday'`
  - `icon`: `${appBaseUrl}/icon-192.png` (절대 URL — IR-6 의 상대 경로 출처 모호성 우회, Phase 7 실기기 확인)
  - `dedupKey`: `meta.tz` 기준 오늘 날짜 `YYYY-MM-DD`
- `buildRequestId(nowUtc: Date): string` — `bigsix-<UTC YYYY-MM-DDTHH:MM>-<crypto.randomBytes(2).toString('hex')>` 를 반환한다.
- `estimatedMessageBytes(msg: CronMessage): number` — `JSON.stringify(msg).length` (3072 바이트 상한 확인용).

### 4. `cron/push.ts` 생성

진입점 — I/O 와 흐름 제어만 담당한다.

단계:

1. `const { relayApi, relayKey } = readEnv()`.
2. `const nowUtc = new Date()`.
3. `const requestId = buildRequestId(nowUtc)`. stdout 에 기록한다.
4. `next` 가 null 이 될 때까지 `GET ${relayApi}/v1/subscriptions` 를 `?after=<next>` 로 이어 받아 모든 항목을 수집한다. 헤더: `Authorization: Bearer ${relayKey}`.
5. `validateMeta` 가 null 을 반환한 항목마다 건너뜀 사유를 stdout 에 기록한다.
6. `const toSend = filterSubscriptions(items, nowUtc)`.
7. `toSend` 가 0건이면 send 를 호출하지 않고 종료한다.
8. `messages = toSend.map(r => buildMessage(r, APP_BASE_URL))`. `APP_BASE_URL` = `'https://bigsix.siot-ieung.duckdns.org'` (홈서버 운영 인스턴스용 상수).
9. `POST ${relayApi}/v1/send` 에 `{ requestId, messages }` 를 전송한다.
10. `status !== 'sent'` 인 결과를 모두 stdout 에 기록한다.

Node 24 네이티브 TS 실행: `node --experimental-strip-types cron/push.ts` 로 실행한다. 해당 Node 버전에서 플래그가 필요 없으면 생략하고 이 페이즈에서 확인 결과를 문서화한다.

`APP_BASE_URL` 상수는 `cron/push.ts` 에 정의한다. 추후 dev 인스턴스도 cron 을 돌린다면 `PUSH_APP_BASE_URL` 환경변수로 읽도록 변경한다.

## 완료 체크리스트

- [ ] `cron/env.ts` 생성
- [ ] `cron/decide.ts` 생성 — `validateMeta`, `shouldSend`, `filterSubscriptions`
- [ ] `cron/message.ts` 생성 — `buildMessage`, `buildRequestId`, `estimatedMessageBytes`
- [ ] `cron/push.ts` 생성 — 페이지네이션, 0건 시 send 미호출
- [ ] Node 24 TS 실행 플래그 확인·문서화
- [ ] `pnpm test` 통과

## 참고

- `cron/` 은 `src/` 를 import 하지 않는다. `PushMeta` 형태는 `cron/` 타입에 인라인 선언한다.
- 모든 시간 계산은 `Intl.DateTimeFormat` 을 사용한다 — 외부 날짜 라이브러리 없음.
- `requestId` 는 send 호출 전에 로그에 남긴다 — 응답을 잃어도 수동으로 조회할 수 있다.

## 페이즈 종료 전 IR 로그 갱신

이 페이즈에서 쓰는 `integration.md` 절: **§6 cron API** (구독 목록 페이지네이션, 발송 요청 형식, 3072 바이트 상한), **§7 재시도 규칙** (`failed` · `gone` · `suppressed` 처리, `requestId` 로그 의무). cron API 구현 중 발견한 `integration.md` 이슈를 SPEC IR 로그에 기록한다.

# Phase 3 — 스케줄러 + VAPID 발송

**목표**
1분마다 도는 스케줄러가 조건 맞는 구독에 실제 push 를 쏜다. `web-push` 로 VAPID 서명, `Intl.DateTimeFormat` 으로 TZ 매칭, `(endpoint, 로컬날짜)` dedup, 410/404 자동 정리.

## SPEC 참조

- FR-37.1: 1분마다 실행 (systemd timer 는 Phase 4). 이 페이즈에서는 CLI 진입점만.
- FR-37.2: 발송 조건 — 요일 매칭 + 정확한 시각(HH:MM) 매칭.
- FR-37.3: 중복 방지 — `(endpoint, 날짜)` 하루 1회. 보존 기간 = 8일 (GLOBAL ADR-32).
- FR-37.4: 410/404 → 저장소에서 즉시 삭제.
- FR-37.5: VAPID 비밀키는 파일 경로 (환경변수도 허용) 로 공급.
- FR-38 push 페이로드: `{ title, body, icon }`.
- H-9, H-10: 알림 본문 형식 = 「빅6 / {프로그램 한국어명} · {종목1, 종목2}」. 서버가 `progressions.json` + `programId` + 요일로 계산.
- H-11: 타임존은 저장된 `sub.tz` 기준.

## 변경 파일

| 파일 | 편집 종류 | 내용 |
|---|---|---|
| `server/src/progressions.ts` | 편집 | Phase 2 stub 확장. `programName(id)`, `progressionsForDay(programId, weekdayKo)` 추가 |
| `server/src/scheduler.ts` | 신규 | tick 함수 · 매칭 로직 · dedup · pruning · 진입점 |
| `server/src/push.ts` | 신규 | `web-push` 래퍼. VAPID 키 로드, sendNotification, 401/404/410 분류 |
| `server/src/config.ts` | 편집 | `vapidPrivateKeyPath`, `vapidPublicKey`, `vapidSubject` 3필드 추가 |
| `tests/server/test-scheduler.mjs` | 신규 | tick 매칭 · dedup · pruning 검증 |
| `tests/server/test-push-wrapper.mjs` | 신규 | web-push 응답 코드 분류 검증 (실제 발송은 not, mock 응답) |
| `tests/server/test-progressions.mjs` | 신규 | 요일별 종목 · 프로그램 이름 확인 |

## 알림 본문 계산 (FR-34.2, H-9·H-10)

`server/src/progressions.ts:progressionsForDay(programId, weekdayKo)` 는 `programs[id].schedule[weekdayKo]` 배열의 각 요소 첫 번째 값(한국어 종목명) 을 뽑아 배열로 돌려준다. `schedule` 은 `[["푸시업", "2세트"], ["레그 레이즈", "2세트"]]` 형태.

```ts
// 예: good_behavior 월요일 → ['푸시업', '레그 레이즈']
export function progressionsForDay(programId: string, weekdayKo: WeekdayKo): string[] {
  const p = programByIdOrNull(programId);
  if (p === null) return [];
  const rows = p.schedule[weekdayKo] ?? [];
  return rows.map((r) => r[0] as string);
}

export function programName(programId: string): string | null {
  const p = programByIdOrNull(programId);
  return p?.name.ko ?? null;
}
```

발송 payload:

```ts
export function buildPayload(programId: string, weekdayKo: WeekdayKo): PushPayload | null {
  const name = programName(programId);
  if (name === null) return null;
  const items = progressionsForDay(programId, weekdayKo);
  if (items.length === 0) return null;      // 휴식일 (FR-34.4)
  return {
    title: '빅6',
    body: `${name} · ${items.join(', ')}`,
    icon: '/icon-192.png',
  };
}
```

## 스케줄러 tick 초안 (`server/src/scheduler.ts`)

```ts
import { loadStore, saveStore, removeSubscription, type Store, type Subscription } from './subscriptions.ts';
import { loadConfig } from './config.ts';
import { buildPayload, type WeekdayKo, WEEKDAYS } from './progressions.ts';
import { sendPush, PushErrorKind } from './push.ts';

export interface Tick {
  dataDir: string;
  now: Date;                                  // 주입 가능 (tests)
  vapid: { subject: string; publicKey: string; privateKey: string };
  retentionDays: number;                      // 기본 8
}

export async function runTick(tick: Tick): Promise<{ sent: number; skipped: number; removed: number }> {
  const store = await loadStore(tick.dataDir);
  let next = store;
  let sent = 0, skipped = 0, removed = 0;

  for (const [endpoint, sub] of Object.entries(store.subscriptions)) {
    const local = localizeToTz(tick.now, sub.tz);
    // { date: 'YYYY-MM-DD', hhmm: 'HH:MM', weekday: '월' }
    if (local === null) { skipped++; continue; }             // 잘못된 tz
    if (local.hhmm !== sub.notifyAt) { skipped++; continue; }
    const payload = buildPayload(sub.programId, local.weekday);
    if (payload === null) { skipped++; continue; }           // 휴식일 · 알 수 없는 programId
    const key = `${endpoint}|${local.date}`;
    if (next.sentLog[key] !== undefined) { skipped++; continue; }

    const result = await sendPush(endpoint, sub, payload, tick.vapid);
    if (result.kind === 'ok') {
      next = { ...next, sentLog: { ...next.sentLog, [key]: new Date().toISOString() } };
      sent++;
    } else if (result.kind === 'gone') {
      next = removeSubscription(next, endpoint);
      removed++;
    } else {
      // 401 (서명 실패), 500, 네트워크 오류 — 저장소는 건드리지 않고 다음 tick 에서 재시도.
      console.error(`push 실패 ${endpoint}: ${result.reason}`);
      skipped++;
    }
  }

  // dedup 로그 pruning — 로컬 오늘 기준 −retentionDays 초과 삭제.
  const prunedLog = pruneSentLog(next.sentLog, tick.now, tick.retentionDays);
  if (prunedLog !== next.sentLog) next = { ...next, sentLog: prunedLog };

  if (next !== store) await saveStore(tick.dataDir, next);
  return { sent, skipped, removed };
}

export function localizeToTz(instant: Date, tz: string): { date: string; hhmm: string; weekday: WeekdayKo } | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(instant).map((p) => [p.type, p.value]));
    // en-CA: year, month, day, hour, minute, weekday(short: Mon/Tue/...).
    const weekdayEn = parts.weekday as string;
    const map: Record<string, WeekdayKo> = { Mon:'월', Tue:'화', Wed:'수', Thu:'목', Fri:'금', Sat:'토', Sun:'일' };
    const weekday = map[weekdayEn];
    if (weekday === undefined) return null;
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const hhmm = `${parts.hour}:${parts.minute}`;
    return { date, hhmm, weekday };
  } catch { return null; }
}

export function pruneSentLog(log: Record<string, string>, now: Date, retentionDays: number): Record<string, string> {
  // "endpoint|YYYY-MM-DD" 키에서 날짜만 뽑아 오늘 −retentionDays 초과면 제거.
  const cutoff = new Date(now); cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);   // YYYY-MM-DD (UTC 기준, 보수적)
  let changed = false;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(log)) {
    const pipeIdx = k.lastIndexOf('|');
    const date = pipeIdx === -1 ? '' : k.slice(pipeIdx + 1);
    if (date >= cutoffStr) out[k] = v; else changed = true;
  }
  return changed ? out : log;
}

// CLI 진입점 — systemd timer 가 이 파일을 부른다.
if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadConfig();
  const vapid = readVapid(cfg);
  const result = await runTick({
    dataDir: cfg.dataDir, now: new Date(),
    vapid, retentionDays: 8,
  });
  console.log('tick', result);
}
```

## `server/src/push.ts` 초안

```ts
import webpush from 'web-push';
import type { Subscription } from './subscriptions.ts';

export type PushErrorKind = 'gone' | 'auth' | 'network' | 'other';
export interface PushResult {
  kind: 'ok' | PushErrorKind;
  status?: number;
  reason?: string;
}

export async function sendPush(
  endpoint: string, sub: Subscription, payload: unknown,
  vapid: { subject: string; publicKey: string; privateKey: string },
): Promise<PushResult> {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  try {
    await webpush.sendNotification(
      { endpoint, keys: sub.keys },
      JSON.stringify(payload),
    );
    return { kind: 'ok' };
  } catch (e) {
    const err = e as { statusCode?: number; message?: string };
    const s = err.statusCode ?? 0;
    if (s === 404 || s === 410) return { kind: 'gone', status: s };
    if (s === 401 || s === 403) return { kind: 'auth', status: s, reason: err.message };
    if (s === 0) return { kind: 'network', reason: err.message };
    return { kind: 'other', status: s, reason: err.message };
  }
}
```

## 커밋 경계 (3개)

### (a) `feat(server): progressions 로더 확장 (요일별 종목 · 프로그램 이름)`

- `server/src/progressions.ts` 편집: `programName`, `progressionsForDay`, `buildPayload`, `WEEKDAYS` 상수.
- `tests/server/test-progressions.mjs` — 5개 프로그램 × 7 요일 매트릭스 중 대표 케이스 (모범수 월/수/금 · 신참 월/목 · 슈퍼맥스 일요일 휴식) 검증.

### (b) `feat(server): 스케줄러 tick — 매칭 · dedup · 만료 정리`

- `server/src/scheduler.ts` 신규 (위 초안).
- `server/src/config.ts` 에 VAPID 필드 추가 (읽기만, 실제 파일 없어도 dev 에선 기본값으로 loadConfig 성공. Phase 4 에서 배포 환경변수·파일 잡음).
- `tests/server/test-scheduler.mjs`:
  - **매칭 매트릭스** — mocked `now` (2026-11-30 월 19:00 KST) 로 tick 실행 → good_behavior 구독자 대상 `sent=1`, `skipped=0`.
  - **휴식일 스킵** — good_behavior + 화요일 tick → `sent=0, skipped=1`.
  - **시각 불일치** — 19:01 tick, notifyAt=19:00 → `sent=0, skipped=1`.
  - **dedup** — 같은 tick 을 두 번 실행 → 두 번째는 `sent=0, skipped=1`.
  - **다른 tz** — 서울 유저 + 뉴욕 유저 · 같은 UTC now → 서울 유저만 발송.
  - **pruning** — 9일 전 로그 엔트리는 tick 후 삭제, 7일 전 엔트리는 유지.
  - `sendPush` 는 mock (아래 (c) 에서 wrapper 테스트, 여기서는 stub 을 주입).

### (c) `feat(server): push 래퍼 (web-push · 상태코드 분류)`

- `server/src/push.ts` 신규.
- `tests/server/test-push-wrapper.mjs`:
  - `web-push` 를 스텁 (그 lib 의 `sendNotification` 을 monkey-patch) — 응답 status 별로 `PushResult.kind` 매핑 검증.
  - 200 → `ok`, 404 → `gone`, 410 → `gone`, 401 → `auth`, 500 → `other`, throw → `network`.
- **410/404 → subscriptions 삭제** 연계는 (b) 의 tick 테스트에서 함께 검증 (mocked sendPush 가 `gone` 반환 → tick 종료 시 store 에서 사라짐).

## 완료 기준

- 커밋 a~c 전부에서 `pnpm test` 797 유지 (앱 tests 영향 없음).
- `bash tests/server/run.sh` 5 스위트(subscribe · store · no-secrets · progressions · scheduler · push-wrapper — 6개) 전부 통과.
- `node --experimental-strip-types server/src/scheduler.ts` 로컬 실행 시:
  - VAPID 키 파일 부재 → `readVapid` 에서 에러 메시지 명확 (dev 모드 안내).
  - VAPID 키 있고 구독 있으면 실제 tick 실행 후 콘솔에 `tick { sent, skipped, removed }`.
- 이 페이즈 완료 후 서버는 발송 능력을 가진다. 배포되지 않았으므로 실제 발송은 Phase 4 이후.

## 위험

- **RISK-5** (동시 쓰기): API 서버(Phase 2) 와 스케줄러가 같은 파일. 스케줄러가 tick 중 API 요청이 들어오면 lost update 가능. 실측 부하 낮으므로 감수 (GLOBAL RISK-5). 발생 시 다음 tick 에서 자동 복구.
- **Intl.DateTimeFormat 'en-CA' 파싱**: 브라우저·Node 마다 formatToParts 의 파트 순서가 다를 수 있으나 우리는 `Object.fromEntries` 로 이름 인덱스라 순서 무관.
- **`pruneSentLog` 의 UTC 기준**: 로컬 날짜로 저장된 키를 UTC 오늘 - 8일 로 자름. 최악의 경우 하루 이르게 삭제될 수 있으나 dedup 목적상 이미 지난 날짜라 문제 없음.
- **web-push VAPID subject**: `mailto:<이메일>` 형식이 표준. `deploy/README.md` 에 명시 필요 (Phase 4). 잘못된 subject 는 서명 실패 → `auth` kind.

## 임시 배포

이 페이즈에 포함하지 않는다.

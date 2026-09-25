# Phase 2 — 서버 뼈대 + `POST/DELETE /api/push/subscribe`

**목표**
저장소의 **첫 서버 런타임** 뼈대를 세운다. `server/` 하위 신설, Node.js 24 + native `http` 로 두 엔드포인트, JSON 파일 저장소, 서버 tests. 아직 발송은 없다 — Phase 3 에서. 배포는 없다 — Phase 4 에서.

## SPEC 참조

- FR-36.1: `POST /api/push/subscribe` — upsert, 201 신규 / 200 갱신.
- FR-36.2: `DELETE /api/push/subscribe` — idempotent 204.
- FR-36.3: CORS 없음 (같은 origin 만).
- FR-36.4: 잘못된 요청은 400 + 이유 문자열.
- Constraints: `web-push` (Phase 3) · `@types/web-push`. 이 페이즈에서는 아직 발송 없으므로 `web-push` 는 dep 만 등록하고 미사용 상태로 둘 수 있으나, 초기화·타입 확인을 위해 이 페이즈에서 dep 만 추가하고 실제 사용은 Phase 3.
- ADR-29 (Node.js 24 native http), ADR-30 (`server/` 배치), ADR-31 (`subscriptions.json` 스키마).

## 변경 파일

| 파일 | 편집 종류 | 내용 |
|---|---|---|
| `server/package.json` | 신규 | `{"type": "module", "engines": {"node": ">=24"}, "dependencies": {"web-push": "^3.6.0"}}` |
| `server/package-lock.json` | 자동 | npm install 결과 |
| `server/tsconfig.json` | 신규 | strict, `moduleResolution: "nodenext"`, `target: "es2023"`, `lib: ["es2023"]`, `noEmit: true` (실행은 `--experimental-strip-types`) |
| `server/src/index.ts` | 신규 | http.Server 진입점. 라우팅 → subscribe 핸들러 |
| `server/src/subscriptions.ts` | 신규 | JSON 파일 저장소 (read/upsert/delete/list). rename-atomic |
| `server/src/config.ts` | 신규 | 환경 변수 로더 (`BIGSIX_PORT`, `BIGSIX_DATA_DIR`), 기본값 (8791, `./server/data`) |
| `server/src/progressions.ts` | 신규 (stub) | `readProgramIds(): Set<string>` 만. Phase 3 에서 확장 |
| `server/src/handlers.ts` | 신규 | 순수 라우팅 로직. 요청 파싱·검증·응답 조립. tests 대상 |
| `server/data/.gitkeep` | 신규 | 디렉터리 자체는 커밋 |
| `.gitignore` | 편집 | `server/data/*`, `!server/data/.gitkeep`, `server/node_modules/` 추가 |
| `tests/server/run.sh` | 신규 | 모든 서버 tests 실행 (tests/deploy/run.sh 스타일) |
| `tests/server/helpers.mjs` | 신규 | 임시 포트에 서버 부팅, `fetch` 요청 헬퍼 |
| `tests/server/test-subscribe.mjs` | 신규 | POST/DELETE `/api/push/subscribe` 검증 |
| `tests/server/test-subscriptions-store.mjs` | 신규 | JSON 파일 저장소 유닛 검증 |
| `tests/server/test-no-secrets.mjs` | 신규 | ADR-33 저장소 안전 장치 (grep) |

## `server/` 파일 초안

### `server/src/config.ts`

```ts
export interface Config {
  port: number;
  dataDir: string;         // subscriptions.json 이 놓일 디렉터리
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number.parseInt(env.BIGSIX_PORT ?? '8791', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`BIGSIX_PORT 가 유효한 정수가 아님: ${env.BIGSIX_PORT}`);
  }
  const dataDir = env.BIGSIX_DATA_DIR ?? 'server/data';
  return { port, dataDir };
}
```

### `server/src/subscriptions.ts`

```ts
import { readFile, rename, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface Subscription {
  keys: { p256dh: string; auth: string };
  programId: string;
  notifyAt: string;      // "HH:MM"
  tz: string;            // IANA
  createdAt: string;     // ISO local
  updatedAt: string;
}

export interface Store {
  version: 1;
  subscriptions: Record<string, Subscription>;
  sentLog: Record<string, string>;   // "<endpoint>|YYYY-MM-DD" → ISO
}

export function emptyStore(): Store {
  return { version: 1, subscriptions: {}, sentLog: {} };
}

export async function loadStore(dir: string): Promise<Store> {
  const path = join(dir, 'subscriptions.json');
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    // shape 검사: version === 1, subscriptions 는 object, sentLog 는 object.
    if (!isStoreShape(parsed)) return emptyStore();
    return parsed;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore();
    throw e;
  }
}

export async function saveStore(dir: string, store: Store): Promise<void> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, 'subscriptions.json');
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  await writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
  await rename(tmp, path);   // POSIX atomic
}

export function upsertSubscription(
  store: Store, endpoint: string, sub: Omit<Subscription, 'createdAt' | 'updatedAt'>, now: string,
): { store: Store; created: boolean } {
  const existing = store.subscriptions[endpoint];
  const created = existing === undefined;
  const createdAt = existing?.createdAt ?? now;
  const next: Store = {
    ...store,
    subscriptions: {
      ...store.subscriptions,
      [endpoint]: { ...sub, createdAt, updatedAt: now },
    },
  };
  return { store: next, created };
}

export function removeSubscription(store: Store, endpoint: string): Store {
  if (store.subscriptions[endpoint] === undefined) return store;
  const { [endpoint]: _, ...rest } = store.subscriptions;
  // sentLog 에서도 이 endpoint 프리픽스 항목 정리.
  const sentLog = Object.fromEntries(
    Object.entries(store.sentLog).filter(([k]) => !k.startsWith(`${endpoint}|`)),
  );
  return { ...store, subscriptions: rest, sentLog };
}

function isStoreShape(v: unknown): v is Store {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return o.version === 1
    && typeof o.subscriptions === 'object' && o.subscriptions !== null
    && typeof o.sentLog === 'object' && o.sentLog !== null;
}
```

### `server/src/handlers.ts`

```ts
import { loadStore, saveStore, upsertSubscription, removeSubscription } from './subscriptions.ts';
import { readProgramIds } from './progressions.ts';

export interface HandleContext {
  dataDir: string;
  now: () => string;                   // ISO local. tests 에서 주입 가능.
  programIds: () => Set<string>;       // Phase 3 에서 채운다. Phase 2 는 stub.
}

export interface Response { status: number; body?: string; }

export async function handleSubscribePost(body: string, ctx: HandleContext): Promise<Response> {
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return { status: 400, body: 'not-json' }; }
  const check = validateSubscribeBody(parsed, ctx.programIds());
  if (!check.ok) return { status: 400, body: check.reason };
  const store = await loadStore(ctx.dataDir);
  const { endpoint, keys, programId, notifyAt, tz } = check.value;
  const { store: next, created } = upsertSubscription(
    store, endpoint, { keys, programId, notifyAt, tz }, ctx.now(),
  );
  await saveStore(ctx.dataDir, next);
  return { status: created ? 201 : 200 };
}

export async function handleSubscribeDelete(body: string, ctx: HandleContext): Promise<Response> {
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return { status: 400, body: 'not-json' }; }
  if (typeof parsed !== 'object' || parsed === null) return { status: 400, body: 'shape' };
  const endpoint = (parsed as { endpoint?: unknown }).endpoint;
  if (typeof endpoint !== 'string') return { status: 400, body: 'endpoint-missing' };
  const store = await loadStore(ctx.dataDir);
  const next = removeSubscription(store, endpoint);
  if (next !== store) await saveStore(ctx.dataDir, next);
  return { status: 204 };
}

// (validateSubscribeBody 는 shape · tz · notifyAt regex · programId 존재 검사)
export interface SubscribeBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  programId: string;
  notifyAt: string;
  tz: string;
}
export function validateSubscribeBody(
  v: unknown, programIds: Set<string>,
): { ok: true; value: SubscribeBody } | { ok: false; reason: string } {
  // ... (shape 검사 + notifyAt regex + IANA tz 검사 via Intl.DateTimeFormat + programId 존재)
  // 구현은 코더가 채운다.
}
```

### `server/src/index.ts`

```ts
import { createServer } from 'node:http';
import { loadConfig } from './config.ts';
import { handleSubscribePost, handleSubscribeDelete, type HandleContext } from './handlers.ts';
import { readProgramIds } from './progressions.ts';

const cfg = loadConfig();
const ctx: HandleContext = {
  dataDir: cfg.dataDir,
  now: () => new Date().toISOString(),   // tz 는 스케줄러에서 처리. API 층은 UTC ISO 로 충분.
  programIds: () => readProgramIds(),
};

const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString('utf8');
  let out;
  if (req.method === 'POST' && req.url === '/subscribe') {
    out = await handleSubscribePost(body, ctx);
  } else if (req.method === 'DELETE' && req.url === '/subscribe') {
    out = await handleSubscribeDelete(body, ctx);
  } else {
    out = { status: 404, body: 'not-found' };
  }
  res.writeHead(out.status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(out.body ?? '');
  console.log(req.method, req.url, out.status);
});
server.listen(cfg.port, '127.0.0.1', () => console.log(`bigsix push api on ${cfg.port}`));
```

- **주의**: nginx `proxy_pass http://127.0.0.1:8791/;` (끝의 슬래시) 가 `/api/push/subscribe` → `/subscribe` 로 rewrite. 서버는 `/subscribe` 만 안다.

### `server/src/progressions.ts` (Phase 2 stub, Phase 3 확장)

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(HERE, '..', '..', 'src', 'lib', 'data', 'progressions.json');

interface Data { programs: Array<{ id: string; name: { ko: string }; schedule: Record<string, unknown[]> }>; }

let cache: Data | null = null;
function load(): Data {
  if (cache === null) cache = JSON.parse(readFileSync(JSON_PATH, 'utf8')) as Data;
  return cache;
}

export function readProgramIds(): Set<string> {
  return new Set(load().programs.map((p) => p.id));
}
```

## 커밋 경계 (3개)

### (a) `feat(server): 뼈대와 저장소 헬퍼 (ADR-29~31)`

- `server/package.json`, `server/tsconfig.json`, `.gitignore` 편집.
- `server/src/config.ts`, `server/src/subscriptions.ts`, `server/src/progressions.ts` (stub), `server/data/.gitkeep`.
- `tests/server/run.sh`, `tests/server/helpers.mjs`, `tests/server/test-subscriptions-store.mjs`.
- `bash tests/server/run.sh` 로 store 테스트 통과.
- `pnpm check`, `pnpm test` 에는 영향 없음 (앱 tests 분리) — `pnpm test` 797 유지.
- 서버 tests 는 별도 러너로 실행. `pnpm test` 에 포함시키지 않는다 (ADR-30 분리 원칙).

### (b) `feat(server): POST/DELETE /subscribe 엔드포인트`

- `server/src/handlers.ts`, `server/src/index.ts` 신규.
- `tests/server/test-subscribe.mjs` 신규 — 실제 http.Server 임시 포트로 부팅해 fetch:
  - POST 신규 body → 201.
  - 같은 endpoint 로 POST 갱신 (다른 notifyAt) → 200. 저장 파일 재읽어 확인.
  - 잘못된 shape POST → 400 + 이유.
  - 잘못된 notifyAt (`25:99`) → 400.
  - 유효하지 않은 tz (`Foo/Bar`) → 400.
  - 존재하지 않는 programId → 400.
  - DELETE 신규 (없는 endpoint) → 204.
  - DELETE 있는 endpoint → 204 + 파일에서 사라짐.
  - 알 수 없는 경로 → 404.
- `bash tests/server/run.sh` 통과.

### (c) `test(server): 저장소에 비밀 유출 방지 (ADR-33)`

- `tests/server/test-no-secrets.mjs` 신규 — 저장소 grep:
  - `-----BEGIN` (PEM), `PRIVATE KEY`, `BASE64_PRIVATE`, `vapid.private` 리터럴 등 패턴이 커밋된 파일에 없는지 확인. `server/data/*` (gitignore 대상) 는 검사 안 함.
- 이 커밋은 tests 만 추가. 통과 확인.

## 완료 기준

- 커밋 a~c 전부에서 `pnpm check` 0/0, `pnpm test` 797 그대로.
- `bash tests/server/run.sh` 전부 통과.
- `node --experimental-strip-types server/src/index.ts` 를 로컬에서 부팅 → `curl -X POST http://127.0.0.1:8791/subscribe -H 'Content-Type: application/json' -d '{...}'` 로 실제 응답 확인 (수동, 검증 메모에 기록).
- `.gitignore` 가 `server/data/subscriptions.json` 을 무시함 (`git status` 로 확인).
- 서버 코드는 아직 배포되지 않는다 (Phase 4).

## 위험 · 결정

- **RISK-5** (JSON 파일 동시 쓰기 경합): 이 페이즈에서 API 서버만 씀. 스케줄러(Phase 3)가 추가되면 실제 경합 시나리오. 이 페이즈의 테스트는 단일 프로세스 순차 요청만 검증.
- **web-push dep**: 이 페이즈에서는 미사용이지만 npm install 시 함께 잡히도록 `dependencies` 에 등록. Phase 3 에서 실제 import 시작.
- **`pnpm test` 와 서버 tests 분리**: 별도 러너 (`bash tests/server/run.sh`) 는 vitest 통합을 하지 않는다. 이유: 서버 코드가 앱 tsconfig 밖(`include` 밖) 이라 vitest 러너가 transitive import 를 해석 못 함. `tests/deploy/` 와 같은 방식이 검증됐다.
- **포트 8791**: GLOBAL 「배포 통합 요약」 확정. 다른 홈서버 서비스와 겹치지 않음 (cube-study 는 다른 포트). config 로 override 가능.

## 임시 배포

이 페이즈에 포함하지 않는다.

---

## 실측 이탈 사항 (타당성 검증 완료)

커밋 24470f9 · 1709e34 · 2e0f249 구현에서 PLAN 초안과 다른 점 7건. 모두 타당.

1. **`index.ts` 모듈화** — PLAN 초안은 `createServer` + `server.listen` 를 최상위에 직접 두는 스크립트였다. 실제 구현은 `buildContext()`, `createBigsixServer()`, `route()` 를 export 하고 `isEntry()` 가드로 직접 실행 여부를 판단한다. `tests/server/helpers.mjs` 의 `bootServer()` 가 이 export 를 직접 사용한다. 설계상 올바른 분리이며 테스트 편의를 위한 임시 우회가 아니다.

2. **`helpers.mjs` 에서 동적 import** — `bootServer` 내부에서 `await import('../../server/src/index.ts')` 를 동적으로 로드한다. `helpers.mjs` 는 저장소 유닛 테스트(`test-subscriptions-store.mjs`)도 공유하므로, 정적 import 시 서버 모듈이 불필요하게 로드된다. 동적 import 로 로드 범위를 `bootServer` 를 실제로 호출하는 테스트로 한정한 것은 정당하다.

3. **`HandlerResponse` 로 이름 변경** — PLAN 은 `Response` 타입을 쓰지만 브라우저 전역 `Response` 와 충돌하므로 `HandlerResponse` 로 명명했다. 기능 동일.

4. **`route()` 를 독립 export 로 추출** — PLAN 은 `createServer` 콜백 내부에 라우팅 로직을 인라인으로 뒀다. 실제 구현은 `route()` 를 별도 export 하여 테스트에서 직접 호출할 수 있게 했다.

5. **`keys` 서브 필드도 화이트리스트 검사** — PLAN 의 `validateSubscribeBody` 초안은 `keys.p256dh` / `keys.auth` 존재 여부만 확인했다. 실제 구현은 `keys` 객체에도 `Object.keys` 루프를 돌려 `p256dh`/`auth` 외 필드를 400 으로 거부한다. NFR-31 강화.

6. **`saveStore` tmp 이름에 랜덤 suffix 추가** — PLAN 의 예시는 `${path}.tmp.${process.pid}.${Date.now()}` 였다. 실제 구현은 여기에 `.${Math.random().toString(36).slice(2,8)}` 를 추가한다. 동일 프로세스·동일 밀리초 충돌 방어.

7. **`progressions.ts` 에 `path` 파라미터와 `_resetProgressionsCache` 추가** — PLAN 의 stub 은 `readProgramIds(): Set<string>` 하나였다. 실제 구현은 `readProgramIds(path?: string)` 로 경로 주입을 허용하고 `_resetProgressionsCache()` 로 테스트 간 캐시 초기화를 지원한다.

## 완료 기준 실측 결과

- `pnpm check` 0 errors 0 warnings ✓
- `pnpm test` 805 passed (797 기준선 + Phase 1 에서 추가된 8건 = 805. 서버 추가로 감소 없음) ✓
- `bash tests/server/run.sh` 85 통과 0 실패 (no-secrets 5 · subscribe 59 · store 21) ✓
- `bash tests/deploy/run.sh` 통과 ✓
- `.gitignore` 가 `server/data/subscriptions.json` · `vapid.private` 를 무시함 (`git check-ignore` 확인) ✓
- `git ls-files server/data` → `server/data/.gitkeep` 만 ✓
- 커밋 3개: 24470f9 · 1709e34 · 2e0f249 ✓

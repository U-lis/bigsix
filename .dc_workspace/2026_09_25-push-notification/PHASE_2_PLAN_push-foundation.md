# Phase 2: push-foundation

## 목표

클라이언트 푸시 데이터 레이어를 만든다: 타입, localStorage storage, 반응형 상태 래퍼, 순수 함수 `buildMeta`. 구조 테스트를 갱신해 `src/lib/ui/push/` 를 허용한다.

## 선행 조건

- Phase 1 완료.

## 구현 지침

### 1. `src/lib/ui/push/types.ts` 생성

아래 타입을 export 한다.

- `type PushState = 'loading' | 'unsupported' | 'denied' | 'off' | 'on'`
- `type PushErrorCode = 'denied' | 'unsupported' | 'no-service-worker' | 'origin-not-allowed' | 'push-service-not-allowed' | 'subscribe' | 'network' | 'server'`
- `interface PushMeta { v: 1; tz: string; notifyAt: string; program: string; days: Partial<Record<Weekday, string[]>> }` — `Weekday` 는 `$lib/domain/types` 에서 import
- `interface PushRecord { v: 1; notifyAt: string; sentMeta: string | null }`

### 2. `src/lib/ui/push/storage.ts` 생성

localStorage 키 상수: `const PUSH_KEY = 'bigsix.push'`

다음을 export 한다.

- `readPushRecord(): PushRecord` — `localStorage.getItem(PUSH_KEY)` 를 읽고 파싱한다. 예외 발생 또는 JSON 형식 불량이면 기본값 `{ v: 1, notifyAt: '19:00', sentMeta: null }` 을 반환한다. 이 함수는 throw 하지 않는다.
- `writePushRecord(r: PushRecord): void` — `JSON.stringify(r)` 를 localStorage 에 쓴다. throw 하지 않는다(try/catch).
- `deletePushRecord(): void` — 키를 삭제한다. throw 하지 않는다.

테스트 파일 첫 줄에 `// @vitest-environment happy-dom` 을 붙인다(localStorage 사용).

### 3. `src/lib/ui/push/push.svelte.ts` 생성

룬만 쓴다(`$state`, `$derived` — `export let`, 스토어 금지).

다음을 export 한다.

- `pushRecord` — 모듈 로드 시 `readPushRecord()` 로 초기화한 `$state` 객체.
- 레코드를 변경하는 setter 또는 update 함수 — 내부적으로 `writePushRecord` 를 거쳐 저장한다.

앱 세션 안에서 반응형 푸시 레코드의 단일 출처다.

### 4. `src/lib/ui/push/meta.ts` 생성

다음을 export 한다.

```ts
function buildMeta(
  state: AppState,
  catalog: Catalog,
  tz: string,
  notifyAt: string,
): PushMeta | null
```

구현 순서:

1. `currentStint(state)` (`$lib/domain`) 를 호출한다. null 이면 null 반환.
2. `currentStint` 에서 `programId` 를 가져온다.
3. `program` = `getProgram(catalog, programId).name.ko`.
4. `['월','화','수','목','금','토','일']` 의 각 `Weekday` 에 대해:
   - `planDay(state, catalog, programId, weekday)` 를 호출한다.
   - `.exercises` 가 비어 있으면 이 요일을 건너뛴다(`days` 에 키 없음).
   - 비어 있지 않으면 각 exercise 의 `progressionId` 를 `getProgression(catalog, id).name.ko` 로 변환해 배열로 만든다.
5. `{ v: 1, tz, notifyAt, program, days }` 를 반환한다.

`AppState` 와 `Catalog` 는 `$lib/domain/types`, 도메인 함수는 `$lib/domain` 으로 import 한다. `buildMeta` 내부에서 `loadCatalog()` 를 호출하지 않는다 — 호출자가 이미 로드한 catalog 를 넘긴다.

### 5. `tests/unit/structure.test.ts` 수정 (ADR-30)

- `LAYER_ROOTS` (31행): `'lib/ui/history'` 뒤에 `'lib/ui/push'` 를 추가한다.
- `assert.equal(LAYER_ROOTS.length, 9)` (123행): `9` → `10` 으로 변경한다.
- `UI_UNDER` (43행): Set 에 `'push'` 를 추가한다.

231행의 `UI_UNDER.has(d) || d === 'history'` 가드는 그대로 둔다 — `push` 가 `UI_UNDER` 에 들어가면 자동으로 커버된다.

## 완료 체크리스트

- [ ] `src/lib/ui/push/types.ts` — 네 타입 모두 export
- [ ] `src/lib/ui/push/storage.ts` — read/write/delete 가 throw 하지 않음
- [ ] `src/lib/ui/push/push.svelte.ts` — 반응형 레코드가 storage 와 연결됨
- [ ] `src/lib/ui/push/meta.ts` — `buildMeta` 가 부작용 없는 순수 함수
- [ ] `tests/unit/structure.test.ts` 수정 — `LAYER_ROOTS` 길이 10, `UI_UNDER` 에 `push`
- [ ] `pnpm check` 오류 0
- [ ] `pnpm test` 통과 (기준선 803 + 신규 테스트)

## 참고

- `src/lib/ui/push/` 는 `LAYER_ROOTS` 의 새 레이어다. 이 폴더의 파일은 도메인 함수를 `$lib/domain` 으로 import 한다 — 레이어를 넘는 상대 경로 금지.
- `src/lib/domain/**` 은 수정하지 않는다.
- `Weekday` 값은 한국어 문자열(`'월'`~`'일'`)이다 — 도메인의 정식 export 를 사용한다.

## 페이즈 종료 전 IR 로그 갱신

이 페이즈에서 쓰는 `integration.md` 절: **§2 meta** (meta JSON 형식, 1024 바이트 상한, enable 에 넘기는 구조). meta 형식을 구현하면서 발견한 `integration.md` 이슈를 SPEC IR 로그에 기록한다.

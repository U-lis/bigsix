# Phase 5: push-autosync

## 목표

앱 부팅 시 meta 자동 동기화를 구현한다. 프로그램 변경·타임존 변경 등이 설정 화면을 다시 방문하지 않아도 릴레이 구독에 반영되도록 한다.

## 선행 조건

- Phase 4 완료.

## 구현 지침

### 1. `src/lib/ui/push/autoSync.ts` 생성

다음을 export 한다.

```ts
async function pushAutoSync(): Promise<void>
```

알고리즘:

1. `readPushRecord()` 로 `pushRecord` 를 읽는다. `pushRecord.sentMeta === null` 이면 즉시 반환 — 한 번도 푸시를 켠 적 없으므로 릴레이 클라이언트를 로드하지 않는다.
2. `await loadRelay()` (`./relay`).
3. `await PushRelay.state()` 를 호출한다. 결과가 `'on'` 이 아니면 반환한다.
4. `meta` 를 빌드한다.
   - `appState` — `$lib/ui/state/state.svelte`
   - `catalog` — `await loadCatalog()` (또는 모듈 수준 캐시가 있으면 그것을 사용)
   - `tz` — `Intl.DateTimeFormat().resolvedOptions().timeZone`
   - `notifyAt` — `pushRecord.notifyAt`
5. `meta === null` 이면 반환한다.
6. `const newMeta = JSON.stringify(meta)`.
7. `newMeta === pushRecord.sentMeta` 이면 반환한다(변경 없음).
8. `await PushRelay.enable(meta)` 를 호출한다.
9. 성공 시: `pushRecord.sentMeta = newMeta` 로 갱신하고 `writePushRecord(pushRecord)` 를 호출한다.
10. 2~9단계 전체를 `try/catch` 로 감싸 모든 예외를 조용히 넘긴다(FR-33.6: 동기화 실패는 무음 처리).

### 2. `src/routes/+layout.svelte` 수정

`onMount` 의 `await boot()` 호출 뒤에 다음을 추가한다.

```ts
queueMicrotask(() => pushAutoSync());
```

`$lib/ui/push/autoSync` 에서 `pushAutoSync` 를 import 한다.

`queueMicrotask` 는 현재 마이크로태스크 큐가 비워진 뒤로 동기화를 미룬다 — boot 가 완료되고 UI 가 그려진 뒤에 릴레이 스크립트 로드가 시작된다(ADR-35).

## 완료 체크리스트

- [ ] `src/lib/ui/push/autoSync.ts` 생성 — `pushAutoSync` 함수 구현
- [ ] `+layout.svelte` 에서 `boot()` 뒤 `queueMicrotask(() => pushAutoSync())` 호출
- [ ] `pnpm check` 오류 0
- [ ] `pnpm test` 통과
- [ ] IR-3 를 실기기 테스트 결과(제스처 밖 `enable` 호출)로 갱신

## 참고

- `sentMeta === null` 가드가 한 번도 켠 적 없는 사용자에게 `client.js` 를 로드하지 않도록 막는다.
- `enable` 예외는 의도적으로 삼킨다 — 다음 부팅 때 재시도한다.
- 근거는 GLOBAL ADR-35.

## 페이즈 종료 전 IR 로그 갱신

이 페이즈에서 쓰는 `integration.md` 절: **§2 화면** (meta 갱신용 `enable` 재호출, 「같은 구독 ID 가 유지된다」). 제스처 밖 `enable` 실기기 확인 결과를 SPEC IR 로그(IR-3)에 기록한다.

# Phase 3: sw-importscripts

## 목표

`PUBLIC_PUSH_RELAY_URL` 을 빌드에 연결하고 서비스워커에 `importScripts` 호출을 추가한다. 개발 서버 포트를 5173 으로 고정한다.

## 선행 조건

- Phase 2 완료.

## 구현 지침

### 1. `.env.development` 생성

```
PUBLIC_PUSH_RELAY_URL=https://push-dev.siot-ieung.duckdns.org
```

### 2. `.env.production` 생성

```
PUBLIC_PUSH_RELAY_URL=https://push.siot-ieung.duckdns.org
```

두 파일은 비밀이 아니므로 저장소에 커밋한다.

### 3. `src/pwa-sw.ts` 수정

파일 맨 위, 다른 구문보다 먼저 다음을 추가한다.

```ts
import { PUBLIC_PUSH_RELAY_URL } from '$env/static/public';
try { importScripts(PUBLIC_PUSH_RELAY_URL + '/sw.js') } catch {}
```

`import` 는 빌드 시 인라인된다. `try/catch` 는 릴레이 불능 시에도 앱 SW 설치가 실패하지 않도록 보호한다. `push` · `notificationclick` 핸들러를 이 파일에 추가하지 않는다.

### 4. `vite.config.ts` 수정

`defineConfig` 객체에 추가한다.

```ts
server: {
  port: 5173,
  strictPort: true,
},
```

`pnpm dev` 가 항상 5173 포트에 바인딩되어 dev 릴레이에 등록한 Origin 과 일치하게 한다(EC-86 예방).

### 5. 빌드 산출물 확인

`pnpm build` 실행 후 `build/sw.js` 를 검사한다.

- `importScripts(` 호출이 정확히 한 번 있다.
- `try {` ... `} catch {}` 로 감싸져 있다.
- 호출 안에 운영 URL `https://push.siot-ieung.duckdns.org/sw.js` 가 인라인되어 있다.

## 완료 체크리스트

- [x] `.env.development` 생성·커밋
- [x] `.env.production` 생성·커밋
- [x] `src/pwa-sw.ts` 에 try/catch 감싼 `importScripts` 추가
- [x] `vite.config.ts` 에 `server: { port: 5173, strictPort: true }` 추가
- [x] 빌드 산출물 테스트 통과 (PHASE_3_TEST.md 참조)
- [x] `pnpm check` 오류 0
- [x] `pnpm test` 통과
- [ ] IR-4 를 수동 테스트 결과로 갱신 (OQ-21)

## 참고

- 수동 확인 절차는 SPEC OQ-21, 결과는 IR-4 에 기록.
- 두 `.env.*` 파일에는 `PUBLIC_PUSH_RELAY_URL` 하나만 들어간다. 비밀을 넣지 않는다.

## 페이즈 종료 전 IR 로그 갱신

이 페이즈에서 쓰는 `integration.md` 절: **§3 서비스워커** (`importScripts` 한 줄, 프리캐시 제외 주의사항). `importScripts` 실패 처리 관련 발견 사항을 SPEC IR 로그(IR-4)에 기록한다.

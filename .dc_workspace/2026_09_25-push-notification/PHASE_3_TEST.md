# Phase 3: 테스트 케이스

## 테스트 커버리지 목표

70% 는 참고 수치다 — 통과 기준이 아니다.

## 검증할 동작

### 빌드 산출물 테스트 (`tests/unit/push/sw-importscripts.test.ts`)

`tests/unit/precache-parity.test.ts` 와 같은 패턴을 따른다: `spawnSync` 로 `pnpm exec vite build --outDir <임시디렉터리>` 를 실행한 뒤 `<임시디렉터리>/sw.js` 를 문자열로 읽는다.

- [x] **동작**: 빌드된 `sw.js` 에 `importScripts(` 가 정확히 한 번 나온다 | **계층**: 빌드 산출물
- [x] **동작**: 그 `importScripts` 호출이 `try {` ... `} catch {}` 로 감싸져 있다 | **계층**: 빌드 산출물
- [x] **동작**: 인라인된 URL 이 운영 릴레이 URL `https://push.siot-ieung.duckdns.org/sw.js` 이다 | **계층**: 빌드 산출물

### 수동 (OQ-21) — 결과는 IR-4 에 기록

`pnpm preview` 실행 후 `https://push.siot-ieung.duckdns.org/sw.js` 를 차단(hosts 파일 또는 브라우저 DevTools 요청 차단)한 상태에서 Chrome · Firefox · Safari 에서 앱을 열어 SW 설치 정상 여부와 오프라인 동작을 확인한다.

## 이 페이즈에 실제로 해당하는 엣지 케이스

- EC-87: SW 설치 시 릴레이 `sw.js` 가 불능이면 앱 SW 가 정상 설치되어야 한다 — 수동 테스트로 확인.

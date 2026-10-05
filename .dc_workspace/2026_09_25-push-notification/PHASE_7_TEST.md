# Phase 7: 테스트 케이스

## 테스트 커버리지 목표

70% 는 참고 수치다 — 통과 기준이 아니다.

## 검증할 동작

### NFR-32: 커밋된 파일에 키 없음 (단위, `tests/unit/security/no-key.test.ts`)

- [x] **동작**: git 이 추적하는 파일 중 `PUSH_RELAY_KEY=prk_` 패턴을 포함하는 파일이 없다 | **계층**: 단위 (`git ls-files` 출력 읽기, 각 파일 grep) — `tests/unit/security/no-key.test.ts` PASS

### 수동 end-to-end (dev 환경)

자동화하지 않는다. 페이즈 완료 노트에 결과를 기록한다.

- **동작**: dev 환경에서 앱에서 푸시 알림을 켜고 `notifyAt` 을 1~2분 뒤로 설정한 다음 `node --experimental-strip-types cron/push.ts` 를 수동으로 실행해 기기에 알림이 도착하는지 확인한다 | **계층**: 시나리오
- **동작**: 알림을 탭하면 브라우저/PWA 에서 `/` 가 열린다 | **계층**: 시나리오
- **동작**: 같은 분 안에 cron 을 다시 실행하면 로그에 `suppressed` 가 기록된다(같은 `dedupKey`) | **계층**: 시나리오
- **동작**: `push-install.sh` 실행 후 `bigsix-push@prod.timer` 가 활성 상태다 | **계층**: 시나리오

### 배포 중 발견된 결함 및 안전망 (2026-10-03 실배포)

- [x] **동작**: `pnpm run build --mode development` 가 실제로 dev relay URL(`https://push-dev.siot-ieung.duckdns.org`)을 `build/sw.js` 에 포함한다 | **계층**: 로컬 빌드 검증 — PASS (pnpm 10 의 `--` 전달 결함 수정 후 확인)
- [x] **동작**: `pnpm run build`(prod) 가 prod relay URL(`https://push.siot-ieung.duckdns.org`)을 `build/sw.js` 에 포함한다 | **계층**: 로컬 빌드 검증 — PASS
- [x] **동작**: sw.js 안전망 — `DEPLOY_MODE=prod` 인데 build/sw.js 에 prod URL 이 없으면 rsync 전에 `exit 1` | **계층**: 수동 시뮬레이션 — PASS (dev 빌드 산출물로 prod 기대값 대조 시 올바르게 실패 확인)

## 실기기 확인에서 발견된 결함 (2026-10-03 Android PWA)

Phase 7 배포 기기 점검에서 발견된 결함 세 가지. 모두 우리 측 버그이며 integration.md 결함이 아니다(§2 에 `await PushRelay.state()` 가 이미 명시돼 있음).

1. **`PushRelay.state()` async/sync 미스매치** — 실제 `client.js` 의 세 메서드(`state`, `enable`, `disable`)는 `async function` 이다. 과거 `relay.ts` 는 `state()` 를 동기로 타입해, `await` 없이 반환값을 비교하면 Promise 가 `!== 'on'` 이라 항상 거짓이었다. 영향: `/settings` 「알림 켜기」 버튼이 항상 비활성, `pushAutoSync` 가 항상 early return, `teardownPush` 가 구독을 끊지 않음. 수정: `PushRelayGlobal` 인터페이스의 세 메서드를 모두 `Promise` 반환으로 타입하고, 호출 측 세 곳(`relay.ts teardownPush`, `autoSync.ts`, `+page.svelte refreshState`)에 `await` 를 추가.
2. **`/settings` 가로 스크롤** — `.hidden { visibility: hidden; position: absolute; }` 과 `.btn { width: 100% }` 가 겹쳐, `position: absolute` 요소의 `width: 100%` 가 initial containing block 기준으로 풀려 가로 overflow 가 발생. 하단 네비가 잘려 보였다. 수정: `.hidden { display: none; }` 으로 교체. DOM 은 그대로 유지되어 하이드레이션·포커스에 영향 없음.
3. **`sw-importscripts.test.ts` dev 빌드 캐시 취약** — dev 모드 빌드 후 test 를 돌리면 `build/sw.js` 에 prod URL 이 없어 테스트가 실패했다. 수정: 기존 `build/sw.js` 가 prod URL 을 포함하지 않으면(dev 빌드 감지) 새로 운영 모드 빌드를 트리거하도록 수정.

## 이 페이즈에 실제로 해당하는 엣지 케이스

- EC-82: 앱 데이터 삭제 후 다시 켜면 새 구독이 생긴다. 이전 구독은 다음 cron 실행 때 `gone` 이 된다.

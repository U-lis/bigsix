# Phase 7: 테스트 케이스

## 테스트 커버리지 목표

70% 는 참고 수치다 — 통과 기준이 아니다.

## 검증할 동작

### NFR-32: 커밋된 파일에 키 없음 (단위, `tests/unit/security/no-key.test.ts`)

- **동작**: git 이 추적하는 파일 중 `PUSH_RELAY_KEY=prk_` 패턴을 포함하는 파일이 없다 | **계층**: 단위 (`git ls-files` 출력 읽기, 각 파일 grep)

### 수동 end-to-end (dev 환경)

자동화하지 않는다. 페이즈 완료 노트에 결과를 기록한다.

- **동작**: dev 환경에서 앱에서 푸시 알림을 켜고 `notifyAt` 을 1~2분 뒤로 설정한 다음 `node --experimental-strip-types cron/push.ts` 를 수동으로 실행해 기기에 알림이 도착하는지 확인한다 | **계층**: 시나리오
- **동작**: 알림을 탭하면 브라우저/PWA 에서 `/` 가 열린다 | **계층**: 시나리오
- **동작**: 같은 분 안에 cron 을 다시 실행하면 로그에 `suppressed` 가 기록된다(같은 `dedupKey`) | **계층**: 시나리오
- **동작**: `push-install.sh` 실행 후 `bigsix-push@prod.timer` 가 활성 상태다 | **계층**: 시나리오

## 이 페이즈에 실제로 해당하는 엣지 케이스

- EC-82: 앱 데이터 삭제 후 다시 켜면 새 구독이 생긴다. 이전 구독은 다음 cron 실행 때 `gone` 이 된다.

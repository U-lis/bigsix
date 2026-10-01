# Phase 7 — 문서 갱신

**목표**
릴리스 준비. README · CHANGELOG 0.3.0 · `CLAUDE.md` 훅 목록 · `docs/` 목록에 새 문서 지도 · 알려진 한계.

## SPEC 참조

- SPEC Constraints: 이 저장소의 첫 서버 런타임 · `deploy/README.md:3` 문구 변경 (Phase 4 에서 완료). Phase 7 은 최종 확인.
- H-13: 홈서버 의존을 README · CHANGELOG 에 「알려진 한계」로 명시.
- UI-15: `data-push-*` 훅을 CLAUDE.md 훅 목록에 더한다.
- 승계 규약: `.dc_workspace/2026_09_18-history-export/PHASE_8_PLAN.md` (SPEC3 마지막 문서 페이즈) 답습.

## 변경 파일

| 파일 | 편집 종류 | 내용 |
|---|---|---|
| `CHANGELOG.md` | 편집 | 0.3.0 항목 신설. Added · Changed · Fixed · Known limitations |
| `README.md` | 편집 | 「알림」 절 신설. 요구 사항 · 「홈서버가 꺼져 있으면 오지 않는다」 명시 (H-13) |
| `CLAUDE.md` | 편집 | 「문서 지도」 표에 SPEC4 두 줄 · 훅 목록에 `data-push-*` 6개 |
| `docs/` | 편집 (선택) | 문서 지도가 옮겨져 있으면 정리. 이번엔 스킵 가능 |
| `.dc_workspace/2026_09_25-push-notification/GLOBAL.md` | 편집 (마지막) | Phase 목록 Status 를 Complete 로. 최종 검증 메모 |

## 커밋 경계 (3개)

### (a) `docs(claude): SPEC4 규약 · data-push-* 훅을 CLAUDE.md 에`

- 「문서 지도」 표에 두 줄 추가:
  ```
  | `.dc_workspace/2026_09_25-push-notification/SPEC.md` | **이번 개정 (SPEC4)** 요구·수용 기준 |
  | `.dc_workspace/2026_09_25-push-notification/GLOBAL.md` | **이번 개정 (SPEC4)** ADR·데이터 모델·페이즈 |
  ```
- SPEC3 두 줄은 「이전 개정」 으로 격하.
- 훅 목록에 새 절 「알림 설정 (Phase 5·6)」 추가:
  ```
  `data-push-permission`(값: `'default'|'granted'|'denied'`),
  `data-push-status`(값: `'on'|'off'|'blocked'|'unsupported'|'ios-not-installed'|'no-program'`),
  `data-push-notify-at`(값: `HH:MM`),
  `data-push-enable`, `data-push-disable`(버튼),
  `data-push-error`(값: `'permission-denied'|'subscribe-failed'|'server-unreachable'`)
  ```
- 「규약을 어긴 실제 사례」 절에 이번 건 추가:
  ```
  - injectManifest 전환 시 workbox 옵션 3개 중 2개(ignoreURLParametersMatching · navigateFallback)
    가 build-time 옵션이 아니라 SW 코드로 이관해야 하는 사실을 SPEC 이 놓쳤다 —
    2026-09-25 설계에서 발견해 GLOBAL ADR-35 로 재해석. 재발 방지는 프리캐시 전수 대조
    (`deploy/deploy.sh` 원격) + 로컬 대체 대조 (`tests/unit/precache-parity.test.ts`).
  ```

### (b) `docs(readme): 알림 절 신설 · 알려진 한계` (개정 B 반영)

- README 에 「알림」 절 삽입 (「데이터 출처」 앞):
  ```
  ## 알림

  운동일마다 지정한 시각에 푸시 알림을 받을 수 있다. About 모달 「알림」 섹션에서
  켠다. 시각은 분 단위로 지정하고, 기기 타임존 기준으로 발송된다.

  **구조 (0.3.0)**
  같은 홈서버 위에 두 프로세스가 돈다.
  - **푸시 릴레이 (`push-relay-api.service`)** — 「받아서 서명해 보낸다」. 스케줄을 모른다.
    앱이 「지금 이 기기에 이 문자열을 보내라」 고 부르면 VAPID 서명해 발송할 뿐.
    이 릴레이는 bigsix 전용이 아니라 같은 홈서버의 여러 앱이 공유한다.
  - **bigsix 스케줄러 (`bigsix-cron.service` + `.timer`)** — 매 분 돌면서 알림 시각을 판정하고
    그날의 종목명을 만들어 릴레이에 발송을 부탁한다. 「언제 · 무엇을」이 여기 있다.

  **요구 사항**
  - Chrome/Firefox: 브라우저 그대로 동작. PWA 설치 여부 무관.
  - iOS 16.4+: 홈 화면에 추가한 PWA 여야 한다. Safari 탭에서는 안 뜬다.
  - 알림 권한은 「알림 켜기」 를 누른 순간에만 요청한다 — 앱 진입 즉시 묻지 않는다.

  **알려진 한계**
  - 홈서버가 꺼져 있거나 접근 불가면 알림이 오지 않는다 (릴레이·스케줄러 둘 다 그 위에 있다).
  - 이미 오늘 운동을 마쳤어도 알림은 그대로 온다 (서버는 수행 여부를 모른다).
  - 릴레이 저장 데이터: `app`, `endpoint`, `keys`, `meta`(앱이 정하는 불투명 JSON — bigsix 는
    `{tz, notifyAt, programId}` 를 넣는다). 프로그램 ID 는 라벨로만 저장되고 릴레이는 이 값을
    해석하지 않는다. 운동 기록·단계·수행 여부·목표·RPE 는 기기에 남는다 — 서버로 나가지 않는다.
  - VAPID 키를 회전하면 이 릴레이를 쓰는 **모든 앱의 구독이 한꺼번에 무효화**되고 각 앱의
    사용자가 「알림 켜기」 를 다시 눌러야 한다 (H-16, EC-90).
  - 이 릴레이는 단일 운영자 전제로 세워졌다 (H-18). `app` 필드는 자기 신고 값이며 화이트리스트가
    없다. 남의 앱을 이 릴레이에 받으려면 별도 인증(앱별 토큰) 이 필요해진다.
  ```
- 「최근 릴리스」 항목이 있으면 0.3.0 정보 갱신.

### (c) `docs(changelog): 0.3.0 항목` (개정 B 반영)

- `CHANGELOG.md` 상단에 0.3.0 절 추가:
  ```
  ## [0.3.0] - 2026-XX-XX

  ### Added
  - 운동일 푸시 알림 (SPEC4). About 모달 「알림」 섹션에서 시각을 지정하면 운동일 그날의
    종목명이 담긴 알림이 온다. VAPID · web-push.
  - 홈서버 위 **푸시 릴레이** (`push-relay-api.service`) — 「받아서 서명해 보낸다」. 스케줄을
    모르는 얇은 릴레이. 같은 홈서버의 여러 앱이 공유할 수 있는 범용 형태.
  - 홈서버 위 **bigsix 스케줄러** (`bigsix-cron.service` + `.timer`) — 매 분 돌며 시각·요일을
    판정하고 릴레이에 발송을 부탁한다. 「언제 · 무엇을」 은 이쪽에 있다.
  - 릴레이 API: 공개 `POST/DELETE /api/push/subscribe`, loopback 전용 `GET /subscriptions?app=<id>` ·
    `POST /send` (앱이 정하는 불투명 `payload`, dedupKey 로 중복 억제). 공개 경로의 두 내부 엔드포인트는 404.
  - 릴레이 전용 배포 `deploy/relay-deploy.sh` — 릴레이는 별도 체크아웃(`~/apps/push-relay`) · 데이터
    `/var/lib/push-relay` 에서 돌고, bigsix 배포가 릴레이를 재시작하지 않는다.
  - injectManifest 로 전환한 커스텀 서비스워커 (`src/pwa-sw.ts`) — push · notificationclick 핸들러.
  - VAPID 부트스트랩 스크립트 (`server/relay/scripts/vapid-init.mjs`).
  - 서버 tests 하네스 (`tests/server/relay/` · `tests/server/bigsix-cron/` · `tests/server/lib/tz/`).

  ### Changed
  - `SvelteKitPWA` 를 `generateSW` → `injectManifest`. `sw.js` 출력 파일명 유지.
  - `deploy/README.md` 「정적 파일뿐이라 서버 런타임은 없다」 문구 제거. 릴레이·스케줄러 두 유닛 안내.
  - `deploy/nginx/bigsix.conf` 에 `location = /api/push/subscribe` 프록시 · 나머지 `/api/push/` 404 · `client_max_body_size 16k`.
  - `deploy/remote.sh` 에 `relay` 모드. full 모드는 bigsix cron 만 install · 재시작. `deploy/deploy.sh` 에 API 응답 · 공개 경로 404 검증.

  ### Known limitations
  - 홈서버가 꺼져 있으면 알림이 오지 않는다 (H-13).
  - VAPID 키 회전 시 이 릴레이를 쓰는 모든 앱의 구독이 무효화된다. 사용자가 About 에서
    「알림 켜기」 를 다시 눌러야 한다 (H-16, EC-90).
  - 릴레이는 단일 운영자 전제 (H-18) 로 세워졌다. `app` 필드는 자기 신고 값이며 화이트리스트가
    없다.
  ```

## 완료 기준

- 커밋 a~c 전부에서 `pnpm check` 0/0, `pnpm test` ≥ 813 통과 (변화 없어야 함 — 코드 미변경).
- `grep -n "data-push-permission" CLAUDE.md` — 1건 이상.
- `grep -n "알림" README.md` — 1건 이상.
- `grep -n "^## \\[0.3.0\\]" CHANGELOG.md` — 1건.
- `.dc_workspace/2026_09_25-push-notification/GLOBAL.md` Phase 목록 Status 를 전부 Complete 로 갱신 (마지막 정리, 별도 커밋 필요 없음 — Phase 7 (c) 에 포함).

## 위험

- **RISK-9** (릴리스 태그 지시): Phase 7 완료 후 사용자 지시가 있으면 `./deploy/release.sh 0.3.0`. `CHANGELOG.md` 에 0.3.0 절이 없으면 스크립트가 멈추므로 이 페이즈에서 반드시 포함.
- 문서 규약 위반 방지: 라벨·색·아이콘 규약(cube-study CONVENTIONS) 은 이번 페이즈에서 변경 없음. 훅 목록 문법이 SPEC3 마지막 형식과 어긋나지 않도록 그대로 답습.

## 임시 배포

이 페이즈에 포함하지 않는다. 사용자 지시로 릴리스 (`release.sh`) 실행 시 문서·코드가 함께 배포된다.

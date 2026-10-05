# bigsix 푸시 알림 (SPEC4) — 완료 보고

**브랜치**: `feature/push-notification`  
**코드 HEAD**: `c385bd5`  
**완료 일자**: 2026-10-05  
**대상 버전**: 0.3.0

---

## 요약

운동일 사용자가 설정한 시각에 push-relay 를 통해 Web Push 알림을 보내는 기능을 구현했다.
정적 SvelteKit PWA 에 홈서버 cron 을 더해 서버리스 앱 제약 안에서 예약 알림을 실현했다.

Samsung Android Chrome PWA(2026-10-03 · 2026-10-05) 실기기 확인 완료.
iOS 및 Firefox 는 미확인(OQ-21).

---

## 페이즈별 커밋

| 커밋 | 내용 | 페이즈 |
|------|------|--------|
| `07ebe99` | SW injectManifest 전환 · 프리캐시 등가성 테스트 | 1 |
| `5225746` | 프리캐시 대조가 빈 목록을 통과로 내던 문제 | 1 |
| `bb5184f` | 알림 설정 화면 · 릴레이 연결 · 자동 동기화 (실기기 결함 1·2 수정 포함) | 2 · 3 · 4 · 5 |
| `287e8fd` | 홈서버 발송 cron | 6 |
| `c385bd5` | 푸시 cron 배포 · DEPLOY_MODE (실기기 결함 3·4 수정 포함) | 7 |
| 문서 커밋 | SPEC4 설계 · 이 보고 · README · CHANGELOG · CLAUDE.md | 8 |

커밋은 의미 단위 최종 변경만 남도록 재구성했다 (2026-10-05). 페이즈별 개발 이력은
각 PHASE_*_PLAN/TEST 에 남아 있다.

---

## 실기기 테스트에서 발견된 결함

모두 bigsix 측 버그이며, 수정은 해당 기능 커밋(`bb5184f` · `c385bd5`)에 포함됐다.

### 1. PushRelay.state() async/sync 미스매치 (수정: `bb5184f`)

실제 `client.js` 의 `state` · `enable` · `disable` 는 모두 `async function` 이다.
`relay.ts` 의 `PushRelayGlobal` 인터페이스가 동기 반환 타입으로 선언되어, `await` 없이
비교하면 Promise 객체가 항상 `!== 'on'` 이 참이었다.

**영향**: `/settings` 「알림 켜기」 버튼 항상 비활성 · `pushAutoSync` 항상 early return ·
`teardownPush` 가 구독을 끊지 않음.

**수정**: `PushRelayGlobal` 인터페이스의 세 메서드를 `Promise<…>` 반환으로 수정, 호출 측
세 곳(`relay.ts`, `autoSync.ts`, `+page.svelte`)에 `await` 추가.

**재발 방지 교훈**: 외부 비동기 API 를 타이핑할 때 실제 반환 타입을 확인한다. 동기 편의 래퍼가
없다면 단위 mock 도 async 로 맞춘다 — 동기 mock 이 이 불일치를 숨겼다.

### 2. /settings 가로 스크롤 (수정: `bb5184f`)

`.hidden { visibility: hidden; position: absolute; }` 과 `.btn { width: 100% }` 의 조합에서
`position: absolute` 요소의 `width: 100%` 가 initial containing block 기준으로 풀려 가로 overflow.

**수정**: `.hidden { display: none; }` 으로 교체 — DOM 은 그대로 유지, 하이드레이션·포커스 영향 없음.

### 3. pnpm `--` 모드 플래그 전달 오류 (수정: `c385bd5`)

pnpm 10 에서 `pnpm run build -- --mode development` 의 `--` 를 npm 스크립트 인자로 문자 그대로
넘겨, Vite 가 `vite build -- --mode development` 로 돌면서 `--mode` 를 무시한다.
`--` 를 제거한 `pnpm run build --mode development` 로 수정해 Vite 가 플래그를 직접 받도록 했다.

**영향**: dev 모드 배포 시 항상 prod 빌드가 나가 dev 릴레이 URL 이 박히지 않았다.

### 4. systemd %h 플레이스홀더 오작동 (수정: `c385bd5`, 설계 반영)

system 유닛에서 `%h` 는 `User=` 설정과 무관하게 `/root` 로 풀린다(man systemd.unit).
`EnvironmentFile=%h/…` 는 키 파일을 찾지 못한다.

**수정**: `push-install.sh` 가 `getent passwd` 로 사용자 홈 절대 경로를 구해 유닛 파일에 박는다.

---

## 남은 항목

### OQ-21 — 멀티브라우저 importScripts 확인
- **Android Chrome PWA**: 정상 동작 확인 (2026-10-05)
- **iOS**: 미테스트. iOS 16.4+ 홈 화면 PWA 에서 Web Push 를 지원하는지 확인 필요
- **Firefox**: 미테스트

### iOS 실기기 확인
- 홈 화면 추가 후 Web Push 구독 · 수신 전 과정 미확인

### prod 등록 (P-1)
- push-relay prod 환경에 bigsix Origin 등록 미완료
- `sudo ~/apps/bigsix/deploy/push-install.sh prod` 미실행
- prod 키 파일 없음 → prod 알림 발송 불가

### Urgency 헤더 (IR-12, 사용자 결정: 후속 작업)
- 릴레이가 Web Push `Urgency` 헤더를 설정하지 않아 Android Doze 환경에서 최대 수십 분 지연 발생
- 실측: 19:00:40 KST 전송 → 19:16경 기기 도달 (~15분 지연)
- push-relay 에서 API 에 `urgency` 필드 추가 필요

### 100dvh 세로 스크롤 (기존 main 의 선행 문제)
- Android standalone PWA 에서 `/settings` 및 기타 화면이 약 42 CSS px 세로 스크롤됨
- 헤드리스 Chrome 416×830 에서는 재현 안 됨(scrollHeight = innerHeight)
- 추정 원인: `.shell { min-height: 100dvh }` 가 Android standalone 가시 영역을 초과
- 이 기능 브랜치의 버그가 아님 — main 의 `f6e6c11` 이전부터 존재하는 문제로 추정

---

## push-relay 연동 문서 이슈 (IR-1 ~ IR-12)

기준: push-relay `docs/integration.md` main `ebfd9e2` (0.1.2).

| # | 위치 | 문제 | 영향 · 우회 | 수정 제안 |
|---|------|------|-------------|-----------|
| IR-1 | 문서 위치 | 연동 기준 문서가 `feature/gateway` 에만 있고 main 에 없었다 | **해소** — 0.1.0 · 0.1.1 이 main 에 병합됨 | — |
| IR-2 | §환경 「한 Origin 은 한 앱에만」 | 환경(prod·dev) 독립 여부와 Origin 다중 등록 가능 여부가 불명확 | **우회** — dev 환경에 prod Origin 등록, 실기기 확인 성공. prod 독립 등록은 P-1 완료 시 재확인 | 환경 독립 여부 및 한 앱의 Origin 다중 등록 가능 여부를 명시 |
| IR-3 | §2 「`enable` 은 제스처 안에서」 | `granted` 상태에서 제스처 밖 `enable` 가능 여부 불명확 | **해소(실기기)** — `client.js` 는 `Notification.permission === 'default'` 일 때만 `requestPermission`. Android 실기기 자동 동기화 정상 동작 확인 | 「권한이 이미 `granted` 이면 제스처 밖 `enable` 가능」 명시 |
| IR-4 | §3 `importScripts` | 릴레이 불능 시 앱 SW 설치 실패 여부, try/catch 필요 여부 미언급 | **구현** — `try { importScripts(...) } catch {}` 적용, Android 정상 확인. Firefox·iOS 미확인(OQ-21) | 실패 시 동작과 try/catch 권장 여부 명시 |
| IR-5 | §6 `dedupKey` | dedup 범위(구독별 vs 전체)와 보존 기간 미기재 | **해소** — dedup PK: `(subscription_id, dedup_key)` (구독별), 8일 보존(소스코드 확인) | §6 에 dedup 범위(구독별)와 보존 기간(8일) 명시 |
| IR-6 | §5 아이콘 URL 해석 주체 | 상대 경로를 누가 어느 출처 기준으로 해석하는지 불명확 | **우회(실기기 해소)** — cron 에서 절대 URL 로 전송, Android 아이콘 표시 확인 | 해석 주체 명시, 절대 URL 권장 여부 기술 |
| IR-7 | §1 키 파일 경로 | `EnvironmentFile=` 에 `~` 를 쓰면 systemd 가 풀지 못함. 릴레이와 같은 사용자여야 키 파일(600)을 읽을 수 있다는 조건 미기재 | **우회** — `push-install.sh` 가 `getent passwd` 로 절대 경로 치환, `User=ulismoon` 명시 | `EnvironmentFile` 예시에 절대 경로와 `getent` 사용 안내, 사용자 일치 조건 한 줄 추가 |
| IR-8 | §1 systemd 인스턴스 지시자 | `%i` + 절대 경로를 쓴 `EnvironmentFile=` 예시 없음. `%h` 가 `User=` 와 무관하게 `/root` 로 풀리는 함정 미경고 | **우회** — `EnvironmentFile=/home/ulismoon/apps/push-relay/%i/data/keys/bigsix.env` (설치 시 치환) | §1 에 `%i` + 절대 경로 예시 1줄, `%h` 주의 한 줄 추가 |
| IR-9 | §환경 「포트 고정」 | Vite `strictPort: true` 옵션 미언급. 미설정 시 다른 앱이 5173 을 점유하면 자동 전환되어 `origin-not-allowed` | **우회** — `vite.config.ts` 에 `server: { port: 5173, strictPort: true }` 추가 | §환경에 「Vite 사용자는 `strictPort: true` 권장」 한 줄 |
| IR-10 | §6 배치 임계값 | body 1 MiB 에 근접할 때 배치 분할 방법 미기재 | 현 구현은 단일 요청. 구독자 규모가 커지면 분할 필요 | §6 에 body 임계값(예: 900 KiB) 초과 시 배치 분할 권장 절차 추가 |
| IR-11 | §6·§7 `requestId` 형식 충돌 | §6 예시가 「분+순번」이고 §7 은 `crypto.randomUUID()` 권장. Stateless oneshot 은 순번을 유지할 수 없어 어느 쪽도 그대로 따를 수 없다 | **우회** — `bigsix-<UTC YYYY-MM-DDTHH:MM>-<4자리 hex>` 형식으로 조정(ADR-38) | §6·§7 에 「stateless oneshot 에서는 `<앱>-<분>-<random>` 패턴 권장」 한 줄 |
| IR-12 | §6 `Urgency` 필드 없음 | 발송 API 에 Web Push `Urgency` 에 해당하는 필드가 없다. 릴레이도 헤더를 설정하지 않아 Android Doze 지연 배달 가능 | **영향(실측)** — 19:00:40 KST 전송, 기기 도달 19:16경(~15분 지연). 사용자 결정: 현재 보류, 후속 작업 | API 에 `urgency` 필드 추가, 릴레이가 Web Push `Urgency` 헤더를 설정하도록 구현. 사용자 노출 알림은 `urgency: "high"` 기본값 권장 |

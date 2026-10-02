# bigsix 운동일 푸시 알림 — Specification (SPEC4)

**Target Version**: 0.3.0
**Work Type**: feature
**Source Issue**: https://github.com/U-lis/bigsix/issues/6
**Base Branch**: `main` (`ec51aee`)
**Working Branch**: `feature/push-notification`
**Worktree**: `/home/ulismoon/Documents/bigsix-feature-push-notification`
**연동 기준 문서**: push-relay `docs/integration.md` (`family-game-guild/push-relay` main `ebfd9e2`, 0.1.2)

**선행 SPEC** — 대체하지 않고 잇는다. D-1~D-19, E-1~E-15, FR-23~30, NFR, 알려진 한계는 전부 유효하다.
- `.dc_workspace/2026_09_04-ui/SPEC.md`
- `.dc_workspace/2026_09_05-ui-2/SPEC.md`
- `.dc_workspace/2026_09_18-history-export/SPEC.md`

---

## Overview

**Purpose**
오늘이 운동일인지 알려면 앱을 열어봐야 한다. 열어볼 계기가 없어서 까먹는다.
사용자가 설정에서 시각 하나를 정해두면, 운동일 그 시각에 푸시 알림이 온다.

**Problem**
앱이 닫힌 상태에서 정해진 시각에 코드를 실행할 방법이 웹에 없다. 앱을 깨워줄 외부 주체가
필요하고, 실질적으로 Web Push 뿐이다. bigsix 는 서버가 없는 정적 앱이다.

**Solution**
홈서버의 공용 푸시 게이트웨이 **push-relay** 에 붙는다. bigsix 가 하는 일은 셋이다.

| 어디 | 무엇 |
|---|---|
| 화면 | `/settings` 에서 알림 켜기·끄기와 시각. 릴레이의 `client.js` 로 `PushRelay.enable(meta)` · `disable()` · `state()` |
| 서비스워커 | `src/pwa-sw.ts` 최상위에 릴레이 `sw.js` 를 `importScripts` 한 줄 |
| 홈서버 cron | 1분마다 릴레이 cron API 로 구독 목록을 받아, 지금 보낼 구독만 골라 한 번에 발송 |

구독 보관 · VAPID 서명 · dedup · 만료 구독 정리 · 알림 표시 · 알림 탭 처리는 릴레이 몫이다.
bigsix 는 「언제 · 무엇을」 만 정한다.

---

## 확정 사항 (사용자 결정)

| # | 항목 | 결정 |
|---|---|---|
| H-1 | 알림 본문 | 「프로그램 한국어명 · 그날 종목 목록」. 단계 번호·진행 상황은 넣지 않는다 |
| H-2 | 타임존 | 기기 타임존(`Intl.DateTimeFormat().resolvedOptions().timeZone`)을 meta 에 싣는다. 해외에 가도 현지 시각 기준 |
| H-3 | 이미 운동을 마친 날 | 그래도 보낸다. 수행 여부는 서버에 가지 않는다 |
| H-4 | 홈서버 의존 | 감수한다. 홈서버가 꺼져 있으면 알림이 오지 않는다 (알려진 한계) |
| H-5 | 설정 위치 | **`/settings` 페이지 신설.** 상단 바에 라벨 붙은 「설정」 버튼으로 들어간다. 하단 네비 4탭은 그대로. About 모달은 손대지 않는다 |
| H-6 | 알림 받을 시각 | 하나. 분 단위. 기본값 `19:00` |
| H-7 | 릴레이 | push-relay 게이트웨이. 개발 빌드는 dev(`push-dev.`), 운영 빌드는 prod(`push.`) |
| H-8 | 연동 문서 피드백 | 작업 중 `integration.md` 의 오류 · 부정확 · 애매한 표현 때문에 생긴 문제를 기록해 최종 보고에 별도 절로 낸다 (FR-38) |
| H-9 | 테스트 발송 | `/settings` 알림 섹션에 「지금 푸시 보내기」 버튼을 둔다. dev 릴레이 빌드에서만 표시·동작한다 (`PUBLIC_PUSH_RELAY_URL` 이 dev 주소일 때). 알림이 `on` 일 때만 활성. cron dev 인스턴스는 `meta.test` 가 10분 이내 과거이면 요일·시각 무관하게 테스트 알림 1건을 보낸다 (FR-33.11 · FR-35.8) |

---

## 선행 조건 (릴레이 운영자 작업)

연동 문서 §1. 코드 작업과 별개로 운영자가 관리 UI 에서 한다.

- [ ] P-1: prod 릴레이에 앱 id `bigsix`, 허용 Origin `https://bigsix.siot-ieung.duckdns.org` 등록
- [ ] P-2: dev 릴레이에 앱 id `bigsix`, 허용 Origin `http://localhost:5173` 등록
- [ ] P-3: 등록하면 릴레이가 cron API 키를 발급해 자기 키 파일에 바로 쓴다 (push-relay 0.1.2). 키 원문은 누구에게도
      보이지 않고 주고받을 것이 없다. bigsix 쪽 수동 작업 없음 — 유닛이 그 파일을 바로 읽는다 (FR-36.3)

---

## Functional Requirements

### FR-31: 서비스워커 injectManifest 전환 — 완료

`SvelteKitPWA` 를 `generateSW` 에서 `injectManifest` 로 옮기고 커스텀 SW `src/pwa-sw.ts` 를 둔다.
`importScripts` 를 얹을 자리가 필요해서다. 커밋 `9f5dd00` · `d7b4ee1` · `5cd02c3`.

- [x] FR-31.1: 프리캐시 · `ignoreURLParametersMatching` · `navigateFallback` · autoUpdate 를 SW 코드로 등가 재구성 (NFR-30)
- [x] FR-31.2: 출력 파일명 `sw.js` 유지 — `sw.svelte.ts` 의 `/sw.js` 직접 등록과 맞는다
- [x] FR-31.3: 프리캐시 등가성 로컬 대조(`tests/unit/precache-parity.test.ts`) · 배포 후 전수 대조(`deploy/deploy.sh`)
- [x] FR-31.4: 빌드 산출 `sw.js` 에 `import` 문이 없다 — classic SW 라 `importScripts` 를 쓸 수 있다

### FR-32: 릴레이 연결 (서비스워커 · 스크립트)

- [x] FR-32.1: 릴레이 공개 주소는 빌드 환경변수 `PUBLIC_PUSH_RELAY_URL` 하나로 받는다.
      `.env.development` = `https://push-dev.siot-ieung.duckdns.org`,
      `.env.production` = `https://push.siot-ieung.duckdns.org`. 둘 다 커밋한다 (비밀 아님).
- [x] FR-32.2: `src/pwa-sw.ts` 최상위에서 `importScripts(<릴레이>/sw.js)` 를 부른다.
      릴레이에 닿지 않아 예외가 나도 **SW 설치 전체가 실패하면 안 된다** — 앱 갱신 · 오프라인이
      푸시 때문에 깨지지 않게 감싼다. 앱 SW 에 `push` · `notificationclick` 핸들러를 두지 않는다.
      릴레이 `sw.js` 를 프리캐시에 넣지 않는다.
- [ ] FR-32.3: `client.js` 는 `app.html` 에 넣지 않는다. 필요할 때(설정 화면 진입 · FR-33.6 동기화)
      `<script>` 를 동적으로 붙여 불러오고, 한 번 불린 뒤에는 재사용한다. 첫 화면과 오프라인 진입이
      릴레이 스크립트에 묶이지 않게 하기 위해서다.
- [x] FR-32.4: `pnpm dev` 는 5173 포트로 고정한다 (`strictPort`). dev 릴레이에 등록된 Origin 과 어긋나면
      `origin-not-allowed` 가 나기 때문이다 (연동 문서 §환경).

### FR-33: 설정 화면 `/settings`

- [ ] FR-33.1: 새 경로 `/settings` 를 둔다. 프리렌더 대상. 하단 네비 탭은 늘리지 않는다.
      상단 바에 라벨이 붙은 「설정」 버튼(링크)을 더한다. 좁은 화면에서도 라벨을 최대한 남긴다.
- [ ] FR-33.2: **알림 섹션**에 다음을 둔다.
      (a) 상태 문구 — `PushRelay.state()` 결과를 글자로: `on` → 「알림 켜짐」, `off` → 「알림 꺼짐」,
          `denied` → 「알림 권한 거부됨 — 브라우저 설정에서 바꿀 수 있습니다」,
          `unsupported` → 「이 브라우저에서는 푸시 알림을 쓸 수 없습니다. iPhone 은 홈 화면에 추가한 앱에서만 됩니다」.
          스크립트 로딩 중에는 「확인 중」.
      (b) 켜기 / 끄기 버튼 — 상태에 따라 하나. 글자 라벨.
      (c) 시각 — `<input type="time">`, 분 단위.
- [ ] FR-33.3: **켜기** — 클릭 핸들러 안에서 `PushRelay.enable(meta)` 를 부른다 (권한 창은 사용자
      제스처에서만). 앱 진입 시 자동으로 권한을 묻지 않는다.
- [ ] FR-33.4: **끄기** — `PushRelay.disable()`.
- [ ] FR-33.5: **시각 변경** — `change` 이벤트에서 `bigsix.push` 에 저장하고, 알림이 켜져 있으면
      `enable(새 meta)` 를 다시 부른다 (구독 ID 는 유지된다 — 연동 문서 §2). 별도 저장 버튼은 없다.
      꺼져 있을 때 바꾼 시각은 저장만 해두고 다음 켜기에 쓴다.
- [ ] FR-33.6: **meta 자동 동기화** — 알림이 켜져 있는 동안 meta(FR-34) 가 마지막으로 보낸 값과
      달라지면 `enable(새 meta)` 를 다시 부른다. 프로그램 선택 · 수동 전환 · 전환 제안 승인 · 종목
      잠금 해제 · 타임존 변경이 모두 이 한 규칙으로 잡힌다. 호출 지점마다 훅을 박지 않는다.
      동기화 실패(오프라인 등)는 조용히 넘기고 다음 앱 진입 때 다시 한다.
- [ ] FR-33.7: 프로그램 미선택이면 켜기 버튼을 비활성화하고 「프로그램을 먼저 선택하세요」 를 보인다.
- [ ] FR-33.8: 실패는 `Error.code` 별 문구로 알림 섹션에 표시한다 (연동 문서 §2 표):
      `denied` · `unsupported` · `no-service-worker` · `origin-not-allowed` · `push-service-not-allowed` ·
      `subscribe` · `network` · `server`. 문구는 사실만 적는다.
- [ ] FR-33.9: 로컬 저장은 별도 키 `bigsix.push` = `{ notifyAt, sentMeta }`. `bigsix.state` 에 넣지 않는다.
      켜짐 여부의 정본은 `PushRelay.state()` 다 — 로컬에는 시각과 마지막으로 보낸 meta 만 둔다.
- [ ] FR-33.10: 전체 초기화(`ui/state/reset.ts`) 는 알림이 켜져 있으면 `disable()` 하고 `bigsix.push` 를 지운다.
- [ ] FR-33.11: **테스트 발송 버튼** — `PUBLIC_PUSH_RELAY_URL` 이 dev 주소(`https://push-dev.siot-ieung.duckdns.org`)일 때만 렌더링한다. 판정은 순수 함수로 뺀다. 알림이 `on` 일 때만 활성. 클릭 시 현재 meta 에 `test: "<UTC ISO 초 단위>"` 를 추가해 `enable(meta)` 를 재호출한다. `sentMeta` 비교(FR-34.3)에서는 `test` 필드를 뺀 meta 를 직렬화해 비교 — 자동 동기화가 test 발송 때문에 불필요하게 트리거되지 않는다.

### FR-34: meta (앱 → 릴레이 → cron)

meta 는 릴레이가 해석하지 않고 cron 이 구독 목록으로 돌려받는 JSON 이다 (직렬화 1024 바이트 이하).
**알림 문구 재료를 앱이 미리 만들어 싣는다** — cron 이 bigsix 도메인(`progressions.json` · 종목 잠금)을
몰라도 되게 하기 위해서다.

- [ ] FR-34.1: 형식
      ```json
      {
        "v": 1,
        "tz": "Asia/Seoul",
        "notifyAt": "19:00",
        "program": "모범수",
        "days": { "월": ["푸시업", "레그 레이즈"], "수": ["풀업", "스쿼트"], "금": ["핸드스탠드 푸시업", "브리지"] }
      }
      ```
      선택 필드: `"test": "<UTC ISO 초 단위>"` — 테스트 발송 버튼(FR-33.11)이 붙이는 타임스탬프. cron 이 dev 인스턴스일 때만 읽는다. prod cron 은 무시한다. `test` 포함 meta 도 1024 바이트 상한 안에 들어온다(~30 B 추가).
      - `days` 키는 도메인 `Weekday` 값(`월`~`일`). 종목이 없는 요일은 키를 넣지 않는다
      - 종목 목록은 도메인 `planDay(state, catalog, programId, weekday).exercises` 를 그대로 쓴다 —
        잠긴 종목과 빅6 밖 라벨(악력 · 종아리 · 목)은 빠진다. 문자열은 가공하지 않는다 (NFR-2)
      - `program` 은 현재 구간 프로그램의 한국어명
- [ ] FR-34.2: meta 를 만드는 순수 함수를 `src/lib/ui/push/` 에 둔다. 입력은 AppState · catalog · tz ·
      notifyAt, 출력은 meta 객체. 유닛 테스트로 다섯 프로그램 모두 1024 바이트 안인지 확인한다
      (요일표 라벨 그대로 둔 실측 최대 408 바이트 — 독방 감금).
- [ ] FR-34.3: 「달라졌다」 판정(FR-33.6)은 직렬화 문자열 비교로 한다. 단, `test` 필드는 비교에서 제외한다 (FR-33.11).

### FR-35: 홈서버 발송 cron

저장소 루트 `cron/` 에 둔다. SvelteKit 앱의 일부가 아니다 — `src/` 를 import 하지 않는다.

- [ ] FR-35.1: 실행 — Node 24 로 `cron/push.ts` 를 직접 돌린다. systemd timer 로 매 분, oneshot.
- [ ] FR-35.2: 매 실행
      1. `GET /v1/subscriptions` 를 `next` 가 `null` 이 될 때까지 이어 받는다
      2. 구독마다 `meta.tz` 기준 현지 날짜 · 요일 · 분을 구한다
      3. **보낼 차례** — 현지 시각이 `[notifyAt, notifyAt + 30분)` 안이고 `meta.days[요일]` 이 비어 있지 않다.
         30분 창은 홈서버가 잠깐 멈췄거나 `failed` 가 났을 때 다음 실행이 다시 보내게 하려는 것이다.
         창은 현지 자정을 넘지 않는다 (EC-80)
      4. 보낼 차례인 구독만 모아 `POST /v1/send` 한 번. 0건이면 부르지 않는다
- [ ] FR-35.3: 메시지
      ```json
      {
        "to": "<구독 id>",
        "notification": { "title": "BigSix", "body": "모범수 · 푸시업, 레그 레이즈", "url": "/", "tag": "bigsix-workday", "icon": "<절대 URL>/icon-192.png" },
        "dedupKey": "<현지 날짜 YYYY-MM-DD>"
      }
      ```
      `dedupKey` 가 현지 날짜이므로 창 안에서 매 분 다시 보내도 하루 한 번만 간다 (`suppressed`).
- [ ] FR-35.8: **dev 테스트 발송** — `--instance dev` 로 실행된 cron 에서만 동작. `meta.test` 가 있고 현재 UTC 기준 10분 이내 과거이면 요일·`notifyAt` 판정을 건너뛰고 테스트 알림을 1건 발송한다. `dedupKey = "test-" + YYYYMMDDHHMMSS` (UTC, `meta.test` 값에서). 정규 발송과 같은 실행에서 같은 구독에 둘 다 해당하면 둘 다 보낸다 (dedupKey 가 다르다). 테스트 알림 본문: `body` = `「테스트 · <현지 시각 HH:MM> · <정규 본문>」`. 오늘이 휴식일(현지 요일이 `meta.days` 에 없음)이면 정규 본문 자리에 `<program> · 오늘 휴식일` 을 쓴다. prod cron 은 `test` 필드를 무시한다.
- [ ] FR-35.4: 결과 처리 (연동 문서 §7)
      - `requestId` 는 보내기 전에 만들어 로그에 남긴다 (`bigsix-<UTC 분>-<난수>`)
      - `sent` 가 아닌 결과는 전부 로그에 남긴다 (stdout → journald)
      - `failed` 는 따로 하지 않는다 — 창 안이면 다음 실행이 같은 `dedupKey` 로 다시 보낸다
      - 응답을 잃으면(타임아웃 · 연결 끊김) 역시 다음 실행이 같은 `dedupKey` 로 다시 보낸다
      - `gone` · `not-found` · `suppressed` 는 할 일 없음 (릴레이가 이미 정리했거나 이미 갔다)
- [ ] FR-35.5: meta 가 형식에 맞지 않는 구독(`v` 불일치 · 모르는 tz · `notifyAt` 형식 오류)은 건너뛰고 로그에 남긴다.
      한 구독의 문제로 전체 실행이 멈추지 않는다.
- [ ] FR-35.6: 판정(FR-35.2-2·3)과 메시지 조립(FR-35.3)은 순수 함수로 빼서 유닛 테스트한다.
      현재 시각은 인자로 받는다 — 시스템 시각은 진입점에서 한 번만 읽는다.
- [ ] FR-35.7: 설정은 환경변수 `PUSH_RELAY_API`(cron API 주소) · `PUSH_RELAY_KEY` 둘.

### FR-36: 배포

- [ ] FR-36.1: cron 은 서버 체크아웃(`~/apps/bigsix`, `deploy.sh` 의 `REPO`)의 `cron/push.ts` 를 그대로 돌린다.
      `deploy.sh` 가 체크아웃을 갱신하면 다음 실행부터 새 코드다. 재시작할 프로세스가 없다.
- [ ] FR-36.2: systemd 템플릿 유닛 `bigsix-push@.service` (oneshot) · `bigsix-push@.timer` (매 분).
      인스턴스 `prod` · `dev` 가 각자 키 파일을 읽는다. `prod` 는 상시, `dev` 는 개발 중에만 켠다.
- [ ] FR-36.3: 키 파일은 **릴레이가 소유한다** — `~/apps/push-relay/<env>/data/keys/bigsix.env` (권한 600).
      앱 등록 · 「새 키 발급」 때 릴레이가 쓰고, bigsix 는 읽기만 한다 (연동 문서 §1, push-relay 0.1.2).
      ```
      PUSH_RELAY_API=http://127.0.0.1:8793   # dev 는 8803
      PUSH_RELAY_KEY=prk_…
      ```
      유닛은 이 경로를 바로 읽는다: `EnvironmentFile=/home/ulismoon/apps/push-relay/%i/data/keys/bigsix.env`.
      인스턴스 이름(`prod` · `dev`)이 릴레이 환경 디렉터리 이름과 같아 템플릿 하나로 맞는다.
      연동 문서가 권하는 `~/.config/bigsix/` 심볼릭 링크는 두지 않는다 — bigsix 에 미리 정한 경로가 없어
      링크가 수동 단계만 하나 늘린다. `~` · `%h` 는 system 유닛에서 systemd 가 풀지 않으므로(system 유닛의
      `%h` 는 `User=` 설정과 무관하게 `/root` 로 풀린다 — man systemd.unit 「not influenced by the User=
      setting」), `deploy/push-install.sh` 가 설치 시 `getent passwd` 로 뽑은 절대 경로를 유닛 파일에 박는다.
      유닛은 릴레이와 같은 사용자(`User=ulismoon`)로 돈다 — 키 파일이 600 이다.
      키 파일이 없으면(키 폐기 · 앱 삭제로 릴레이가 지움) 그 인스턴스는 실행마다 실패를 로그에 남기고 끝난다 (발송 없음).
- [ ] FR-36.3a: **키 교체** — 운영자가 관리 UI 「새 키 발급」 을 누르면 같은 경로의 파일이 새 키로 바뀐다.
      oneshot 이 실행마다 파일을 새로 읽으므로 다음 실행(1분 안)부터 새 키다. bigsix 재시작 · 재배포 없음.
      키 표 「마지막 사용」 으로 넘어간 것을 확인한 뒤 이전 키를 폐기한다. `deploy/README.md` 에 이 절차를 적는다.
- [ ] FR-36.4: 유닛 설치는 최초 1회 root 스크립트(`deploy/push-install.sh`) 로 한다. `node` 절대 경로를
      설치 시점에 확정한다 (서버 Node 는 nvm).
- [ ] FR-36.5: `deploy.sh` 배포 후 검증에 `bigsix-push@prod.timer` 활성 여부를 더한다.
- [ ] FR-36.6: `deploy/README.md` 첫 줄의 「정적 파일뿐이라 서버 런타임은 없다」 를 고친다 —
      정적 앱 + 1분 cron 하나.

### FR-37: 문서

- [ ] FR-37.1: README — 알림 기능 설명, 알려진 한계(EC-81 · EC-82 · 홈서버 의존 · NFR-31)
- [ ] FR-37.2: CHANGELOG 0.3.0
- [ ] FR-37.3: CLAUDE.md — `data-push-*` · `data-settings-*` 훅 목록, `ui/push` 하위 폴더,
      「서버 기능은 존재하지 않는다」 를 「SvelteKit 서버 기능은 없다. 홈서버 cron(`cron/`) 하나가 있다」 로

### FR-38: 연동 문서 이슈 기록

- [ ] FR-38.1: 작업 중 `integration.md` 의 **오류 · 부정확 · 애매한 표현** 때문에 개발에 문제가 생기면
      그때마다 이 SPEC 끝 「연동 문서 이슈 로그」 에 적는다. 항목마다: 문서 위치(절 · 문장),
      무엇이 문제였나, 실제 동작(확인 방법 · 근거), 어떻게 우회했나, 문서 수정 제안.
- [ ] FR-38.2: 최종 보고(PR 본문 · 작업 완료 보고)에 **「push-relay 연동 문서 이슈」 를 별도 절로** 싣는다.
      이슈가 없었으면 「없음」 이라고 적는다. push-relay 쪽 수정은 이 작업 범위가 아니다 — 보고만 한다.

---

## Non-Functional Requirements

- [ ] NFR-29: 1~3차 NFR 전부 유효. 특히 NFR-2 표시 원칙, NFR-3 도메인 순수성, NFR-4 단방향 의존.
- [x] NFR-30: injectManifest 전환 후에도 프리캐시 · 쿼리 무시 · SPA fallback · `controllerchange` 새로고침이
      그대로다. 배포 후 프리캐시 전수 대조가 통과해야 한다. (FR-31 에서 충족)
- [ ] NFR-31: **기기 밖으로 나가는 것**: meta(tz · 시각 · 프로그램명 · 요일별 종목명)와 푸시 구독.
      운동 기록 · 단계 · 수행 여부는 나가지 않는다. 다만 요일별 종목명은 잠금 해제된 종목을 반영하므로
      진행 정도를 거칠게 드러낸다 — 이 사실을 README 에 적는다.
- [ ] NFR-32: `prk_…` 키는 저장소에 들어가지 않는다. 테스트로 막는다 (커밋된 파일에 키 형태의 값이 없어야 한다).
- [ ] NFR-33: `pnpm check` 오류·경고 0, `pnpm test` 전부 통과를 각 커밋에서 유지.
- [ ] NFR-34: `src/lib/domain/**` 은 수정하지 않는다. 알림 로직은 `src/lib/ui/push/` 에 둔다.
- [ ] NFR-35: 첫 화면 · 오프라인 진입이 릴레이 가용성에 묶이지 않는다 (FR-32.2 · FR-32.3).

---

## Constraints

- SvelteKit 서버 기능(`+page.server` · `+server` · form actions · 서버 훅)은 여전히 쓰지 않는다.
  서버 쪽 코드는 `cron/` 하나이고 앱 빌드와 섞이지 않는다.
- 릴레이 cron API 는 홈서버 loopback 에만 있다. cron 은 홈서버에서만 돈다.
- iOS 는 홈 화면에 설치한 PWA(iOS 16.4+)에서만 푸시가 된다. 릴레이 `state()` 가 `unsupported` 로 알려준다.
- `src/lib/ui/session/notify.ts`(세션 타이머의 소리·진동)는 이 기능과 별개다. 합치지 않는다.
- 새 npm 의존성 없음. 클라이언트는 릴레이 `client.js`, cron 은 Node 내장 `fetch` · `Intl`.

---

## 화면 설계

cube-study CONVENTIONS 준용 (CLAUDE.md 「화면을 만들거나 고칠 때」).

- [ ] UI-12: `/settings` 는 `padding: 1rem 0` 만 (CLAUDE.md). 섹션 제목 「알림」.
- [ ] UI-13: 상단 바 「설정」 버튼 — 기존 버튼들(테마 · wake lock · About)과 같은 모양, 글자 라벨.
- [ ] UI-14: 켜기/끄기 버튼은 글자 라벨. 색만으로 상태를 알리지 않는다 — 상태 문구가 함께 선다.
- [ ] UI-15: 잠금(프로그램 미선택 · `denied` · `unsupported`)은 투명도 + 커서 + `disabled`.
      알림이 꺼져 있어도 시각 입력은 쓸 수 있다 (FR-33.5).
- [ ] UI-16: `data-*` 훅 — `data-settings-open`(상단 바), `data-push-state`(값: `loading|unsupported|denied|off|on`),
      `data-push-enable`, `data-push-disable`, `data-push-time`, `data-push-error`(값: 오류 code),
      `data-push-need-program`, `data-push-test`(테스트 발송 버튼, dev 빌드에서만). CLAUDE.md 훅 목록에 더한다.

---

## Analysis Results

### Related Code

| 무엇 | 위치 | 쓰임 |
|---|---|---|
| 커스텀 SW | `src/pwa-sw.ts` | FR-32.2 `importScripts` 자리 |
| SW 등록 | `src/lib/ui/shell/sw.svelte.ts:54` | `/sw.js` classic 등록 — `importScripts` 가능 |
| 상단 바 | `src/routes/+layout.svelte:160` | About 버튼 옆에 「설정」 (FR-33.1) |
| 요일별 계획 | `src/lib/domain/schedule.ts:28` `planDay` | meta.days 재료 (FR-34.1). `$lib/domain` 로 export 돼 있다 |
| 현재 구간 | `src/lib/domain/program.ts:156` `currentStint` | meta.program |
| 프로그램 스케줄 | `src/lib/data/progressions.json:1703,1738,1782,1829,1920` | 다섯 프로그램 요일표. 일요일은 전부 비어 있다 |
| 전체 초기화 | `src/lib/ui/state/reset.ts` | FR-33.10 |
| 배포 | `deploy/deploy.sh:19` (`REPO="${DEPLOY_REPO:-$HOME/apps/bigsix}"`) · `deploy/remote.sh` | FR-36 |
| deploy README | `deploy/README.md:3` | FR-36.6 |

### 프로그램별 meta 크기 (요일표 라벨 그대로, tz `America/Argentina/Buenos_Aires` 로 둔 실측)

| programId | 한국어명 | 운동 요일 | meta 바이트 |
|---|---|---|---|
| `new_blood` | 신참 | 월 · 목 | 154 |
| `good_behavior` | 모범수 | 월 · 수 · 금 | 205 |
| `veterano` | 베테랑 | 월~토 | 229 |
| `solitary_confinement` | 독방 감금 | 월~토 | 408 |
| `supermax` | 슈퍼맥스 | 월~토 | 324 |

실제 meta 는 `planDay` 가 악력 · 종아리 · 목과 잠긴 종목을 빼므로 이보다 작다.

---

## Edge Cases

| # | 상황 | 동작 |
|---|---|---|
| EC-74 | 알림 권한 거부 | 상태 「알림 권한 거부됨…」. 켜기 비활성. 다시 묻지 않는다 |
| EC-75 | 켜둔 뒤 브라우저 설정에서 권한 철회 | 다음 설정 화면 진입 때 `state()` 가 `denied` — 그대로 표시 |
| EC-76 | 푸시 미지원 브라우저 · iOS 미설치 | `unsupported` 문구. 켜기 버튼 없음 |
| EC-77 | 프로그램 미선택 | 켜기 비활성, 「프로그램을 먼저 선택하세요」 (FR-33.7) |
| EC-78 | 릴레이에 닿지 않음 (켜기 · 시각 변경 중) | `network` · `server` 문구. 시각은 로컬에 저장돼 있다 |
| EC-79 | 휴식일 (그날 `days` 키 없음) | cron 이 그 구독을 건너뛴다 |
| EC-80 | `notifyAt` 이 23:30 이후 | 창이 현지 자정에서 잘린다 (예: 23:50 → 23:50~23:59). 다음 날로 넘겨 보내지 않는다 |
| EC-81 | 홈서버가 알림 시각 ~ +30분 동안 꺼져 있음 | 그날 알림은 가지 않는다 (H-4) |
| EC-82 | 앱 삭제 · 재설치, 브라우저 데이터 삭제 | 새 구독이 생긴다. 옛 구독은 발송 때 `gone` 이 되고 릴레이가 지운다. 사용자가 다시 켜야 한다 |
| EC-83 | 같은 날 알림을 받은 뒤 시각을 더 늦게 바꿈 | 같은 날짜 `dedupKey` 라 그날은 다시 가지 않는다. 다음 날부터 새 시각 |
| EC-84 | 여행으로 타임존이 바뀜 | 다음 앱 진입 때 meta 동기화(FR-33.6)로 새 tz 반영. 앱을 열기 전까지는 옛 tz 기준 |
| EC-85 | 오프라인에서 프로그램 전환 | 동기화 실패를 넘기고 다음 진입 때 다시 (FR-33.6). 그 사이 알림은 옛 meta 기준 |
| EC-86 | `pnpm preview`(4173) 에서 켜기 | prod 릴레이 · 미등록 Origin → `origin-not-allowed` 문구. 푸시 확인은 `pnpm dev` 또는 배포본에서 |
| EC-87 | 릴레이 `sw.js` 를 받지 못한 채 SW 설치 | 앱 SW 는 정상 설치된다 (FR-32.2). 이 상태에서는 푸시가 표시되지 않을 수 있다 — 다음 SW 갱신 때 회복 |
| EC-88 | 여러 기기 | 기기마다 구독 · meta 가 따로다. 각자 켜고 시각을 정한다 |

---

## Out of Scope

- 알림에서 바로 기록하기 (Notification Action)
- 여러 알림 시각, 요일별 다른 시각
- 종목별 개별 알림
- 미수행일 사후 알림, 「오늘 이미 했으면 건너뛰기」 (H-3)
- 알림 기록 · 통계
- 알림 문구 직접 입력
- 알림 이미지(`image` · `badge`)
- push-relay 저장소 수정 (FR-38 은 보고만)

---

## Open Questions

| # | 질문 | 메모 |
|---|---|---|
| OQ-20 | `$env/static/public` 을 `src/pwa-sw.ts` 에서 쓸 수 있는가 | **해소** — `$env/static/public` 을 SW 에서 import 해 빌드 성공, 산출 sw.js 에 URL 인라인 확인 |
| OQ-21 | `importScripts` 실패를 감싸는 방법이 브라우저 셋(Chrome · Firefox · Safari)에서 같은가 | 설계에서 실측. 안 되면 FR-32.2 의 「설치 실패 금지」 를 다른 수단으로 |
| OQ-22 | 30분 창이 적절한가 | 길면 늦은 알림, 짧으면 재시도 기회가 준다. 일단 30분 |

---

## References

- push-relay `docs/integration.md` — 연동 계약 (화면 §2 · SW §3 · cron API §6 · 재시도 규칙 §7 · 확인 절차 §8)
- `.dc_workspace/2026_09_18-history-export/SPEC.md` — 3차
- `deploy/README.md` — 홈서버 배포 절차
- GitHub 이슈 #6 — 배경 · 대안 검토

---

## 연동 문서 이슈 로그 (FR-38)

기준: push-relay main `ebfd9e2` (0.1.2) 의 `docs/integration.md`. 이전 판에서 읽은 항목은 판을 표시한다.
SPEC 작성 중 읽으면서 걸린 것. 구현 중 실제로 문제가 됐는지는 「영향」 칸에 채운다.

| # | 위치 | 무엇 | 영향 · 우회 | 수정 제안 |
|---|---|---|---|---|
| IR-1 | 문서 위치 (0.1.0) | 연동 기준 문서가 `feature/gateway` 에만 있고 main 에는 없었다 | **해소** — 0.1.0 · 0.1.1 이 main 에 병합됨 (`82c4b24` · `39b0137`) | — |
| IR-2 | §환경 「한 Origin 은 한 앱에만 등록된다」 | 한 앱이 Origin 을 여러 개 가질 수 있는지(5173 · 4173 동시)가 문장에서 안 읽힌다. 또한 「한 Origin 은 한 앱에만」 이 환경(prod·dev) 안의 규칙인지 환경을 가로지르는 규칙인지 문서에 없다. 릴레이 env 파일에서 prod·dev 데이터 디렉터리가 분리되어 있어(`deploy/env/dev.env:7` · `prod.env:11`) 환경별 독립 규칙으로 추정 — 같은 https Origin(`https://bigsix.siot-ieung.duckdns.org`)을 dev 환경에도 등록해 dev 릴레이 빌드 임시배포본 시험에 사용한다 | 미정 — 5173 만 등록 후 임시배포 단계에서 추가 (EC-86, B.3) | 「한 앱은 Origin 을 여럿 가질 수 있다 / 없다」 와 「환경 독립 여부」 를 명시 |
| IR-3 | §2 「`enable` 은 사용자 제스처(클릭) 안에서 부른다」 | 권한이 이미 `granted` 일 때 meta 갱신용 `enable(새 meta)` 를 제스처 밖에서 불러도 되는지 없다. FR-33.6 자동 동기화가 여기에 기댄다 | **해소(코드)** — relay client.js 는 `Notification.permission === 'default'` 일 때만 `requestPermission` 을 부른다. 이미 `granted` 이면 제스처 밖 호출 가능. 실기기 재확인 Phase 5/7 | §2 에 「권한이 이미 `granted` 이면 제스처 밖에서 `enable` 호출 가능」 명시 |
| IR-4 | §3 `importScripts` 한 줄 | 릴레이에 닿지 않을 때 앱 SW 설치가 실패하는지, 감싸야 하는지 언급이 없다 | **구현(Phase 3)** — ADR-32 대로 `try { importScripts(...) } catch {}` 적용, 빌드 산출물에 운영 URL 인라인·호출 1회·try/catch 유지 확인 (`tests/unit/push/sw-importscripts.test.ts`). Chrome · Firefox · Safari 실기기 확인은 OQ-21 로 Phase 7 preview 단계까지 미정 | 실패 시 동작과 권장 패턴(try/catch 여부) 명시 |
| IR-5 | §6 발송 예시 `dedupKey` | 「같은 dedupKey 로 이미 보냄」 의 범위(구독별인지 앱 전체인지)와 보존 기간이 안 적혀 있다 | **해소(코드)** — dedup PK 는 `(subscription_id, dedup_key)` (구독별), 8일 보존 (`src/store/migrations.rs:40`, `src/store/mod.rs:161`) | §6 에 dedup 범위(구독별)와 보존 기간(8일) 명시 |
| IR-6 | §5 「`/…` 상대 경로는 앱 출처 기준」 · §5 아이콘 URL 해석 주체 | 누가 해석하는지(릴레이 `sw.js` 가 SW 출처로 해석?) 가 없다. `icon: "/icon-192.png"` 이 여기에 기댄다. 또한 상대 경로가 어느 출처를 기준으로 해석되는지 기기 종류마다 다를 수 있다 | **우회** — cron 이 icon 을 절대 URL(`https://bigsix.siot-ieung.duckdns.org/icon-192.png`)로 보냄. 실기기 확인 Phase 7 | 해석 주체 명시; 절대 URL 권장 여부 |
| IR-7 | §1 키 파일 경로 `~/apps/push-relay/prod/data/keys/<앱>.env` + 「systemd `EnvironmentFile=` 등」 | 예시 경로를 그대로 `EnvironmentFile=` 에 옮기면 systemd 가 `~` 를 풀지 않아 파일을 못 찾는다. 또 키 파일이 600 이라 **앱 cron 이 릴레이와 같은 사용자로 돌아야 읽힌다**는 조건이 문서에 없다 (릴레이 유닛 `deploy/systemd/push-relay@.service:10` `User=ulismoon` 에서 확인). 0.1.1 판의 「`app-key.sh` 실행 위치 · `~` 해석」 문제는 0.1.2 에서 수동 경로 인자가 사라져 해소 | FR-36.3 에서 절대 경로(설치 스크립트가 `getent passwd` 로 치환) · `User=ulismoon` 으로 우회 | `EnvironmentFile` 에 `getent` 로 구한 절대 경로를 쓴다는 예시와 「같은 사용자로 읽는다」 한 줄. `%h` 는 system 유닛에서 `/root` 로 풀리므로 `User=` 와 무관하게 쓸 수 없다 |
| IR-8 | §1 systemd `EnvironmentFile=` 예시 | 문서가 `EnvironmentFile=` 에 인스턴스 지시자 `%i` 와 절대 경로를 쓰는 예시를 제공하지 않는다. 인스턴스(`prod`/`dev`)가 릴레이 환경 디렉터리 이름과 같아 하나의 템플릿으로 양쪽을 커버할 수 있지만, 이 가능성이 문서에 없어 설계에서 직접 추론했다. 또한 `%h` 를 쓰려는 시도가 자연스럽지만 system 유닛에서 `%h` 는 `/root` 로 풀려 (`User=` 설정 무시 — man systemd.unit 「not influenced by the User= setting」) 실제로 쓸 수 없다 | `EnvironmentFile=/home/ulismoon/apps/push-relay/%i/data/keys/bigsix.env` (절대 경로, `push-install.sh` 가 치환) 로 우회 (ADR-39) | §1 에 `%i` 와 절대 경로를 쓴 `EnvironmentFile=` 예시 1줄 추가. `%h` 는 쓸 수 없다는 주의 한 줄 |
| IR-9 | §환경 「개발 포트를 고정한다」 | dev 포트 고정을 권장하지만 Vite `strictPort` 옵션을 언급하지 않는다. 설정 없이 다른 앱이 5173 을 먼저 점유하면 Vite 가 다른 포트로 자동 전환해 `origin-not-allowed` 가 발생한다 | `vite.config.ts` 에 `server: { port: 5173, strictPort: true }` 로 우회 (ADR-31, FR-32.4) | §환경에 「Vite 사용자는 `strictPort: true` 를 권장한다」 한 줄 |
| IR-10 | §6 「건수 상한은 없다 (body 1 MiB)」 배치 임계값 | 메시지 건수가 늘어 body 가 1 MiB 에 근접할 때 배치를 나눠야 하는지, 나눈다면 `requestId` 를 어떻게 부여해야 하는지 지침이 없다. 현재 bigsix 구독자 규모에서는 문제가 없지만 미래 확장 시 명세 공백이 된다 | 현 구현에서 단일 요청으로 전송 — 구독자 규모가 1 MiB 에 근접하면 별도 배치 분할 로직이 필요 | §6 에 body 임계값(예: 900 KiB) 초과 시 배치 분할 권장 절차 추가 |
| IR-11 | §6 예시 `requestId`(`…T19:00-0001`) 형식 vs §7 `crypto.randomUUID()` 권장 | §6 예시는 「분 + 순번」 형식(`bigsix-2026-10-01T19:00-0001`)이고 §7 은 `crypto.randomUUID()` 를 권장한다. Stateless oneshot cron 은 순번을 유지할 수 없어 둘 다 그대로 따를 수 없다. ADR-38 에서 「분 + 4자리 이상 임의 hex」 형식으로 조정 (`bigsix-<UTC YYYY-MM-DDTHH:MM>-<4자리 hex>`) | ADR-38 형식으로 우회 — 분 단위 추적 가능성과 충돌 확률의 균형 | §6·§7 에 「stateless oneshot 에서는 `<앱>-<분>-<random>` 패턴을 권장한다」 한 줄 |

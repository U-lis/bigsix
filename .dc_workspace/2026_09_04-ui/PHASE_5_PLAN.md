# Phase 5: 배포 (deploy/, CI, PWA 에셋, 임시 배포)

**목적**: 앱을 실제로 홈서버에 올린다. **`release.sh` 는 이식하되 실행하지 않는다** — 이번 배포는
`deploy.sh feature/ui` 로 브랜치를 올리는 **임시 배포** 다 (사용자 결정: PR 은 열되 병합하지 않는다).

**SPEC 커밋 경계**: (5) 배포 (Notes 「커밋 분리 지침」)
**커밋 수**: 2~3
- 커밋 A: `deploy/` 스크립트 + `.github/workflows/` + `tests/deploy/`
- 커밋 B: PWA 아이콘 3장 (`static/icon-*.png`)
- 커밋 C: nginx vhost — **이미 워킹트리에 있으므로 함께 스테이징만**. Phase 1 부터 존재했다

**병렬**: 없음
**Dependencies**: Phase 4 완료 (`pnpm build` 성공)

---

## 완료 정의

### 코드 커밋
- [ ] `deploy/release.sh` (실행 권한 포함) — cube-study 준용, bigsix 로 변수 조정
- [ ] `deploy/deploy.sh` — cube-study 준용, 변수 조정
- [ ] `deploy/remote.sh` — cube-study 준용, 변수 조정
- [ ] `deploy/lib.sh` — cube-study 그대로 (`resolve_commit`)
- [ ] `deploy/README.md` — bigsix 로 재작성 (호스트·리포 경로·docroot 조정, tailnet·인증서·머신 키
      만료 절 유지)
- [ ] `deploy/nginx/bigsix.conf` — 이미 존재. 커밋에 포함
- [ ] `.github/workflows/ci.yml` — 타입·단위·shellcheck·셸 테스트. Playwright 없음
- [ ] `.github/workflows/site-check.yml` — 인증서·기본 응답·프리캐시 매일 점검
- [ ] `tests/deploy/run.sh` `helpers.sh` `test-resolve-commit.sh` `test-git-sync.sh`
      `test-release-guards.sh` — cube-study 준용

### PWA 아이콘 (FR-11.4 / D-18)
- [ ] `static/icon.svg` — 마스터 소스 (직접 제작). 저작권 이슈 없는 순수 도형 (예: "6" 이 새겨진
      방패, 사각 프레임 등). 책 삽화 사용 금지 (FR-11.4)
- [ ] `static/icon-192.png` — 192×192
- [ ] `static/icon-512.png` — 512×512
- [ ] `static/icon-maskable.png` — 512×512, purpose: maskable (안전 영역 여백 20% 포함)
- [ ] `vite.config.ts` 의 manifest 아이콘 3장이 이 파일들을 가리킴

### 임시 배포 (사용자 결정)
- [ ] `git push origin feature/ui` 성공
- [ ] `./deploy/deploy.sh feature/ui` 실행 성공
  - 서버가 fetch → checkout → `pnpm install --frozen-lockfile` → `pnpm build` → docroot 반영
  - 배포된 커밋 SHA 대조 통과
  - `/` `/manifest.webmanifest` `/sw.js` 응답 200
  - **프리캐시 목록 전수 대조 통과** (cube-study 실전 함정)
- [ ] `curl -sS https://bigsix.siot-ieung.duckdns.org/` 로 화면 확인
- [ ] 폰에서 열어 홈화면 설치 시도 (수동, 성공 여부만 기록)
- [ ] 오프라인 모드로 앱 동작 확인 (NFR-6)
- [ ] **PR 은 열되 병합하지 않는다**

### `release.sh` 는 이식하되 실행하지 않는다
- [ ] `release.sh` 파일이 저장소에 존재하고 실행 권한이 있다
- [ ] 이 페이즈에서 `./deploy/release.sh 0.2.0` 을 **부르지 않는다**. `package.json` 의 `version` 은
      Phase 2 이후 `0.1.0` 유지. 태그 생성 없음
- [ ] `CHANGELOG.md` 에 `[0.2.0]` 항목을 미리 준비할 수 있으나, `release.sh` 검사 통과를 위한
      것은 아니다 — 아직 릴리스가 아니라 임시 배포이므로

---

## 사전 조건 확인

- [ ] Phase 4 커밋들이 모두 반영되어 있다. `pnpm build` 가 로컬에서 성공한다
- [ ] 홈서버 준비 상태 (사용자가 사전에 확인 완료):
  - `bigsix.siot-ieung.duckdns.org` DNS·인증서·nginx vhost·docroot `/var/www/bigsix` 구성됨
  - 서버 리포 `~/apps/bigsix` 존재
  - TLS 검증 통과 (현재는 docroot 비어 500)
- [ ] `~/.ssh/config` 의 `homeserver` 항목이 tailnet 호스트를 가리킨다 (cube-study 참조)
- [ ] `tailscale status` 로 서버가 tailnet 에 있고 자신도 연결됨

---

## 커밋 A 상세: `deploy/` + CI + `tests/deploy/`

### `deploy/lib.sh`

- [ ] cube-study `deploy/lib.sh` 그대로. `resolve_commit()` 함수 하나

### `deploy/deploy.sh`

- [ ] cube-study `deploy/deploy.sh` 를 복사한 뒤 다음만 변경:
  ```bash
  HOST="${DEPLOY_HOST:-homeserver}"
  REPO="${DEPLOY_REPO:-$HOME/apps/bigsix}"           # cube-study → bigsix
  DOCROOT="${DEPLOY_DOCROOT:-/var/www/bigsix}"       # cube-study → bigsix
  URL="${DEPLOY_URL:-https://bigsix.siot-ieung.duckdns.org}"
  ```
- [ ] 나머지 로직 (Tailscale 연결 확인, 프리캐시 대조, 커밋 SHA 대조) 그대로

### `deploy/remote.sh`

- [ ] cube-study 그대로. 리포·docroot 경로가 인자 (`REF` / `REPO` / `DOCROOT`) 로 넘어오므로 파일
      자체는 무변경
- [ ] `--force` 옵션 유지 (cube-study v0.2.0 함정 대비)
- [ ] rsync 순서 (해시 자산 먼저, HTML·sw 나중) 유지

### `deploy/release.sh`

- [ ] cube-study `deploy/release.sh` 를 복사한 뒤 다음만 변경:
  - `pnpm test:e2e` 라인 삭제 (이번 범위에 Playwright 없음 — GLOBAL 「SPEC 과의 불일치」5)
  - 나머지 (버전 정규식, 브랜치 검사, CHANGELOG 항목 검사, main 최신성, 태그 생성, push, `deploy.sh
    $TAG`) 그대로
- [ ] **이 페이즈에서 실행하지 않는다.** 정본은 Phase 4 완료 후 별도 릴리스 작업

### `deploy/README.md`

- [ ] cube-study `deploy/README.md` 를 복사한 뒤:
  - 사이트 주소 `cube.siot-ieung.duckdns.org` → `bigsix.siot-ieung.duckdns.org`
  - 리포 경로 `~/apps/cube-study` → `~/apps/bigsix`
  - docroot `/var/www/cube-study` → `/var/www/bigsix`
  - 앱 이름 `cube-study` → `bigsix` (Ctrl+H)
  - 실전 함정 절 (옮겨간 태그, annotated 태그 SHA, 인증서 install 조용한 실패, 프리캐시 404) 유지
- [ ] 임시 배포 절 추가:
  ```md
  ## 이번 작업 (0.2.0 UI 개발) 의 임시 배포

  0.2.0 은 아직 릴리스가 아니며 `feature/ui` 브랜치를 서버에 올려 검증한다.

      ./deploy/deploy.sh feature/ui

  `release.sh` 는 이식만 되어 있고 실행하지 않는다. 태그도 만들지 않고 `package.json` 의 버전도
  `0.1.0` 그대로다. PR 은 열되 병합하지 않는다 (사용자 결정).
  ```

### `deploy/nginx/bigsix.conf`

- [ ] 이미 워킹트리에 존재 (Phase 1 이전부터). 이 커밋에 함께 스테이징만
- [ ] 내용은 서버에 배치된 것과 md5 일치 (사용자 확인 완료). 이 페이즈에서 편집하지 않는다

### `.github/workflows/ci.yml`

cube-study `ci.yml` 을 복사한 뒤:
- [ ] `app` job 에서 Playwright 관련 스텝 (Playwright 캐시, 설치, `pnpm test:e2e`, 실패 흔적 업로드)
      전부 삭제
- [ ] 남는 스텝: `checkout` → `pnpm/action-setup` → `setup-node@v5` (node 24) → `pnpm install` →
      `pnpm run check` → `pnpm test`
- [ ] `deploy-scripts` job 은 그대로 (shellcheck, `bash tests/deploy/run.sh`)
- [ ] `concurrency` 그대로 (`ci-${{ github.ref }}`, cancel-in-progress)

### `.github/workflows/site-check.yml`

cube-study 그대로 복사 후 URL 만 변경:
- [ ] `env.SITE`: `https://bigsix.siot-ieung.duckdns.org`
- [ ] `MIN_CERT_DAYS: 14` 유지
- [ ] 인증서 · 기본 응답 · 프리캐시 3 스텝 유지
- [ ] "배포된 버전" 스텝은 cube-study 가 특정 문자열 패턴을 grep 함. bigsix 는 이 페이지 텍스트
      구조가 정해지지 않았으므로 이 스텝은 삭제하거나 나중에 조정. 이번에는 삭제

### `tests/deploy/`

- [ ] cube-study `tests/deploy/run.sh` 그대로 복사
- [ ] cube-study `tests/deploy/helpers.sh` 그대로 복사
- [ ] `test-resolve-commit.sh` — cube-study 그대로 (annotated 태그 SHA 대비, v0.1.0 함정)
- [ ] `test-git-sync.sh` — cube-study 그대로 (옮겨간 태그 --force, v0.2.0 함정)
- [ ] `test-release-guards.sh` — cube-study 그대로 (CHANGELOG · main · 워킹트리 · 태그 검사)
- [ ] 로컬에서 `bash tests/deploy/run.sh` 실행. **전 케이스 PASS**

### 커밋 A

- [ ] `git add deploy/ .github/ tests/deploy/`
- [ ] 커밋 메시지:
  ```
  ops(deploy): 홈서버 배포 스크립트 · CI · 배포 스크립트 셸 테스트

  cube-study 의 배포 방식을 준용한다. 로컬에서 도는 스크립트 (release/deploy/remote/lib) 와
  가짜 저장소로 동작하는 셸 테스트 (tests/deploy/).

  실전에서 겪은 두 함정을 이식된 검증이 잡는다:
  - 옮겨간 태그를 git fetch 가 조용히 무시하고 성공하는 문제 (--force 로 해결, v0.2.0 함정)
  - annotated 태그에서 커밋이 아닌 태그 객체 SHA 가 나오는 문제 (^{commit} 로 해결, v0.1.0 함정)

  CI 는 검사만 한다 (홈서버가 tailnet 안에 있어 GH runner 가 닿지 못한다).
  Playwright 는 이번 범위 밖.
  site-check.yml 은 인증서·프리캐시를 매일 점검한다 (인증서 조용한 만료 대비).

  nginx vhost 는 이미 워킹트리에 있어 함께 스테이징한다.

  이 페이즈에서 release.sh 는 실행하지 않는다 — 이번 배포는 deploy.sh feature/ui 로 하는
  임시 배포다 (사용자 결정: PR 은 열되 병합하지 않는다).
  ```

---

## 커밋 B 상세: PWA 아이콘 (FR-11.4 / D-18)

**요구**: 직접 제작. 저작권이 문제되지 않는 도형. 책의 삽화 사용 금지.

- [ ] `static/icon.svg` — 마스터. 단순 기하학 도형 조합 (예: 검은 배경 + "6" 자 + 사각 프레임 3개).
      배경 컬러는 manifest 의 `background_color` 와 일치
- [ ] `static/icon-192.png` — 192×192 (SVG 를 sharp / rsvg-convert / 다른 도구로 렌더). 이 페이즈
      실행 시점의 사용 가능한 도구로 만든다. cube-study 는 `sharp` devDependency 를 두었으나 이번은
      단발성이라 CLI 도구 (`rsvg-convert`, `inkscape --export`, ImageMagick) 로도 무방
- [ ] `static/icon-512.png` — 512×512
- [ ] `static/icon-maskable.png` — 512×512, purpose: maskable. **안전 영역 여백 20% 이상** (한국
      스마트폰 런처의 마스크가 원·둥근 사각 등 다양하므로 가운데 60% 안에 로고 배치)
- [ ] `vite.config.ts` 의 manifest 아이콘 3장 경로 확인 (Phase 4 커밋 5 에서 미리 적어둔 그대로)
- [ ] `pnpm build` 재실행 → `build/icon-*.png` 존재 확인 · SW 프리캐시 목록에 포함됨 확인

### 커밋 B

- [ ] `git add static/icon.svg static/icon-192.png static/icon-512.png static/icon-maskable.png`
- [ ] 커밋 메시지:
  ```
  assets(pwa): 아이콘 3장 + SVG 마스터 (FR-11.4 / D-18)

  직접 제작한 도형. 책의 삽화를 쓰지 않는다 (저작권).
  maskable 아이콘은 20% 안전 여백 확보 (한국 런처 마스크 다양성).
  ```

---

## 임시 배포 실행 (커밋 C 이후, 실배포)

- [ ] `git push origin feature/ui` — 서버가 origin 에서 받아가므로 push 가 먼저
- [ ] `./deploy/deploy.sh feature/ui` 실행. 다음 출력을 확인:
  - `==> 배포 대상: feature/ui (SHA)`
  - `==> ` SSH 연결 성공 (tailnet)
  - 서버측 fetch/checkout/pnpm install/pnpm build 성공
  - `==> 원격이 배포한 커밋 대조 ... 일치 (SHA)`
  - `==> 응답 확인 / 200 / manifest 200 / sw 200`
  - `==> 프리캐시 목록 대조 ... 전부 200`
  - `==> 완료: https://bigsix.siot-ieung.duckdns.org`

**프리캐시 목록에 404 가 하나라도 있으면 실패로 판정 → 원인 조사 후 재배포.** 대개 원인:
- vite-plugin-pwa 의 `globPatterns` 에 확장자 누락 (json 이 흔한 함정)
- 캐시 정책 오설정으로 `_app/immutable/` 이 404
- 아이콘 파일이 실제로 빌드 산출물에 포함되지 않음

- [ ] 브라우저에서 `https://bigsix.siot-ieung.duckdns.org` 열어 오늘 세션 / 프로그램 / 단계 화면 확인
- [ ] Chrome DevTools > Application > Manifest 확인. 이름 · lang · 아이콘 3장 로드됨
- [ ] Application > Service Workers 등록됨. Update on reload 로 새 배포 즉시 반영 확인
- [ ] Network 오프라인 모드로 새로고침 → 앱이 뜨고 화면 이동이 됨 (NFR-6)
- [ ] 폰 브라우저에서 열어 "홈 화면에 추가". 홈에서 실행되고 첫 실행 화면이 뜬다 (FR-3.5)

---

## PR 열기 (병합하지 않는다)

- [ ] `gh pr create --title "feat(ui): 0.2.0 UI (임시 배포)" --draft` (draft 여부는 사용자 선택)
- [ ] PR 본문에 요약 · 임시 배포 사실 · 최종 검증 결과 · SPEC/GLOBAL/PHASE 문서 링크
- [ ] **PR 을 병합하지 않는다** (사용자 결정)

---

## Out of Scope

- 정식 릴리스 (`release.sh 0.2.0`, 태그, `package.json` 버전 상승) — 다음 작업
- 서버 최초 1회 설정 (nginx 배치, acme.sh, 서버 리포 클론) — 이미 완료됨
- Playwright / e2e — GLOBAL 「SPEC 과의 불일치」5
- `pnpm test:e2e` 관련 CI 스텝
- 배포 자동화 (GH Actions 로 배포) — FR-14.3

---

## 검증

`PHASE_5_TEST.md` 의 항목을 순서대로 수행.

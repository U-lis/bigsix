# Phase 5 검증

**목적**: `deploy/` 스크립트와 CI 가 cube-study 가 겪은 실전 함정을 재발시키지 않는지, 그리고 임시
배포가 실제로 사이트를 띄우는지 확인한다.

---

## 커밋 A 이후 (deploy 스크립트 · CI · 셸 테스트)

### 파일 존재 · 실행 권한

- [ ] `test -x deploy/release.sh` 성공
- [ ] `test -x deploy/deploy.sh` 성공
- [ ] `test -x deploy/remote.sh` 성공
- [ ] `deploy/lib.sh` 존재 (실행 권한 불필요, source 로 로드)
- [ ] `deploy/README.md` 존재
- [ ] `deploy/nginx/bigsix.conf` 존재 (Phase 1 이전부터, 이 커밋에 포함)
- [ ] `.github/workflows/ci.yml` `.github/workflows/site-check.yml` 존재
- [ ] `tests/deploy/{run,helpers,test-*}.sh` 존재. run.sh / test-* 실행 권한

### 셸 테스트 통과 (실전 함정 방어)

- [ ] `bash tests/deploy/run.sh` — 전 케이스 PASS
  - `test-resolve-commit.sh` — annotated 태그에서 커밋 SHA 를 정확히 추출 (v0.1.0 함정 방어)
  - `test-git-sync.sh` — 옮겨간 태그를 서버가 따라간다 (v0.2.0 함정 방어)
  - `test-release-guards.sh` — CHANGELOG · main · 워킹트리 · 이미 있는 태그 검사

### shellcheck

- [ ] `shellcheck -x deploy/*.sh tests/deploy/*.sh` — 경고 없음

### CI 워크플로 정합성

- [ ] `.github/workflows/ci.yml` 안에 `pnpm run check` · `pnpm test` · `shellcheck` · `bash
      tests/deploy/run.sh` 스텝이 있다
- [ ] Playwright 관련 스텝이 **없다** (`grep -i playwright .github/workflows/ci.yml` 출력 없음)
- [ ] `.github/workflows/site-check.yml` 의 URL 이 `bigsix.siot-ieung.duckdns.org` 를 가리킨다
- [ ] `MIN_CERT_DAYS: 14` 유지

### 도메인 정책 확인

- [ ] `deploy/deploy.sh` 안의 `URL`, `REPO`, `DOCROOT` 가 bigsix 값
- [ ] `deploy/README.md` 안에 `cube-study` 라는 문자열이 남지 않음 (실수 방지 —
      `grep -n "cube-study" deploy/README.md` 출력 없음. `cube.siot-ieung...` 도 없음)
- [ ] "임시 배포" 절이 README 에 있다 (`grep -n "임시 배포\|feature/ui" deploy/README.md`)

---

## 커밋 B 이후 (PWA 아이콘)

- [ ] `test -f static/icon.svg && test -f static/icon-192.png && test -f static/icon-512.png &&
      test -f static/icon-maskable.png`
- [ ] `file static/icon-192.png` → `PNG image data, 192 x 192, ...`
- [ ] `file static/icon-512.png` → `PNG image data, 512 x 512, ...`
- [ ] `file static/icon-maskable.png` → `PNG image data, 512 x 512, ...`
- [ ] `pnpm build` 성공. `build/icon-192.png` `build/icon-512.png` `build/icon-maskable.png` 존재
- [ ] 서비스 워커 프리캐시 목록 (`build/sw.js` 또는 `build/workbox-*.js`) 에 아이콘 3장이 포함:
  `grep -oE '"[^"]*icon-(192|512|maskable)[^"]*"' build/sw.js`
- [ ] 아이콘이 저작권 문제가 없는 자체 제작 도형 (사람 눈 확인)

---

## 임시 배포 실행 이후

### push 및 실행

- [ ] `git push origin feature/ui` 성공 (또는 이미 최신)
- [ ] `./deploy/deploy.sh feature/ui` 실행. 아래 검증 각각 통과:

### 검증 각 항목

- [ ] `==> 배포 대상: feature/ui (SHA)` — 로컬 SHA 가 출력
- [ ] SSH 연결 성공 — tailnet 상 서버에 붙음
- [ ] 서버측:
  - `==> fetch` 성공 (`git fetch --all --prune --tags --force`)
  - `==> ` 체크아웃 SHA 표시
  - `==> 의존성` 성공 (`pnpm install --frozen-lockfile`)
  - `==> 빌드` 성공 (`pnpm run build`)
  - `==> docroot 반영` 성공 (rsync 두 단계)
  - `==> 배포된 커밋: <SHA>` 로컬 SHA 와 일치
- [ ] 로컬:
  - `==> 원격이 배포한 커밋 대조 ... 일치` — 로컬/서버 SHA 동일
  - `==> 응답 확인` — `/`, `/manifest.webmanifest`, `/sw.js` 전부 200
  - `==> 프리캐시 목록 대조 ... 전부 200` — 목록의 모든 URL 이 200 (cube-study 실전 함정 방어)
- [ ] `==> 완료: https://bigsix.siot-ieung.duckdns.org`

### 사이트 수동 확인

- [ ] 데스크톱 브라우저에서 접속. 200 응답
- [ ] Chrome DevTools → Application → Manifest 표시. `name: bigsix`, `lang: ko`, 아이콘 3장 로드
      (192/512/maskable)
- [ ] Chrome DevTools → Application → Service Workers "activated and is running"
- [ ] Network 오프라인 모드 → 새로고침 → 앱이 뜨고 화면 이동이 됨 (NFR-6)
- [ ] 첫 실행이므로 시작 단계 선택 화면 (FR-3.5) 이 뜬다
- [ ] 임의 값으로 첫 실행 완료 → 오늘 세션 화면
- [ ] 프로그램 선택 → 오늘 세션 → 세트 입력 → 완료의 짧은 시나리오 1회
- [ ] 폰 브라우저에서 접속. "홈 화면에 추가" 프롬프트 (Chrome/Safari). 설치 후 홈에서 실행

### PR 상태

- [ ] `gh pr view` 로 PR 이 열려 있고 **머지되지 않은** 상태 확인
- [ ] PR 본문에 임시 배포 사실이 명시되어 있다

---

## site-check.yml 첫 실행 확인 (배포 후 24시간 이내)

- [ ] `gh workflow run site-check.yml` 로 수동 실행 (또는 자연스러운 cron 대기)
- [ ] Actions 페이지에서 성공 확인
- [ ] 실패 시: 인증서 만료일 (14일 이하?), 프리캐시 404, 기본 응답 문제 중 하나 → 원인 조사 후 재배포

---

## 회귀 · 최종 확인

- [ ] 로컬 `pnpm test` — 여전히 전 케이스 통과 (Phase 3 이후 수치)
- [ ] 로컬 `pnpm run check` — 오류 · 경고 0
- [ ] 로컬 `pnpm build` — 성공
- [ ] `git log --oneline main..HEAD` — Phase 1~5 의 커밋들이 순서대로. 각 커밋 메시지가 명확한 관심사

---

## 실패 시 대처

### 프리캐시 404 (cube-study 실전 사고 재발)
- 원인 우선순위:
  1. `vite.config.ts` 의 `globPatterns` 에 확장자 누락 (`json` 이 흔함)
  2. `paths.relative` 미설정으로 `./_app/…` 이 잘못 풀림 (cube-study 는 `paths.relative: false` 로
     해결)
  3. `navigateFallback` 이 잘못된 경로 (cube-study 는 `'/'` 로 설정)
- 조치: `vite.config.ts` 를 cube-study 의 그것과 대조. 특히 `SvelteKitPWA.workbox` 옵션

### 커밋 SHA 대조 실패 (annotated 태그 함정)
- `deploy/lib.sh` 의 `resolve_commit` 이 `^{commit}` 을 안 붙였는지. cube-study 그대로 이식되었는지 확인
- 브랜치 배포에는 이 문제가 안 나므로 임시 배포에서는 거의 발생하지 않는다. 나중에 태그 배포 시
  검증됨

### 옮겨간 태그를 안 따라감
- `deploy/remote.sh` 의 `git fetch --all --prune --tags --force` 확인. `--force` 필수

### 서버가 tailnet 에서 사라짐
- 머신 키 만료 (반 년). cube-study README 의 "머신 키 만료" 절 참조. admin 콘솔에서 Disable key
  expiry

### 인증서 만료
- acme.sh 는 갱신했으나 nginx 복사 단계 실패. cube-study README 의 "인증서가 만료됐을 때" 참조.
  이번 작업 범위 밖 (서버 관리)이지만 site-check.yml 이 잡아준다

# Phase 7 — TEST 체크리스트

## CLAUDE.md 갱신

- [ ] `grep -n "2026_09_25-push-notification/SPEC.md" CLAUDE.md` — 문서 지도에 등재.
- [ ] `grep -n "2026_09_25-push-notification/GLOBAL.md" CLAUDE.md` — 문서 지도에 등재.
- [ ] SPEC3 두 줄은 「이전 개정」 으로 격하됨 (표기 확인).
- [ ] `grep -n "data-push-permission" CLAUDE.md` — 1건.
- [ ] `grep -n "data-push-status" CLAUDE.md` — 1건.
- [ ] `grep -n "data-push-notify-at" CLAUDE.md` — 1건.
- [ ] `grep -n "data-push-enable" CLAUDE.md` — 1건.
- [ ] `grep -n "data-push-disable" CLAUDE.md` — 1건.
- [ ] `grep -n "data-push-error" CLAUDE.md` — 1건.
- [ ] 훅 목록 항목이 값 형식(`값: '...' | '...'`)까지 명시.
- [ ] 「규약을 어긴 실제 사례」 절에 injectManifest 옵션 관련 항목 추가.

## README.md 갱신

- [ ] `grep -n "^## 알림" README.md` — 절 헤더 존재.
- [ ] `grep -n "홈서버가 꺼져 있" README.md` — H-13 알려진 한계.
- [ ] `grep -n "iOS 16.4" README.md` — iOS 조건 명시.
- [ ] `grep -n "endpoint\\|programId\\|notifyAt\\|tz" README.md` — 데이터 최소성 명시.
- [ ] 「알림 권한은 사용자 제스처」 문구 존재.

## CHANGELOG.md 갱신

- [ ] `grep -n "^## \\[0.3.0\\]" CHANGELOG.md` — 1건.
- [ ] 0.3.0 절에 Added · Changed · Known limitations 존재.
- [ ] `web-push`, `injectManifest`, `systemd`, `VAPID` 키워드 명시.
- [ ] `SPEC4` 참조 존재.

## GLOBAL.md 상태 갱신

- [ ] `.dc_workspace/2026_09_25-push-notification/GLOBAL.md` 의 Phase 목록에서 Status 가 전부 `Complete` 로 갱신 (Phase 1~7).
- [ ] RISK-1~9 항목의 실제 발생 여부 · 대응 결과 검증 메모.

## 통합

- [ ] `pnpm check` 오류 0, 경고 0.
- [ ] `pnpm test` 통과. 코드 변경 없어 테스트 수 그대로 (Phase 6 대비).
- [ ] `bash tests/server/run.sh` · `bash tests/deploy/run.sh` 통과 그대로.
- [ ] `git log --oneline main..HEAD` — Phase 1~7 커밋들이 시간순으로 정렬. 각 커밋 메시지가 (a·b·c 등의 세부 분할과 별개로) 릴리스 노트 작성에 쓰일 수 있는 수준.

## 릴리스 준비 (사용자 확인 후 실행)

- [ ] main 브랜치와 격차 확인 (`git log main..HEAD | wc -l`).
- [ ] `./deploy/release.sh 0.3.0` 이 CHANGELOG.md 에서 0.3.0 절을 찾아 진행 가능.
- [ ] 태그와 배포까지 완료되면 `git tag -l` 에 `v0.3.0` 등장.
- [ ] 배포된 앱 화면 About → 버전 `0.3.0` 표시.

## 품질 게이트

- [ ] `pnpm check` 오류 0, 경고 0.
- [ ] `pnpm test` 통과. 앱 tests **797 이상** 유지 (main `dc84f1e` 기준선 797 / 38 files).
- [ ] `bash tests/server/run.sh` 통과 (Phase 2 이후 스위트 회귀 없음).

---

## 검증 메모

<!-- Coder 가 채운다. 문서 diff 위치. -->

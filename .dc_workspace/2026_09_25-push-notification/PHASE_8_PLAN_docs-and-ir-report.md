# Phase 8: docs-and-ir-report

## 목표

사용자 대면 문서와 개발자 문서를 갱신하고, SPEC IR 로그를 마무리하고, PR 본문용 「push-relay 연동 문서 이슈」 절을 작성한다.

## 선행 조건

- Phase 7 완료.

## 구현 지침

### 1. `README.md` 갱신

「알림」 기능 절을 추가한다.

- 기능 설명: 운동일 사용자가 설정한 시각에 푸시 알림을 받는다.
- 켜는 방법: PWA 설치 → 설정 → 알림 켜기 → 시각 설정.
- 알려진 한계:
  - 홈서버가 `[notifyAt, notifyAt + 30분)` 동안 꺼져 있으면 그날 알림이 가지 않는다(H-4).
  - iOS: 홈 화면에 설치한 PWA(iOS 16.4+)에서만 된다.
  - 오늘 운동을 이미 마쳐도 알림은 보낸다(H-3).
  - 릴레이 meta 에 요일별 종목명이 실려 기기 밖으로 나간다 — 운동 기록·단계·수행 여부는 나가지 않지만 종목 구성이 진행 정도를 간접적으로 드러낸다(NFR-31).

### 2. `CHANGELOG.md` 갱신

파일 맨 위에 `## [0.3.0] - 2026-10-XX` 절을 추가한다(Keep a Changelog 형식). 실제 릴리스 날짜에 날짜를 채운다.

**추가**
- 푸시 알림: push-relay 를 통한 운동일 알림, 사용자 설정 시각
- `/settings` 페이지 — 알림 켜기/끄기 및 시각 설정
- 홈서버 cron 작업(`cron/push.ts`) — 알림 발송
- systemd 템플릿 유닛 `bigsix-push@.service` / `@.timer`
- dev 빌드 전용 테스트 발송 버튼(`지금 푸시 보내기`, `data-push-test`) — dev 릴레이 빌드에서만 표시

**변경**
- 상단 바: `/settings` 로 이동하는 「설정」 링크 추가
- `deploy/README.md`: 런타임 설명(정적 앱 + 1분 cron)과 키 교체 절차 추가
- `vite.config.ts`: 개발 서버 포트 5173 고정(`strictPort: true`)
- `deploy/deploy.sh`: `DEPLOY_MODE=dev` 로 dev 타이머 인스턴스를 지정해 배포 가능

### 3. `CLAUDE.md` 갱신

세 곳을 수정한다.

**a) `data-*` 훅 목록 확장** — 「화면을 만들거나 고칠 때」 절, 기존 `data-history-*` 블록 뒤에 추가:

```
**설정 화면 (Phase 4)**:
`data-settings-open`(상단 바 설정 링크),
`data-push-state`(값: `'loading|unsupported|denied|off|on'`),
`data-push-enable`, `data-push-disable`, `data-push-time`,
`data-push-error`(값: 오류 code), `data-push-need-program`,
`data-push-test`(dev 빌드 전용 테스트 발송 버튼).
```

**b) `src/lib/ui/` 하위 폴더 목록** — 「코드」 절의 폴더 목록 문장에 `push` (알림 켜기·끄기·자동 동기화)를 추가한다.

**c) 서버 코드 문구 수정** — 「서버 기능은 존재하지 않는다」로 시작하는 bullet 을 다음으로 변경한다:
「SvelteKit 서버 기능은 없다. 홈서버 cron(`cron/`) 하나가 있다.」

### 4. SPEC IR 로그 마감

미결 IR 항목의 「영향 · 우회」와 「수정 제안」 칸을 구현 페이즈에서 얻은 최종 결과로 채운다. IR-3 · IR-4 · IR-6 · IR-8 · IR-9 가 모두 해소됐거나 명시적 후속 메모가 있는지 확인한다.

### 5. 「push-relay 연동 문서 이슈」 보고 절 작성

PR 본문용 내용(FR-38.2). IR 로그에서 구현 중 실제 문제가 된 항목을 수집한다.

- 항목마다: `integration.md` 위치, 무엇이 문제였나, 실제 동작, 우회 방법, 수정 제안.
- 실제 문제가 없었으면: 「연동 문서 이슈 없음.」으로 적는다.
- push-relay 저장소 수정은 이 작업 범위 밖이다 — 보고만 한다.

## 완료 체크리스트

- [x] `README.md` 에 알림 절과 알려진 한계 포함 (IR-12 배달 지연 추가로 다섯 가지)
- [x] `CHANGELOG.md` 에 0.3.0 항목 추가
- [x] `CLAUDE.md` 에 `data-push-*` · `data-settings-open` 훅, `push` 폴더, 서버 코드 문구 수정
- [x] SPEC IR 로그 전 항목 해소 또는 후속 메모 기록 (IR-12 추가, IR-2·3·4·6 실기기 결과 보완)
- [x] PR 본문용 「push-relay 연동 문서 이슈」 절 작성 (COMPLETION_REPORT.md §push-relay 연동 문서 이슈)
- [x] `pnpm check` 오류 0
- [x] `pnpm test` 통과

## 참고

- `package.json` 버전 번호는 이 페이즈에서 올리지 않는다 — 릴리스·태깅 단계에서 처리한다.
- CHANGELOG 날짜 `2026-10-XX` 는 릴리스 시 채운다.

## 페이즈 종료 전 IR 로그 마감

모든 IR 항목에 최종 관찰 내용을 추가하고 해소 또는 명시적 보류로 표시한다. ADR-40 에 따라 이 페이즈가 IR 로그의 최종 갱신 지점이다.

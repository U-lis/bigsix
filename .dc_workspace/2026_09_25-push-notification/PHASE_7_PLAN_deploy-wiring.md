# Phase 7: deploy-wiring

## 목표

systemd 템플릿 유닛과 최초 1회 설치 스크립트를 만들고, 배포 검증 단계를 추가한다. `deploy/README.md` 에 런타임 설명과 키 교체 절차를 기록한다.

## 선행 조건

- Phase 5 · Phase 6 완료.

## 구현 지침

### 1. `deploy/systemd/bigsix-push@.service` 생성

```ini
[Unit]
Description=bigsix push notification sender (%i)
After=network-online.target

[Service]
Type=oneshot
User=ulismoon
EnvironmentFile=%h/apps/push-relay/%i/data/keys/bigsix.env
ExecStart=/ABSOLUTE_NODE_PATH --experimental-strip-types /ABSOLUTE_REPO_PATH/cron/push.ts
StandardOutput=journal
StandardError=journal
SyslogIdentifier=bigsix-push-%i
```

`/ABSOLUTE_NODE_PATH` · `/ABSOLUTE_REPO_PATH` 는 플레이스홀더이며, `deploy/push-install.sh` 가 설치 시 실제 경로로 치환한다.

### 2. `deploy/systemd/bigsix-push@.timer` 생성

```ini
[Unit]
Description=bigsix push notification timer (%i)
After=network-online.target

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
AccuracySec=10s

[Install]
WantedBy=timers.target
```

### 3. `deploy/push-install.sh` 생성

root 권한(또는 sudo)으로 한 번 실행하는 멱등 스크립트. 수행 단계:

1. `node` 절대 경로 확인(`which node` 또는 nvm shim).
2. 저장소 체크아웃 절대 경로 확인(`deploy.sh` 의 `REPO` 변수 `~/apps/bigsix` 와 동일).
3. `bigsix-push@.service` 의 플레이스홀더를 실제 경로로 치환해 `/etc/systemd/system/bigsix-push@.service` 에 복사.
4. `bigsix-push@.timer` 를 `/etc/systemd/system/bigsix-push@.timer` 에 복사.
5. `systemctl daemon-reload`.
6. `systemctl enable --now bigsix-push@prod.timer`.
7. 완료 메시지 출력.

다시 실행해도 같은 결과가 나오도록 멱등으로 작성한다. 스크립트에 실행 권한(`chmod +x`)을 부여한다.

### 4. `deploy/deploy.sh` 수정

기존 배포 후 검증 블록 뒤에 다음을 추가한다.

```sh
DEPLOY_MODE="${DEPLOY_MODE:-prod}"
echo "bigsix-push@${DEPLOY_MODE}.timer 활성 여부 확인..."
systemctl is-active "bigsix-push@${DEPLOY_MODE}.timer" \
  || echo "경고: bigsix-push@${DEPLOY_MODE}.timer 가 활성 상태가 아닙니다"
```

`DEPLOY_MODE` 환경변수: 기본값 `prod`. dev 릴레이를 쓰는 dev 빌드 배포 시 `DEPLOY_MODE=dev deploy/deploy.sh` 로 호출한다. 타이머 유닛이 없으면 경고만 출력하고 실패 처리하지 않는다.

### 5. `vite.config.ts` — dev 릴레이 빌드 지원

Vite 의 `--mode` 옵션을 이용한다.

- `pnpm build` (기본) → `.env.production` → `PUBLIC_PUSH_RELAY_URL` = prod 릴레이 URL
- `pnpm build --mode dev` → `.env.development` 가 아닌 `--mode dev` 전용 env 파일을 원하는 경우, `.env.dev` 를 새로 추가해 dev 릴레이 URL 을 지정한다. 기존 `.env.development` 를 그대로 써도 동작하면 별도 파일 불필요.

구현자가 Vite mode 와 env 파일 해석 규칙을 확인 후 가장 단순한 방식을 선택한다. 선택 결과는 `deploy/README.md` 에 한 줄 기록한다.

### 6. `deploy/README.md` 수정

- 서버 런타임 관련 첫 문장을 「정적 파일뿐이라 서버 런타임은 없다」에서 「정적 앱 + 1분 cron 하나(`cron/push.ts`).」로 변경한다.
- 「키 교체 절차」 절을 추가한다(FR-36.3a):

  ```
  1. 관리 UI 앱 상세의 「새 키 발급」 을 누른다.
  2. 키 표에서 새 키의 「마지막 사용」 시각이 갱신되고
     이전 키의 시각이 멈추는 것을 확인한다.
  3. 이전 키를 폐기한다.
  bigsix-push@prod.timer 는 매 실행마다 키 파일을 새로 읽으므로
  다음 실행(1분 안)부터 새 키가 쓰인다. 재배포 불필요.
  ```

## 완료 체크리스트

### 운영자 선행 확인 (P-1~P-3)

- [ ] P-1: push-relay 서비스가 홈서버에서 실행 중이다 (`systemctl is-active push-relay`)
- [ ] P-2: `bigsix.env` 키 파일이 `~/apps/push-relay/{instance}/data/keys/bigsix.env` 에 있고 600 권한이다
- [x] P-3: `pnpm build`(또는 `pnpm build --mode dev`)가 오류 없이 완료된다 — 검증됨

### 구현 항목

- [x] `deploy/systemd/bigsix-push@.service` 생성 — `__HOME__`/`__NODE__` 플레이스홀더, `push-install.sh` 가 치환
- [x] `deploy/systemd/bigsix-push@.timer` 생성 — 매 분, `Persistent=false`
- [x] `deploy/push-install.sh` 생성 (`chmod +x`) — 멱등·root 전용·`getent` 홈 탐색·Node 24 nvm 탐색
- [x] `deploy/deploy.sh` 에 `DEPLOY_MODE` 기반 타이머 활성 검증 추가 — 타이머 부재 시 WARNING 만, 실패 처리 없음.
      타이머 「설치 안 됨」과 「설치됐으나 꺼짐」 구분: `systemctl cat` 으로 유닛 존재 여부를 먼저 확인 후 `is-active` 호출 (실배포에서 발견한 결함 수정).
- [x] `deploy/remote.sh` 빌드 명령 수정 — `pnpm run build -- --mode …` → `pnpm run build --mode …`.
      pnpm 10.33.4 에서 `--` 가 리터럴로 전달돼 vite 가 production 모드로 빌드되는 결함을 실배포에서 발견. 재발 방지로 빌드 직후 `build/sw.js` 에 `DEPLOY_MODE` 에 맞는 relay URL 이 들어 있는지 확인하는 안전망 추가 — 어긋나면 rsync 이전에 `exit 1`.
- [x] `deploy/README.md` 수정 — 런타임 설명, 키 교체 절차, dev 빌드 방법 한 줄
- [x] NFR-32 테스트 통과 (PHASE_7_TEST.md 참조) — `tests/unit/security/no-key.test.ts` 통과
- [x] `pnpm test` 통과 — 907 tests, 51 files
- [ ] 수동 end-to-end (dev): 켜기 → 가까운 시각 → cron 수동 실행(`--instance dev`) → 기기에 알림 확인 → 탭 시 `/` 열림
- [ ] IR-3 · IR-6 실기기 결론으로 갱신

## 참고

- `%h` 는 system 유닛에서 `User=` 설정과 무관하게 `/root` 로 풀린다 — `EnvironmentFile` 에 쓸 수 없다.
  `deploy/push-install.sh` 가 `getent passwd` 로 사용자 홈의 절대 경로를 뽑아 유닛 파일에 직접 박는다.
  `%i` 는 인스턴스 이름(`prod`/`dev`) — 이 지시자는 템플릿 유닛에서 정상 동작한다.
- `User=ulismoon` 이 릴레이와 같은 사용자 → 600 권한 키 파일 읽기 가능.
- dev 타이머(`bigsix-push@dev.timer`)는 개발 기간에만 수동으로 활성화한다.
- `--experimental-strip-types`: Node 24.15 에서 확인 — 플래그 유무 모두 경고 없이 `.ts` 를 실행한다.
  플래그는 Node 23.6+ 부터 불필요하지만 현재 경고를 내지 않으므로 유닛에 유지한다. 향후 경고가
  발생하면 플래그를 제거해도 Node 24.x 에서 동작한다.
- IR-6 (icon): `buildMessage` 가 이미 절대 URL 을 사용한다. Phase 7 실기기에서 아이콘이 표시되는지 확인하고 IR-6 에 기록한다.

## 페이즈 종료 전 IR 로그 갱신

이 페이즈에서 쓰는 `integration.md` 절: **§1 등록·API 키** (키 파일 경로, 키 교체 절차). 실기기 end-to-end 결과와 아이콘 확인 결과(IR-6)를 SPEC IR 로그에 기록한다.

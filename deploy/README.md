# 홈서버 배포

`https://bigsix.siot-ieung.duckdns.org` 로 서빙한다. 정적 파일뿐이라 서버 런타임은 없다.

## 이번 작업(0.2.0 UI 개발)의 임시 배포

0.2.0 은 아직 릴리스가 아니다. `feature/ui` 브랜치를 서버에 올려 확인한다.
`release.sh` 는 **부르지 않는다** — 태그도 버전 커밋도 만들지 않는다.

```bash
git push origin feature/ui
./deploy/deploy.sh feature/ui
```

`deploy.sh` 는 임의의 ref 를 받으므로 브랜치를 그대로 올릴 수 있고, 배포 후 검증
(커밋 SHA 대조 · 기본 경로 200 · 프리캐시 전수 대조)은 릴리스와 똑같이 돈다.
PR 이 병합되고 릴리스할 준비가 되면 그때 `./deploy/release.sh 0.2.0` 을 쓴다.

## 평소

**실제 앱에 반영하는 것은 릴리스 하나뿐이다.** 개발 중 확인은 로컬 서버에서 한다.

```bash
pnpm dev            # 개발 중 (http://localhost:5173)
pnpm preview        # PWA·오프라인 확인 (http://localhost:4173)
```

폰에 깔린 앱을 갱신하려면 버전을 올린다. 검사 → 버전 → 태그 → push → 배포 →
검증이 한 줄로 이어진다.

```bash
./deploy/release.sh 0.2.0
```

`CHANGELOG.md` 에 해당 버전 항목이 없거나, main 이 아니거나, 워킹트리가
지저분하거나, 테스트가 깨지면 아무것도 하지 않고 멈춘다. **태그와
`package.json` 버전을 같이 올리는 것도 이 스크립트의 일이다** — 앱은
`package.json` 을 정본으로 버전을 표시하므로 태그만 올리면 화면에는 옛
버전이 뜬다.

### 구성 파일

| | |
|---|---|
| `deploy.sh` | 로컬에서 도는 부분. ssh 연결 확인, 원격 실행, 배포 후 검증 |
| `remote.sh` | 서버에서 도는 부분. deploy.sh 가 ssh 로 흘려보낸다 |
| `lib.sh` | 공유 함수 (`resolve_commit`) |
| `release.sh` | 버전·태그·push·배포를 묶은 릴리스 |

`remote.sh` 를 파일로 뺀 이유는 테스트다. heredoc 안에 있으면 검증할 수 없다.
`REF=... REPO=... bash deploy/remote.sh sync` 로 git 동기화만 돌릴 수 있고,
`tests/deploy/` 가 가짜 저장소에 이 모드를 먹여 동작을 확인한다 — 홈서버도
ssh 도 필요 없다.

```bash
bash tests/deploy/run.sh
```

여기서 잡는 것은 실제로 릴리스를 망가뜨렸던 두 가지다.

- **옮겨간 태그를 따라가는가.** `git fetch --tags` 는 이미 있는 태그를 갱신하지
  않으면서 종료 코드 0 을 준다. 롤백으로 태그를 지웠다 다시 만들면 서버가 옛
  커밋을 배포하고도 성공한 척한다. v0.2.0 에서 실제로 겪었다
- **annotated 태그에서 커밋을 뽑는가.** 태그 객체 SHA 를 쓰면 올바르게 배포하고도
  대조에서 어긋난 것으로 판정되어 이후 검증이 통째로 건너뛰어진다. v0.1.0 에서 겪었다

### 왜 GitHub Actions 가 아닌가

**배포에 한해서** 그렇다. 홈서버는 tailnet 안에 있고 공유기에 열어둔 포트가 없어
GitHub 러너가 닿지 못한다. 서버에 self-hosted 러너를 두면 되고(아웃바운드로 붙으므로 NAT 뒤에서도
돈다) 그건 진짜 "태그 push 하면 배포" 가 되지만, 그러면 배포 검증 결과를 GitHub
로그로 보러 가야 한다. `deploy.sh` 의 값어치는 프리캐시 전수 대조를 배포한 사람이
그 자리에서 보는 것이라, 그 피드백을 잃으면서까지 옮길 이유가 없다.

**검사와 감시는 GitHub 에서 한다.** 코드 검사(`.github/workflows/ci.yml`)와
배포된 사이트 점검(`site-check.yml`)은 서버 접근이 필요 없다. 특히 사이트 점검은
인증서 만료처럼 커밋과 무관하게 조용히 썩는 것을 잡으라고 둔 것이다 — 여기
아래 적힌 6개월 만료가 그 사례다.

### 임의의 ref 를 올릴 때

릴리스가 아니라 특정 커밋을 서버에 띄워보고 싶을 때 쓴다.

```bash
git push                    # 서버가 origin 에서 받아가므로 push 가 먼저다
./deploy/deploy.sh          # 현재 브랜치
./deploy/deploy.sh main     # 특정 ref
./deploy/deploy.sh v0.1.0   # 태그
```

**어디서든 배포된다.** 접속은 Tailscale tailnet 을 타므로 집 안팎이 같다 — 집에서는
LAN 다이렉트 경로를 잡고(수 ms), 밖에서는 터널로 간다. 아래 "외부에서 배포하기" 참고.

서버가 `git fetch` → `pnpm install --frozen-lockfile` → `pnpm build` 를 하고, 산출물을
docroot 로 옮긴다. 배포가 끝나면 스크립트가 스스로 확인한다.

- 서버가 체크아웃한 커밋이 배포하려던 커밋과 같은가
- `/`, `/manifest.webmanifest`, `/sw.js` 가 200 인가
- **서비스워커의 프리캐시 목록에 적힌 파일이 전부 실제로 서빙되는가**

마지막 항목이 핵심이다. 하나라도 404 면 워크박스가 설치를 통째로 롤백해서
(`bad-precaching-response`) 오프라인 동작이 죽는다. 화면은 멀쩡해 보이므로 눈으로는 못 잡는다.

## 폰에서 설치

Chrome/Safari 로 위 주소를 열고 "홈 화면에 추가". 업데이트는 자동이다 —
`registerType: 'autoUpdate'` 라 새 서비스워커가 `skipWaiting` + `clientsClaim` 으로
즉시 활성화된다. 배포 후 앱을 한 번 껐다 켜면 반영된다.

## 구성

| | |
|---|---|
| 호스트 | `ssh homeserver` → `ulismoon-ubuntu-server.tailafb1ca.ts.net` (Ubuntu 24.04) |
| 리포 | `~/apps/bigsix` — 서버가 직접 클론 |
| docroot | `/var/www/bigsix` — `ulismoon` 소유라 배포에 root 불필요 |
| vhost | `/etc/nginx/sites-available/bigsix.conf` (리포의 `deploy/nginx/bigsix.conf`) |
| 인증서 | `/etc/nginx/ssl/bigsix/` — acme.sh 가 DuckDNS DNS-01 로 발급 |
| Node | nvm 24 (`~/.nvm`), pnpm 은 corepack |
| 접속 | Tailscale (tailnet `tailafb1ca.ts.net`). 서버 `100.98.237.31` |

DuckDNS 는 `*.siot-ieung.duckdns.org` 를 전부 같은 IP 로 응답하므로 서브도메인에
별도 DNS 설정이 필요 없다. 라우터 헤어핀 NAT 가 되므로 집 안에서도 도메인으로 붙는다.

## 외부에서 배포하기

Tailscale 로 붙는다. **공유기에는 아무 포트도 열지 않았고, 열 필요도 없다** — 양쪽이
아웃바운드로 코디네이션 서버에 붙어 WireGuard 터널을 만든다. 공인 IP 에 22 번을
노출하는 것과 달리 외부 노출면이 0 이다.

`~/.ssh/config` 의 `homeserver` 가 MagicDNS 이름을 가리키므로 집/밖에서 명령이 같다.

```
Host homeserver 172.30.1.54 ulismoon-ubuntu-server
	HostName ulismoon-ubuntu-server.tailafb1ca.ts.net
	User ulismoon
	IdentitiesOnly yes
	IdentityFile ~/.ssh/id_ed25519
```

집에서도 이 이름을 쓴다. Tailscale 이 같은 LAN 을 감지하면 릴레이를 거치지 않고
직접 붙으므로 손해가 없다. 경로는 이걸로 확인한다.

```bash
tailscale ping ulismoon-ubuntu-server
# pong ... via 172.30.1.54:41641 in 3ms   ← 집: LAN 다이렉트
# pong ... via 222.101.38.84:41641 in 49ms ← 밖: 홀펀칭 성립, 공인 IP 로 직접
# pong ... via DERP(tok) in 95ms           ← 릴레이 경유
```

**붙은 직후에는 DERP 로 나오는 게 정상이다.** 홀펀칭 협상에 몇 초에서 십수 초가
걸리고, 성립하면 조용히 직접 경로로 승격된다. 릴레이 상태에서도 배포는 된다 —
느릴 뿐이다. 한 번 찍어보고 DERP 라고 실패로 판단하지 말 것.

2026-08-08 에 폰 핫스팟(통신사 CGNAT)에서 실측했다. 홀펀칭이 성립했고
`deploy.sh` 전 구간이 20.5 초에 끝났다. 집에서 돌릴 때와 차이가 없다.

새 기기를 물릴 때는 그 기기에서 `sudo tailscale up` 한 번이면 된다. 데몬이 root 로
돌기 때문에 `up`/`down`/`set` 만 권한이 필요하고, 평소 ssh 는 권한이 필요 없다.
sudo 없이 조작하려면 기기마다 한 번 `sudo tailscale set --operator=$USER`.

### 머신 키 만료

**Tailscale 머신 키는 기본 180 일이면 만료되고, 만료되면 그 기기가 tailnet 에서
조용히 빠진다.** 무인 서버에서는 반 년 뒤 "갑자기 배포가 안 됨" 으로 나타난다.
아래 인증서 만료 건과 같은 부류의 함정이다 — 자동으로 도는 것이 조용히 죽는다.

admin 콘솔(`login.tailscale.com/admin/machines`) → 해당 머신 `⋯` → **Disable key expiry**.
서버는 반드시 꺼둔다. 현재 상태는 이렇게 본다.

`grep KeyExpiry` 로는 안 된다 — 피어(노트북) 것까지 잡혀서 서버가 정상인데도 만료가
있는 것처럼 보인다. 자기 자신만 봐야 한다.

```bash
ssh homeserver 'tailscale status --json' | python3 -c '
import json,sys; print(json.load(sys.stdin)["Self"].get("KeyExpiry","만료 없음"))'
```

노트북 쪽은 만료돼도 상관없다. 브라우저로 재로그인하면 되는 대화형 기기다.
무인으로 도는 서버만 꺼두면 된다.

## 캐시 정책

`deploy/nginx/bigsix.conf` 가 정하는 것이고, 틀리면 업데이트가 안 잡힌다.

| 경로 | 정책 | 이유 |
|---|---|---|
| `/_app/immutable/` | 1년 + `immutable` | 파일명에 해시가 있다. 내용이 바뀌면 이름이 바뀐다 |
| `/sw.js` | `no-store` | 여기가 캐시되면 새 배포를 영영 못 잡는다 |
| 그 외 (HTML) | `no-cache` | 프리캐시 매니페스트가 들어 있어 매번 재검증해야 한다 |

## 최초 1회 설정 (root 필요)

**2026-09-04 에 완료했다.** 서버를 갈아엎을 때만 다시 한다.

> **vhost 파일을 heredoc 으로 `ssh -t` 에 흘려보내지 말 것.**
> TTY 라인 디시플린이 문자를 먹어 파일이 조각난다. 실제로 겪었고, 증상은
> `invalid number of arguments in "ssl_certificate_key" directive` 였다 —
> 파일 중간이 잘려 있었다. `nginx -t` 가 잡아주긴 하지만 원인이 안 보인다.
> **`scp` 로 올린 뒤 `sudo install` 로 제자리에 놓는다.**
>
> ```bash
> scp deploy/nginx/bigsix.conf homeserver:/tmp/bigsix.conf
> ssh -t homeserver 'sudo install -o root -g root -m 644 \
>   /tmp/bigsix.conf /etc/nginx/sites-available/bigsix.conf'
> ```

```bash
sudo install -d -o ulismoon -g ulismoon -m 755 /var/www/bigsix
sudo install -d -o ulismoon -g ulismoon -m 700 /etc/nginx/ssl/bigsix

# acme.sh 가 cron 에서 nginx 를 reload 할 수 있게 한다. reload 하나만 연다.
echo "ulismoon ALL=(root) NOPASSWD: /usr/bin/systemctl reload nginx" \
  | sudo tee /etc/sudoers.d/acme-nginx-reload
sudo chmod 440 /etc/sudoers.d/acme-nginx-reload

sudo cp deploy/nginx/bigsix.conf /etc/nginx/sites-available/bigsix.conf
sudo chown ulismoon:ulismoon /etc/nginx/sites-available/bigsix.conf
sudo ln -sf /etc/nginx/sites-available/bigsix.conf /etc/nginx/sites-enabled/bigsix.conf
sudo nginx -t && sudo systemctl reload nginx
```

인증서 발급과 설치:

```bash
~/.acme.sh/acme.sh --issue --dns dns_duckdns -d bigsix.siot-ieung.duckdns.org \
  --dnssleep 60 --server letsencrypt
~/.acme.sh/acme.sh --install-cert -d bigsix.siot-ieung.duckdns.org --ecc \
  --fullchain-file /etc/nginx/ssl/bigsix/fullchain.pem \
  --key-file      /etc/nginx/ssl/bigsix/key.pem \
  --reloadcmd     "sudo systemctl reload nginx"
```

## 인증서가 만료됐을 때

**같은 서버의 cube-study 가 2026-02 ~ 2026-08 에 실제로 이 상태였다.**
bigsix 도 같은 acme.sh · 같은 sudoers · 같은 cron 위에 얹혀 있으므로 그대로 해당된다.
증상은 **acme.sh 는 정상 갱신하고 있는데 nginx 로 복사하는 단계가 조용히 실패**하는 것이다.

- `Le_RealFullChainPath` 가 가리키는 `/etc/nginx/ssl/...` 가 root 소유라 쓰지 못함
- `Le_ReloadCmd` 가 `sudo systemctl reload nginx` 인데 cron 에는 TTY 가 없어 비밀번호를 못 받음
- cron 출력이 `/dev/null` 이라 아무도 모름

증상은 "브라우저에 만료 경고 + PWA 설치 불가" 인데, acme.sh 저장소의 인증서는 멀쩡하다.
그래서 `acme.sh --list` 만 보면 정상으로 보인다. 실제로 서빙되는 것을 봐야 한다.

```bash
# 실제 서빙되는 인증서 (이게 정본)
openssl s_client -connect 172.30.1.54:443 -servername bigsix.siot-ieung.duckdns.org \
  </dev/null 2>/dev/null | openssl x509 -noout -dates

# acme.sh 가 들고 있는 것
~/.acme.sh/acme.sh --list
```

둘이 다르면 `--install-cert` 를 다시 돌린다. 위 sudoers 와 디렉터리 소유권이
제자리에 있으면 cron 이 알아서 한다.

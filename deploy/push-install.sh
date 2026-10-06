#!/usr/bin/env bash
#
# bigsix 푸시 유닛을 /etc/systemd/system 에 설치한다 (최초 1회, root).
#
#   sudo ./deploy/push-install.sh                    # prod 타이머만 활성화
#   sudo ./deploy/push-install.sh prod dev           # 둘 다 활성화
#
# 멱등 — 여러 번 돌려도 결과가 같다. 유닛 내용이 바뀌지 않았으면 enable/start 만 다시 거친다.
#
# 왜 유닛 템플릿에 플레이스홀더가 있는가:
#   - `__HOME__`: `User=` 가 있는 system 유닛에서 `%h` 는 서비스 매니저의 홈(`/root`)으로
#     풀린다 (man systemd.unit, specifiers 표의 「not influenced by the User= setting」).
#     그래서 사용자 홈은 설치 시점에 절대 경로로 박는다.
#   - `__NODE__`: 서버 Node 는 nvm 아래 깔려 있어 PATH 에 없다. nvm shim 이 아니라
#     실제 바이너리의 절대 경로를 넣어야 systemd 가 바로 띄울 수 있다.
#
# 키 파일(`~/apps/push-relay/<env>/data/keys/bigsix.env`)은 릴레이가 소유한다.
# 이 스크립트는 **키 내용을 읽거나 출력하지 않는다**.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
	echo "root 권한이 필요하다. sudo 로 다시 돌릴 것." >&2
	exit 1
fi

# 유닛을 소유할 사용자. 릴레이 유닛과 같아야 한다 (push-relay@.service 의 User=ulismoon).
TARGET_USER="${BIGSIX_PUSH_USER:-ulismoon}"

if ! id "$TARGET_USER" >/dev/null 2>&1; then
	echo "사용자 '$TARGET_USER' 가 없다. BIGSIX_PUSH_USER 로 다른 사용자를 지정하거나 먼저 만들 것." >&2
	exit 1
fi

# `getent passwd` 로 홈을 뽑는다. `~user` 쉘 전개보다 안전하다 (NSS 를 거친다).
TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
if [ -z "$TARGET_HOME" ] || [ ! -d "$TARGET_HOME" ]; then
	echo "사용자 '$TARGET_USER' 의 홈 디렉터리를 찾지 못했다 ($TARGET_HOME)." >&2
	exit 1
fi

# nvm 아래 Node 24.x 절대 경로. 여러 패치 버전이 깔려 있으면 가장 큰 걸 고른다.
# glob + `sort -V` 로 숫자 정렬한다 (ls | grep 은 shellcheck SC2010).
NODE_BIN=""
NVM_NODES_DIR="$TARGET_HOME/.nvm/versions/node"
if [ -d "$NVM_NODES_DIR" ]; then
	LATEST_V24=""
	for d in "$NVM_NODES_DIR"/v24.*/; do
		[ -d "$d" ] || continue
		base="${d%/}"
		base="${base##*/}"
		if [ -z "$LATEST_V24" ] || [ "$(printf '%s\n%s\n' "$LATEST_V24" "$base" | sort -V | tail -n1)" = "$base" ]; then
			LATEST_V24="$base"
		fi
	done
	if [ -n "$LATEST_V24" ] && [ -x "$NVM_NODES_DIR/$LATEST_V24/bin/node" ]; then
		NODE_BIN="$NVM_NODES_DIR/$LATEST_V24/bin/node"
	fi
fi
if [ -z "$NODE_BIN" ]; then
	echo "Node 24.x 를 찾지 못했다. $NVM_NODES_DIR 아래에 nvm 으로 Node 24 를 깔고 다시 돌릴 것." >&2
	exit 1
fi
echo "==> Node: $NODE_BIN"
echo "==> 사용자 홈: $TARGET_HOME"

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC_SERVICE="$HERE/systemd/bigsix-push@.service"
SRC_TIMER="$HERE/systemd/bigsix-push@.timer"
DST_SERVICE="/etc/systemd/system/bigsix-push@.service"
DST_TIMER="/etc/systemd/system/bigsix-push@.timer"

if [ ! -f "$SRC_SERVICE" ] || [ ! -f "$SRC_TIMER" ]; then
	echo "유닛 템플릿을 찾지 못했다: $SRC_SERVICE / $SRC_TIMER" >&2
	exit 1
fi

# 플레이스홀더 치환. sed 구분자로 `|` 를 써 경로의 `/` 와 안 부딪히게 한다.
install_unit() {
	local src="$1" dst="$2"
	local tmp
	tmp="$(mktemp)"
	# shellcheck disable=SC2064  # 지금 보이는 $tmp 값으로 trap 을 설정하는 게 목적
	trap "rm -f '$tmp'" RETURN
	sed -e "s|__NODE__|$NODE_BIN|g" -e "s|__HOME__|$TARGET_HOME|g" "$src" > "$tmp"

	# 이미 같은 내용이면 건드리지 않는다. 멱등.
	if [ -f "$dst" ] && cmp -s "$tmp" "$dst"; then
		echo "==> $dst (변경 없음)"
	else
		install -o root -g root -m 644 "$tmp" "$dst"
		echo "==> $dst (갱신)"
	fi
}

install_unit "$SRC_SERVICE" "$DST_SERVICE"
install_unit "$SRC_TIMER" "$DST_TIMER"

echo "==> daemon-reload"
systemctl daemon-reload

# 활성화할 인스턴스. 인자가 없으면 prod 만.
if [ "$#" -eq 0 ]; then
	INSTANCES=("prod")
else
	INSTANCES=("$@")
fi

for inst in "${INSTANCES[@]}"; do
	case "$inst" in
		prod|dev) ;;
		*)
			echo "알 수 없는 인스턴스: '$inst' (prod | dev)." >&2
			exit 1
			;;
	esac
	key_file="$TARGET_HOME/apps/push-relay/$inst/data/keys/bigsix.env"
	if [ ! -f "$key_file" ]; then
		echo "경고: $key_file 가 없다. 릴레이에서 bigsix 를 등록해 키 파일을 만든 뒤 타이머가 실제 발송을 시작한다."
	fi
	echo "==> bigsix-push@$inst.timer 활성화"
	systemctl enable --now "bigsix-push@$inst.timer"
done

echo "==> 완료. 타이머 상태:"
for inst in "${INSTANCES[@]}"; do
	systemctl --no-pager --quiet is-active "bigsix-push@$inst.timer" \
		&& echo "    bigsix-push@$inst.timer: active" \
		|| echo "    bigsix-push@$inst.timer: 비활성"
done

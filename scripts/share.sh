#!/usr/bin/env bash
# 개발 서버(화면 5173, 게임 서버 2567)를 켜고 Tailscale 망 안의 기기(맥, 태블릿)에 내어 주고 거둔다.
# 사용: pnpm share(켜기) | pnpm share:off(끄기) | pnpm share:status(상태)
# Tailscale 망 밖(학교 와이파이, 인터넷)에는 보이지 않는다. 게임 서버는 화면(Vite)이 /colyseus로 넘겨 주므로 따로 내어 주지 않는다.
set -euo pipefail
cd "$(dirname "$0")/.."

TS="/mnt/c/Program Files/Tailscale/tailscale.exe"
# 윈도우의 80번 포트는 IIS가 쓰고 있어 8080으로 내어 준다.
SHARE_PORT=8080
WEB_PORT=5173
RUN_DIR=.run

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
our_pid() { [[ -f $1 ]] && kill -0 "$(cat "$1")" 2>/dev/null && cat "$1"; }
serve_on() { "$TS" serve status 2>/dev/null | grep -q "127.0.0.1:$WEB_PORT"; }
share_url() {
  "$TS" status --json | python3 -c 'import json,sys; print("http://" + json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' | sed "s/\$/:$SHARE_PORT/"
}

# start <이름> <포트> <기록 이름> <명령...>
start() {
  local name=$1 port=$2 id=$3
  shift 3
  if port_open "$port"; then
    echo "$name가 이미 켜져 있습니다(포트 $port)."
    return
  fi
  mkdir -p "$RUN_DIR"
  setsid "$@" >"$RUN_DIR/$id.log" 2>&1 </dev/null &
  echo $! >"$RUN_DIR/$id.pid"
  for _ in $(seq 60); do
    port_open "$port" && break
    sleep 0.25
  done
  if ! port_open "$port"; then
    echo "$name가 켜지지 않았습니다. $RUN_DIR/$id.log 를 확인합니다." >&2
    exit 1
  fi
  echo "$name를 켰습니다(포트 $port)."
}

# stop <이름> <포트> <기록 이름>
stop() {
  local name=$1 port=$2 id=$3 pid
  if pid=$(our_pid "$RUN_DIR/$id.pid"); then
    kill -- "-$pid" 2>/dev/null || kill "$pid"
    rm -f "$RUN_DIR/$id.pid"
    echo "$name를 껐습니다."
  elif port_open "$port"; then
    echo "포트 $port 의 $name는 이 스크립트가 켠 것이 아니라 그대로 두었습니다."
  else
    rm -f "$RUN_DIR/$id.pid"
    echo "$name는 이미 꺼져 있습니다."
  fi
}

case "${1:-status}" in
  on)
    start "게임 서버" 2567 game-server node --watch --env-file-if-exists=.env server/main.ts
    start "화면 서버" "$WEB_PORT" dev-server ./node_modules/.bin/vite
    if grep -q "DF_TEACHER_PASSWORD" "$RUN_DIR/game-server.log" 2>/dev/null; then
      echo "주의: .env에 선생님 비밀번호(DF_TEACHER_PASSWORD)가 없어 방을 만들 수 없습니다."
    fi
    # HTTP로 내어 준다(HTTPS는 Tailscale 계정에서 인증서를 허용해야 해서 쓰지 않는다).
    # Tailscale 망 안의 연결은 Tailscale이 암호화한다. 멈추는 경우에 대비해 시간을 제한한다.
    if ! out=$(timeout 20 "$TS" serve --bg --http="$SHARE_PORT" "$WEB_PORT" 2>&1); then
      echo "공유를 켜지 못했습니다. Tailscale의 안내는 다음과 같습니다." >&2
      echo "$out" >&2
      exit 1
    fi
    echo "공유를 켰습니다. 맥·태블릿 주소: $(share_url)"
    ;;
  off)
    if serve_on; then
      "$TS" serve --http="$SHARE_PORT" off >/dev/null
      echo "공유를 껐습니다."
    else
      echo "공유는 이미 꺼져 있습니다."
    fi
    stop "화면 서버" "$WEB_PORT" dev-server
    stop "게임 서버" 2567 game-server
    ;;
  status)
    if port_open "$WEB_PORT"; then echo "화면 서버: 켜짐(포트 $WEB_PORT)"; else echo "화면 서버: 꺼짐"; fi
    if port_open 2567; then echo "게임 서버: 켜짐(포트 2567)"; else echo "게임 서버: 꺼짐"; fi
    if serve_on; then echo "공유: 켜짐 $(share_url)"; else echo "공유: 꺼짐"; fi
    ;;
  *)
    echo "사용: $0 on|off|status" >&2
    exit 2
    ;;
esac

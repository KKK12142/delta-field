#!/usr/bin/env bash
# 개발 서버를 Tailscale 망 안의 기기(맥, 태블릿)에 내어 주고 거둔다.
# 사용: pnpm share(켜기) | pnpm share:off(끄기) | pnpm share:status(상태)
# Tailscale 망 밖(학교 와이파이, 인터넷)에는 보이지 않는다.
set -euo pipefail
cd "$(dirname "$0")/.."

TS="/mnt/c/Program Files/Tailscale/tailscale.exe"
PORT=5173
RUN_DIR=.run
PID_FILE="$RUN_DIR/dev-server.pid"
LOG_FILE="$RUN_DIR/dev-server.log"

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; }
our_pid() { [[ -f $PID_FILE ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null && cat "$PID_FILE"; }
serve_on() { "$TS" serve status 2>/dev/null | grep -q "127.0.0.1:$PORT"; }
share_url() {
  "$TS" status --json | python3 -c 'import json,sys; print("https://" + json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))'
}

start_dev() {
  if port_open; then
    echo "개발 서버가 이미 켜져 있습니다(포트 $PORT)."
    return
  fi
  mkdir -p "$RUN_DIR"
  setsid ./node_modules/.bin/vite >"$LOG_FILE" 2>&1 </dev/null &
  echo $! >"$PID_FILE"
  for _ in $(seq 40); do
    port_open && break
    sleep 0.25
  done
  if ! port_open; then
    echo "개발 서버가 켜지지 않았습니다. $LOG_FILE 을 확인합니다." >&2
    exit 1
  fi
  echo "개발 서버를 켰습니다(포트 $PORT)."
}

stop_dev() {
  local pid
  if pid=$(our_pid); then
    kill -- "-$pid" 2>/dev/null || kill "$pid"
    rm -f "$PID_FILE"
    echo "개발 서버를 껐습니다."
  elif port_open; then
    echo "포트 $PORT 의 개발 서버는 이 스크립트가 켠 것이 아니라 그대로 두었습니다."
  else
    rm -f "$PID_FILE"
    echo "개발 서버는 이미 꺼져 있습니다."
  fi
}

case "${1:-status}" in
  on)
    start_dev
    # Tailscale에서 serve가 허용되지 않았으면 허용 링크를 띄우고 기다리므로 시간을 제한한다.
    if ! out=$(timeout 20 "$TS" serve --bg "$PORT" 2>&1); then
      echo "공유를 켜지 못했습니다. Tailscale의 안내는 다음과 같습니다." >&2
      echo "$out" >&2
      exit 1
    fi
    echo "공유를 켰습니다. 맥·태블릿 주소: $(share_url)"
    ;;
  off)
    if serve_on; then
      "$TS" serve --https=443 off >/dev/null
      echo "공유를 껐습니다."
    else
      echo "공유는 이미 꺼져 있습니다."
    fi
    stop_dev
    ;;
  status)
    if port_open; then echo "개발 서버: 켜짐(포트 $PORT)"; else echo "개발 서버: 꺼짐"; fi
    if serve_on; then echo "공유: 켜짐 $(share_url)"; else echo "공유: 꺼짐"; fi
    ;;
  *)
    echo "사용: $0 on|off|status" >&2
    exit 2
    ;;
esac

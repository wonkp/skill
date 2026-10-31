#!/usr/bin/env bash
# 检查 Arthas 运行状态与 MCP 就绪情况
# 用法: arthas-status.sh [MCP_URL] [端口列表]
#   默认 MCP_URL = http://127.0.0.1:8563/mcp，端口列表 = 3658,8563
# 退出码: 0 = MCP 就绪；1 = 端口未监听；2 = 端口占用但 MCP 未就绪

set -u

MCP_URL="${1:-http://127.0.0.1:8563/mcp}"
PORTS="${2:-3658,8563}"

port_state() {
    local port="$1"
    local line
    line=$(netstat -ano 2>/dev/null | grep -E "[[:space:]]127\.0\.0\.1:${port}[[:space:]].*LISTENING" | head -n 1)
    if [ -z "$line" ]; then
        echo "DOWN"
    else
        echo "UP $(echo "$line" | awk '{print $NF}')"
    fi
}

echo "== 端口状态 =="
any_up=0
IFS=',' read -r -a port_arr <<< "$PORTS"
for p in "${port_arr[@]}"; do
    st=$(port_state "$p")
    echo "  ${p}: ${st}"
    [ "${st%% *}" = "UP" ] && any_up=1
done

if [ "$any_up" -eq 0 ]; then
    echo "== MCP: 未启动（无监听端口）=="
    exit 1
fi

echo "== MCP 探活 =="
tmp_hdr=$(mktemp)
trap 'rm -f "$tmp_hdr"' EXIT

curl -s --max-time 5 -D "$tmp_hdr" -o /dev/null \
    -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"arthas-skill","version":"1"}}}'

sid=$(tr -d '\r' < "$tmp_hdr" | grep -i '^mcp-session-id:' | head -n 1 | sed 's/^[^:]*:[[:space:]]*//')

if [ -z "$sid" ]; then
    echo "== MCP: 端口在监听，但 initialize 未返回 session（可能不是 Arthas MCP，或版本不匹配）=="
    exit 2
fi

tools=$(curl -s --max-time 5 -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: $sid" \
    -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
    | grep -o '"name":"[a-zA-Z0-9_-]*"' | sort -u | grep -v '^"name":"arthas' | wc -l)

echo "== MCP: 就绪 (session=$sid, tools=$tools) =="
echo "   URL: $MCP_URL"
exit 0

---
name: arthas
description: 启动并连接 Arthas 诊断当前机器的 Java 进程。Use when the user types /arthas, or wants to attach Arthas to a running JVM（启动 arthas、连上 arthas、看线程/JVM 状态、trace/watch/stack 某个方法、反编译 jad、抓 profiler）via the arthas-mcp MCP server. Reads the arthas home path from the global CLAUDE.md, launches arthas-boot.jar in a new console window, waits for MCP readiness, then diagnoses through MCP tools.
---

# Arthas 启动与诊断

分两段：**先启动**（没有可用的 MCP 端点时），**再用 MCP 诊断**（端点就绪后）。

> 关键事实：Arthas 的 MCP 端点**不是独立服务**，它由被 attach 的那个 Java 进程提供。进程没 attach 上，`localhost:8563` 就不会有人监听，`arthas-mcp` server 必然 `ECONNREFUSED`。所以顺序永远是「先 attach，后连 MCP」。

---

## 一、取 Arthas 地址

**arthas 目录一律从全局 `C:\Users\<用户名>\.claude\CLAUDE.md` 的「本地环境信息」节读取**，当前值为 `C:\IT\Tools\arthas`。

- 不要在本 skill 里硬编码路径；以 `CLAUDE.md` 为准。
- 若 `CLAUDE.md` 里没有 arthas 地址 → 停止，告诉用户去补「本地环境信息」一节，不要自己猜路径。

下文的 `$ARTHAS_HOME` 均指该路径。

---

## 二、判断当前状态（先查，避免重复 attach）

```bash
bash <skill_dir>/scripts/arthas-status.sh
```

输出三种结果，对应三条分支：

| 输出 | 含义 | 下一步 |
|---|---|---|
| `== MCP: 未启动（无监听端口）==`，退出码 1 | 还没有进程被 attach | 走第三节「启动」 |
| `== MCP: 就绪 (session=..., tools=N) ==`，退出码 0 | 已 attach 且 MCP 可用 | 跳过启动，直接走第四节 |
| 端口 UP 但 MCP 未就绪，退出码 2 | 端口被非 Arthas 程序占用，或版本不支持 MCP | 停止并报告，别硬连 |

脚本本质是 `netstat` 查 `3658`/`8563` + `curl` 探 `http://127.0.0.1:8563/mcp` 的 `initialize`。没有 bash 时，可手动跑：

```bash
netstat -ano | grep -E "127\.0\.0\.1:(3658|8563).*LISTENING"
```

---

## 三、启动（新命令窗口）

**必须开新窗口**：`arthas-boot.jar` 是交互式的，会列出当前所有 Java 进程让用户按编号挑选；在本会话的 Bash 里跑会挂住等输入。

```bash
cmd //c start "" cmd //c "\"$ARTHAS_HOME\\launch-arthas.bat\""
```

或用 skill 自带的启动脚本（它做了 `arthas-boot.jar` 存在性校验 + 中文提示 + 退出后 `pause`）：

```bash
cmd //c start "" cmd //c "C:\Users\<用户名>\.cc-switch\skills\arthas\scripts\launch-arthas.bat \"$ARTHAS_HOME\""
```

脚本内容等价于：

```bat
cd /d "%ARTHAS_HOME%"
java -jar arthas-boot.jar
```

**注意 `start` 的参数陷阱**：`start "标题" cmd /c ...` 里第一个引号参数是窗口标题；若把脚本路径直接放在 `start` 后面、又不给标题，`start` 会把它当标题吞掉，窗口闪退。所以固定写成 `start "" cmd //c "..."`。

启动后**把选择权交给用户**：提示用户在弹出窗口里选编号（窗口里会列出 pid + 主类），回车。

然后轮询等 MCP 就绪（attach 通常几秒，慢的进程可能 10~30 秒）：

```bash
for i in $(seq 1 20); do
  bash <skill_dir>/scripts/arthas-status.sh >/dev/null 2>&1 && break
  sleep 2
done
bash <skill_dir>/scripts/arthas-status.sh
```

- 就绪 → 告诉用户「已连上 PID xxx」并进入第四节。
- 60 秒仍不就绪 → 让用户看新窗口里的报错（常见：attach 权限不足、目标进程是 JDK 6/7、`arthas-boot.jar` 版本太老不支持 MCP）。**不要**自己反复重试 attach，也不要杀进程。

> Arthas 版本差异：MCP 支持从 **4.3.x** 起（`arthas.properties` 里要有 `arthas.mcpEndpoint` / `arthas.mcpProtocol`）。若目标 jar 是 3.x，MCP 没有，只能走 telnet 3658。判断方式：
> ```bash
> unzip -p "$ARTHAS_HOME/arthas-core.jar" META-INF/MANIFEST.MF | grep Implementation-Version
> ```

---

## 四、通过 MCP 诊断

MCP server 名为 `arthas-mcp`，端点在 `.claude.json` 里固定为 `http://localhost:8563/mcp`（类型 `http`，STREAMABLE）。工具名形如 `mcp__arthas-mcp__<tool>`，共 32 个：

| 分类 | 工具 |
|---|---|
| JVM 体检 | `dashboard`、`jvm`、`memory`、`thread`、`sysprop`、`sysenv`、`perfcounter`、`vmoption`、`mbean` |
| 类/方法探查 | `sc`、`sm`、`jad`、`classloader`、`dump`、`getstatic`、`ognl`、`vmtool` |
| 运行时监控 | `trace`、`watch`、`stack`、`monitor`、`tt`、`profiler` |
| 热更新 | `mc`、`redefine`、`retransform`、`upload_file`、`viewfile` |
| 生命周期 | `version`、`options`、`heapdump`、`stop` |

**若本会话启动时 `arthas-mcp` 报 `ECONNREFUSED`**：说明 Claude Code 是在 Arthas 起来之前启动的，MCP server 连不上就没进工具列表。此时**不要**声称能力不存在，应告知用户：

1. Arthas 已启动/未启动的实际状态；
2. 需要在会话里执行 `/mcp` 选择 `arthas-mcp` 重连，或重启 Claude Code；
3. 在重连前，可用 `curl` 直接打 MCP 端点兜底（见第五节）。

### 常用调用范式

| 想知道 | 工具 + 关键参数 |
|---|---|
| 整体健康（线程数、CPU、内存、GC） | `dashboard`（`numberOfExecutions: 1`，一次性快照） |
| 最耗 CPU 的线程 | `thread`（`topN: 10`） |
| 指定线程栈 | `thread`（`threadId: <n>`，默认 `all:false`） |
| 死锁/阻塞 | `thread`（`blocking: true`） |
| 堆内存分布 | `memory` |
| 类是否加载、被谁加载 | `sc`（`classPattern`，`detail: true`） |
| 方法签名 | `sm`（`classPattern` + `methodPattern`） |
| 源码 | `jad`（`classPattern`） |
| 某方法谁在调、耗时多少 | `trace`（`classPattern` + `methodPattern`，`timeout` 必给秒数避免挂死） |
| 某方法入参/返回值 | `watch`（加 `express`，如 `{params, returnObj, throwExp}`） |
| 调用堆栈来源 | `stack`（`classPattern` + `methodPattern`） |
| 方法调用量/QPS | `monitor`（`intervalMs`） |
| CPU 火焰图 | `profiler`（`action: start` → `action: stop`） |

**硬性纪律**：

1. `trace` / `watch` / `stack` / `monitor` / `tt` 会**增强字节码并持续采样**，务必给 `numberOfExecutions` 或 `timeout`，别让工具挂住 JVM。采完确认已结束。
2. 涉及生产的进程，只做**只读观察**。`redefine` / `retransform` / `stop` / `heapdump` 这类改变运行态或产生大文件的工具，**执行前必须向用户确认**；`heapdump` 会写磁盘、可能触发 Full GC。
3. `stop` 会把 Arthas 从目标进程卸载，MCP 端点随之消失，之后必须重新走第三节。不要在未确认时调。
4. 结果里 `results` 是数组，按 `jobId` 归组；先看 `success` 与 `statusCode`，失败时把原始报文如实转述，不要脑补。
5. 输出可能很长（`dashboard`、`sc` 全量），给用户看时提炼要点，不要把整段 JSON 倒出去。

---

## 五、兜底：直接打 MCP 端点

MCP 工具不可用但端口在监听时，可用 `curl` 走 JSON-RPC（STREAMABLE HTTP）：

```bash
MCP=http://127.0.0.1:8563/mcp
# 1) initialize 拿 session id
SID=$(curl -s -D - -o /dev/null -X POST "$MCP" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"cli","version":"1"}}}' \
  | tr -d '\r' | grep -i '^mcp-session-id:' | cut -d' ' -f2)

# 2) 调工具
curl -s -X POST "$MCP" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"thread","arguments":{"topN":10}}}'
```

响应是 SSE（`event: message` + `data: {...}`），要剥掉 `data: ` 前缀再解析 JSON。

---

## 六、排错

| 现象 | 原因 | 处理 |
|---|---|---|
| 新窗口一闪就没了 | `start` 把脚本路径当成了窗口标题 | 固定 `start "" cmd //c "..."` |
| 窗口里报 `AttachNotSupportedException` / `Unable to attach` | 目标进程权限更高、或不同用户启动 | 用同权限的终端启动 arthas-boot，或改走 `--telnet-port` 连远端 |
| `Arthas server is already listening on port 8563` | 已有别的进程 attach 过 Arthas | 先 `arthas-status.sh` 确认；确实要换进程时，在旧窗口执行 `stop` |
| 端口 TIME_WAIT 但无 LISTENING | 上个会话刚退出 | 等几秒或换端口（`--http-port 8564`，同时要改 `.claude.json` 的 url） |
| `arthas-mcp` 一直 ECONNREFUSED | 会话启动时 Arthas 还没起 | `/mcp` 重连或重启 Claude Code |
| MCP 工具列表为空 / 只有少数工具 | Arthas 版本 < 4.3 | 升级 arthas-boot.jar；或退回 telnet 3658 |
| 中文在 cmd 窗口乱码 | 代码页不是 65001 | 脚本里已用英文提示；用户侧可 `chcp 65001` |

---

## 七、收尾

- 用完告诉用户**怎么停**：在新窗口里敲 `stop`（只卸载 Arthas，不影响目标 JVM），或直接关窗口（Arthas 会随之退出，端口释放）。
- 不要主动 `taskkill` 用户的应用进程。

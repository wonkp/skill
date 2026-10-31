# arthas skill 配置说明

`SKILL.md` 负责「怎么启动、怎么用 MCP 诊断」，真正提供连接能力的是两处外部配置：

1. **全局 `CLAUDE.md`「本地环境信息」** —— 提供 arthas 目录（`arthas-boot.jar` 所在位置）。
2. **`.claude.json` 的 `mcpServers.arthas-mcp`** —— 指向被 attach 进程暴露的 MCP 端点。

> MCP 端点不是独立常驻服务，它由**被 attach 的 Java 进程**提供。进程没 attach，端点就是空的，`arthas-mcp` 必然 `ECONNREFUSED`。

---

## 一、前置条件

| 项 | 要求 | 说明 |
|---|---|---|
| JDK | 8+ | `java -jar arthas-boot.jar` 用；attach JDK 6/7 目标需 Arthas 3 |
| Arthas | **4.3.x 及以上** | MCP 从 4.3 起支持 |
| 网络 | 本地回环 | 默认只监听 `127.0.0.1` |
| 端口 | `3658`（telnet）、`8563`（http/mcp）空闲 | 冲突时用 `--telnet-port` / `--http-port` 换 |

确认版本：

```bash
unzip -p "C:\IT\Tools\arthas\arthas-core.jar" META-INF/MANIFEST.MF | grep Implementation-Version
```

确认 MCP 开关（`C:\IT\Tools\arthas\arthas.properties`）：

```properties
arthas.httpPort=8563
arthas.mcpEndpoint=/mcp
arthas.mcpProtocol=STREAMABLE
```

---

## 二、全局 CLAUDE.md

在 `C:\Users\<用户名>\.claude\CLAUDE.md` 的「本地环境信息」节里保留 arthas 路径，本 skill 从这里读：

```markdown
## 本地环境信息

- arthas 地址：`C:\IT\Tools\arthas`
```

路径变了只改这里，不用动 skill。

---

## 三、MCP 配置

写进 `.claude.json` 顶层 `mcpServers`（全局）或项目 `.mcp.json`：

```json
{
  "mcpServers": {
    "arthas-mcp": {
      "type": "http",
      "url": "http://localhost:8563/mcp"
    }
  }
}
```

| 字段 | 值 | 备注 |
|---|---|---|
| `type` | `http` | STREAMABLE HTTP，不是 `stdio` |
| `url` | `http://localhost:8563/mcp` | 端口须与 `arthas.properties` 的 `arthas.httpPort` 一致；改了端口这里同步改 |

要点：

- **Arthas 必须在 Claude Code 启动前就在跑**，否则该 server 初始化连不上，工具不会出现在列表里（现象是 `/mcp` 里 `arthas-mcp` 为 failed）。
- Claude Code 启动后再起 Arthas → 会话内执行 `/mcp` 重连 `arthas-mcp`，或重启 Claude Code。
- 同一时间只有一个 Java 进程能占用 8563（一个进程 attach 一次 Arthas）。要给第二个进程诊断，先在旧窗口 `stop` 或换端口。

---

## 四、脚本

| 文件 | 用途 |
|---|---|
| `scripts/launch-arthas.bat` | 在新命令窗口里 `cd /d %ARTHAS_HOME%` + `java -jar arthas-boot.jar`；校验 jar 存在；退出后 `pause` 便于看报错 |
| `scripts/arthas-status.sh` | `netstat` 查 3658/8563 + `curl` 探 `initialize`，返回就绪/未就绪/被占用 |

调用约定：

```bash
# 启动（新窗口，用户自己选进程编号）
cmd //c start "" cmd //c "C:\Users\<用户名>\.cc-switch\skills\arthas\scripts\launch-arthas.bat \"C:\IT\Tools\arthas\""

# 状态
bash C:/Users/<用户名>/.cc-switch/skills/arthas/scripts/arthas-status.sh
```

`arthas-status.sh` 退出码：`0` 就绪 / `1` 无监听端口 / `2` 端口被占但 MCP 不通。

---

## 五、安装与生效

1. 目录放到 `~/.cc-switch/skills/arthas/`（cc-switch 管理），再在 `~/.claude/skills/` 建软链：
   ```bash
   cmd //c mklink /D "C:\Users\<用户名>\.claude\skills\arthas" "C:\Users\<用户名>\.cc-switch\skills\arthas"
   ```
   （需要管理员或开发者模式；没有权限就直接复制整个目录。）
2. 按第二节确认 `CLAUDE.md` 有 arthas 地址。
3. 按第三节写 `mcpServers.arthas-mcp`。
4. 先用 `/arthas` 把 Arthas 起来，再重启 Claude Code 或 `/mcp` 重连。
5. `/mcp` 确认 `arthas-mcp` 为 connected，工具列表出现 `mcp__arthas-mcp__*`。

---

## 六、连通性自检

```bash
bash ~/.cc-switch/skills/arthas/scripts/arthas-status.sh
```

预期：

```
== 端口状态 ==
  3658: UP <pid>
  8563: UP <pid>
== MCP 探活 ==
== MCP: 就绪 (session=..., tools=32) ==
```

`tools=32` 对应 Arthas 4.3.5 的 32 个 MCP 工具。数量明显偏少 → 版本旧；`session=` 为空 → 端点不是 Arthas MCP 或版本不支持。

再确认 `initialize` 返回的 `serverInfo.name` 是 `arthas-mcp-server`。

---

## 七、常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| `/mcp` 里 `arthas-mcp` failed `ECONNREFUSED` | 起 Claude Code 时 Arthas 没在跑 | 先 `/arthas` 启动，再 `/mcp` 重连或重启 Claude Code |
| 新窗口闪退 | `start` 把第一个带引号参数当窗口标题 | 用 `start "" cmd //c "..."` |
| `Unable to attach` / `AttachNotSupportedException` | 权限不足 / 目标进程 JRE 精简无 attach | 以相同权限启动；或目标侧 `-Djdk.attach.allowAttachSelf` |
| `server is already listening on port 8563` | 已有进程 attach 过 | 旧窗口 `stop`，或 `--http-port` 换端口并同步改 MCP url |
| MCP 工具只有几个 / 没有 | Arthas < 4.3 | 升级；或改用 telnet `127.0.0.1:3658` |
| `trace`/`watch` 卡住不返回 | 没给 `numberOfExecutions` / `timeout` | 重调并显式给时长；必要时 `stop` 重来 |
| 换端口后 MCP 仍连 8563 | `.claude.json` 的 url 没改 | 两处同步 |

---

## 八、改动后的同步清单

- [ ] `arthas.properties` 的 `httpPort` / `mcpEndpoint` / `mcpProtocol`
- [ ] `.claude.json` → `mcpServers.arthas-mcp.url`
- [ ] 全局 `CLAUDE.md` 的 arthas 地址（目录搬家时）
- [ ] 重启或 `/mcp` 重连，跑第六节自检

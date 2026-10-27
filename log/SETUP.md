# log skill 配置说明

本文件说明 `log` skill 运行所需的**完整前置配置**。skill 本身（`SKILL.md`）只负责「环境/服务 → job 标签」的映射与查法，真正的查询能力由 `log-loki` MCP server 提供。

> 与 `database` skill 的区别：Loki 只有一个实例、四个环境共用同一地址，因此**只需要一个 MCP server**，环境差异靠查询串里的 `job` 标签区分，不需要像 MySQL 那样起四个 server。

---

## 一、前置条件

| 项 | 要求 | 说明 |
|---|---|---|
| Node.js | ≥ 16（含 `npx`） | server 通过 `npx -y simple-loki-mcp` 拉起，首次运行需联网下载 |
| 网络 | 可访问 Loki 的 `3100` 端口 | 内网地址，需连内网或 VPN |
| Claude Code | 支持 MCP stdio server | 当前版本即可 |
| `logcli` | **不需要** | 当前版本（0.0.9）的实现只走 HTTP API，`logcli` 装了也不会用 |

Loki 地址属于 LV1 基础设施信息，不在全局 `CLAUDE.md` 的数据库表格里；它只存在于本 skill 的 MCP `env` 中（见第二节）。

---

## 二、MCP 配置（1 个 server：`log-loki`）

### 2.1 放哪里

二选一：

- **全局（推荐，所有项目可用）**：`C:\Users\<用户名>\.claude.json` 的**顶层** `mcpServers` 字段。
- **仅当前项目**：项目根目录 `.mcp.json`，结构相同。

改完必须**重启 Claude Code**（或会话内 `/mcp` 重连）才生效。

### 2.2 完整配置

```json
{
  "mcpServers": {
    "log-loki": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "npx", "-y", "simple-loki-mcp"],
      "env": {
        "LOKI_ADDR": "http://<loki地址>:3100"
      }
    }
  }
}
```

macOS / Linux：

```json
{
  "mcpServers": {
    "log-loki": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "simple-loki-mcp"],
      "env": {
        "LOKI_ADDR": "http://<loki地址>:3100"
      }
    }
  }
}
```

> ⚠️ Windows 下 `command` 必须是 `cmd` + `args: ["/c", "npx", ...]`，直接写 `npx` 会 stdio 握手失败。

### 2.3 `LOKI_ADDR` 写法（最容易配错的一项）

server 内部拼接的请求地址是：

```
${LOKI_ADDR}/loki/api/v1/query_range
```

所以 `LOKI_ADDR` 必须是**纯 base 地址**：

| 写法 | 结果 |
|---|---|
| `http://172.16.1.168:3100` | ✅ 正确 |
| `http://172.16.1.168:3100/` | ⚠️ 末尾斜杠可能拼出 `//loki/...`，部分反代会 404 |
| `http://172.16.1.168:3100/loki` | ❌ 会变成 `/loki/loki/api/...` |
| `172.16.1.168:3100` | ❌ 缺协议，配置校验直接报错（`addr` 要求是合法 URL） |

### 2.4 可选参数（当前内网实例不需要）

`simple-loki-mcp` 另支持以下环境变量，内网匿名访问时全部留空即可：

| 变量 | 用途 |
|---|---|
| `LOKI_USERNAME` / `LOKI_PASSWORD` | Basic Auth |
| `LOKI_BEARER_TOKEN` / `LOKI_BEARER_TOKEN_FILE` | Bearer Token 认证 |
| `LOKI_TENANT_ID` / `LOKI_ORG_ID` | 多租户（`X-Scope-OrgID` 头） |
| `LOKI_CA_FILE` / `LOKI_CERT_FILE` / `LOKI_KEY_FILE` | mTLS |
| `LOKI_TLS_SKIP_VERIFY` | `"true"` 跳过证书校验（仅调试用） |
| `LOKI_CONFIG_PATH` | 改用 yaml 配置文件 |
| `DEBUG` | 打印调试日志 |

也可以反过来说：如果把 Loki 迁到需要认证的环境，**只需在 `env` 里加对应变量**，skill 与查询语法都不用改。

---

## 三、与全局提示词的关系

`log` skill **不依赖** 全局 `CLAUDE.md` 的表格（那是给 database skill 用的）。是否要在全局提示词里补一段 Loki 说明属于可选项，若要补，建议只写地址来源与安全约束，不要写和 MCP `env` 重复的第二份配置：

```markdown
## 日志平台

- Loki 地址以 `.claude.json` 的 `mcpServers.log-loki.env.LOKI_ADDR` 为准，通过 `log-loki` MCP 只读查询。
- 日志含客户手机号、姓名等敏感数据，展示时脱敏，不得外传。
```

---

## 四、安装与生效

1. 把 `log` 目录链接/复制到 skills 目录：
   - 个人级：`C:\Users\<用户名>\.claude\skills\log\`
   - 或 cc-switch 管理的 `~/.cc-switch/skills/log/`（再由 `~/.claude/skills` 建软链）
2. 按第二节写入 `mcpServers.log-loki`。
3. **重启 Claude Code**。
4. `/mcp` 确认 `log-loki` 为 connected，工具列表出现：
   - `mcp__log-loki__query_loki`
   - `mcp__log-loki__get_labels`
   - `mcp__log-loki__get_label_values`

---

## 五、连通性自检

按顺序跑三步，全部通过再查业务日志。

1. **列全部标签**（验证能连上）：

   ```
   mcp__log-loki__get_labels
   ```

   预期返回非空数组，含 `job`、`namespace`、`app` 等。

2. **列 job 实际值**（验证标签命名规则与 `SKILL.md` 一致）：

   ```
   mcp__log-loki__get_label_values   label = "job"
   ```

   预期能看到 `viptutor/viptutor-system`、`viptutor-test/system`、`viptutor-migrate/teaching` 等，形如 `<namespace>/<job名>`。

3. **拉一条真实日志**（验证时间窗与查询串）：

   ```bash
   date -u +%Y-%m-%dT%H:%M:%SZ                      # to
   date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%SZ  # from
   ```

   ```
   mcp__log-loki__query_loki
     query  = {job="viptutor-test/system"}
     from   = <上一步算出的 from>
     to     = <上一步算出的 to>
     limit  = 5
     output = raw
   ```

   返回若干行日志即链路正常。**返回空数组**不一定是故障：可能该服务该时段确实没日志，换 `{namespace="viptutor-test"}` 或放宽时间窗再试。

---

## 六、常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| `/mcp` 里没有 `log-loki` | npx 下载失败 / JSON 语法错 / 未重启 | 手动跑 `npx -y simple-loki-mcp` 看报错；校验 JSON；重启 |
| 启动即报 `config_load_error` | `LOKI_ADDR` 缺失或不是合法 URL | 补协议头，去掉末尾路径 |
| 查询报 `Loki server address (addr) is not configured` | `LOKI_ADDR` 没传进子进程 | 确认变量写在 `env` 里、不在 shell 环境里 |
| `ECONNREFUSED` / `ETIMEDOUT` | 未连内网 / 端口不通 | telnet `<loki地址>:3100` |
| 404 `/loki/loki/api/v1/query_range` | `LOKI_ADDR` 多写了 `/loki` | 改成纯 base 地址 |
| 查询恒为空 | 时间窗错（传了本地时间/相对时间）或 job 标签名错 | 用 `date -u` 生成 UTC；用 `get_label_values` 核对 job 实际值 |
| `limit` 报校验错误 | 超过 1000 上限 | 降到 ≤ 1000，用关键字过滤收窄而不是拉全量 |
| 输出里全是 ESC 控制符 | 日志带 ANSI 颜色码 | `output=raw` 或整理时剥离 |

---

## 七、改动后的同步清单

Loki 地址或认证方式变化时：

- [ ] `.claude.json` 的 `mcpServers.log-loki.env`
- [ ] 重启 Claude Code，并跑第五节三步自检
- [ ] 若 `SKILL.md` 的 namespace 表随之调整，同步更新（生产 `viptutor` / 测试 `viptutor-test` / 迁移 `viptutor-migrate` / 开发 `viptutor-dev`）

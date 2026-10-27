# database skill 配置说明

本文件说明 `database` skill 运行所需的**完整前置配置**。skill 本身（`SKILL.md`）只负责「怎么查、查完怎么标注来源」，真正的连接能力由两部分外部配置提供：

1. **MySQL MCP server × 4** —— 提供 `list_databases` / `list_tables` / `describe_table` / `execute_query` 四个只读工具。
2. **全局提示词 `CLAUDE.md`** —— 提供「数据库连接信息（权威源）」表格与只读硬性规则。

> 🔑 **凭据不落在 skill 目录里**。`SKILL.md` 与本文档都只写占位符，真实地址 / 账号 / 密码以全局 `CLAUDE.md` 的表格为唯一权威源；MCP 配置里的 `env` 是这份表格的机器可读落地，两者必须一致。

---

## 一、前置条件

| 项 | 要求 | 说明 |
|---|---|---|
| Node.js | ≥ 18（含 `npx`） | MCP server 通过 `npx -y mysql-mcp-server` 拉起，首次运行会联网下载包 |
| 网络 | 可访问各环境 MySQL 端口 | 研发/测试/迁移走内网 `172.16.1.174:3306`；生产走阿里云 DMS 代理域名 |
| Claude Code | 支持 MCP stdio server | 当前版本即可 |
| 全局 `CLAUDE.md` | 已写入数据库连接表格 | 见第三节 |

`mysql-mcp-server` 校验连接后才注册工具；**npx 首次下载失败或网络不通时，该 server 会直接不出现**，现象是工具列表里没有 `mcp__mysql-*__*`。

---

## 二、MCP 配置（4 个 server）

### 2.1 放哪里

二选一：

- **全局（推荐，所有项目可用）**：`C:\Users\<用户名>\.claude.json` 的**顶层** `mcpServers` 字段。
- **仅当前项目**：项目根目录 `.mcp.json`，结构相同。

配置改完后必须**重启 Claude Code**（或在会话内 `/mcp` 重连）才会生效。

### 2.2 完整配置

四个环境各起一个独立 server，**因为 MCP 服务端复用单连接、会记住最后一次的库**，拆开才能保证环境和库不会串。

```json
{
  "mcpServers": {
    "mysql-dev": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "npx", "-y", "mysql-mcp-server"],
      "env": {
        "MYSQL_HOST": "<研发地址>",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "<研发账号>",
        "MYSQL_PASSWORD": "<研发密码>",
        "MYSQL_DATABASE": "viptutor-dev"
      }
    },
    "mysql-test": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "npx", "-y", "mysql-mcp-server"],
      "env": {
        "MYSQL_HOST": "<测试地址>",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "<测试账号>",
        "MYSQL_PASSWORD": "<测试密码>",
        "MYSQL_DATABASE": "viptutor-test"
      }
    },
    "mysql-migrate": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "npx", "-y", "mysql-mcp-server"],
      "env": {
        "MYSQL_HOST": "<迁移地址>",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "<迁移账号>",
        "MYSQL_PASSWORD": "<迁移密码>",
        "MYSQL_DATABASE": "viptutor_new9"
      }
    },
    "mysql-prod": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "npx", "-y", "mysql-mcp-server"],
      "env": {
        "MYSQL_HOST": "<生产地址>",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "<生产账号>",
        "MYSQL_PASSWORD": "<生产密码>",
        "MYSQL_DATABASE": "viptutor"
      }
    }
  }
}
```

填值来源：全局 `CLAUDE.md`「数据库连接信息」表格，逐列对应。

### 2.3 各 server 的关键参数

| server | 用途 | `MYSQL_DATABASE` | 备注 |
|---|---|---|---|
| `mysql-dev` | 研发 | `viptutor-dev` | 注意是横杠 |
| `mysql-test` | 测试 | `viptutor-test` | 注意是横杠 |
| `mysql-migrate` | 迁移 | `viptutor_new9` | **下划线**；全局表格里若写 `viptutor-new9`（横杠），该库实际不存在，按本文档用下划线 |
| `mysql-prod` | 生产 | `viptutor` | 必须使用只读账号，服务端兜底 |

> ⚠️ Windows 下 `command` 必须是 `cmd` + `args: ["/c", "npx", ...]`，不能直接写 `npx`，否则 stdio 握手失败。

> ⚠️ `mysql-migrate` 与 `mysql-test` 在同一个 MySQL 实例上，可共用测试账号。区别只在 `MYSQL_DATABASE`。

### 2.4 只读保障

| 层 | 保障方式 |
|---|---|
| 客户端（Claude） | `SKILL.md` 第 4.2 节声明只读红线，只调用四个只读工具 |
| MCP 工具层 | `execute_query` 只放行 SELECT / SHOW / DESCRIBE / EXPLAIN |
| 服务端 | 生产用只读账号；研发/测试/迁移账号是 `ALL PRIVILEGES`，**只读仅靠约定**，不得探测写操作 |

---

## 三、全局提示词配置（CLAUDE.md）

在 `C:\Users\<用户名>\.claude\CLAUDE.md` 中加入以下两段。`SKILL.md` 会引用这里的表格与规则，**不要改到 skill 目录**。

### 3.1 数据库连接信息（权威源）

```markdown
## 数据库连接信息（权威源）

本节是 `/database` skill 与 mysql MCP 的**唯一权威来源**。修改后须同步 `.claude.json` 的 `mcpServers.mysql-*.env`。

| 数据库类型 | 地址 | 端口 | 用户名 | 密码 | 数据库名称 |
|---|---|---|---|---|---|
| 研发 | <研发地址> | 3306 | <研发账号> | <研发密码> | viptutor-dev |
| 测试 | <测试地址> | 3306 | <测试账号> | <测试密码> | viptutor-test |
| 迁移 | <迁移地址> | 3306 | <迁移账号> | <迁移密码> | viptutor_new9 |
| 生产 | <生产地址> | 3306 | <生产账号> | <生产密码> | viptutor |
```

> 库名一栏务必写成与 MCP `MYSQL_DATABASE` 一致的实际库名（迁移为 `viptutor_new9`），否则 skill 每次查询都要回退重试。

### 3.2 硬性规则

```markdown
## 硬性规则

1. **只读**：仅允许 SELECT / SHOW / DESCRIBE / EXPLAIN。禁止 INSERT、UPDATE、DELETE、TRUNCATE、ALTER、DROP、CREATE 等一切写操作，也禁止 SELECT ... INTO OUTFILE、FOR UPDATE。需要改数据时输出 SQL 交给用户执行，不得自行落库。
2. **每次调用必须声明来源**：回答的第一行固定输出 `[<数据库类型> / <数据库名称>]`，如 `[测试 / viptutor-test]`。一次涉及多库时逐个列出。
3. **每次查询必须显式传 `database` 参数**：MCP 复用单连接，会记住上一次查询的库，`MYSQL_DATABASE` 默认值不可信。生产/测试/迁移同处一个实例，误读会把别的库的数据当成本库上报。
4. **数据库名含 `-` 时必须加反引号**：`` `viptutor-test`.edu_clazz ``。
```

> 第 2 条与 `SKILL.md` 第二节的色标溯源是两层要求：`CLAUDE.md` 管所有会话的通用声明，`SKILL.md` 管 database 专项的色标 + 库 + 表格式。两者都要保留。

---

## 四、安装与生效

1. 把 `database` 目录链接/复制到 skills 目录：
   - 个人级：`C:\Users\<用户名>\.claude\skills\database\`
   - 或 cc-switch 管理的 `~/.cc-switch/skills/database/`（再由 `~/.claude/skills` 建软链）
2. 按第二节写入 `mcpServers`。
3. 按第三节写入全局 `CLAUDE.md`。
4. **重启 Claude Code**。
5. 用 `/mcp` 确认四个 server 均为 connected，工具列表出现 `mcp__mysql-dev__*`、`mcp__mysql-test__*`、`mcp__mysql-migrate__*`、`mcp__mysql-prod__*`。

---

## 五、连通性自检

依次对四个 server 执行（会话首次连某环境时必做）：

```sql
SELECT CURRENT_USER() AS conn_user, DATABASE() AS default_db,
       @@hostname AS host, @@port AS port, @@read_only AS ro, VERSION() AS ver;
```

预期：

| server | `DATABASE()` | 账号性质 |
|---|---|---|
| `mysql-dev` | `viptutor-dev` | 可写（约定只读） |
| `mysql-test` | `viptutor-test` | 可写（约定只读） |
| `mysql-migrate` | `viptutor_new9` | 可写（约定只读） |
| `mysql-prod` | `viptutor` | 只读账号 |

任一项与预期不符（库名错、账号错、`ro` 异常）→ 停止查询并报告，不要继续。

再确认可见库：

```sql
SHOW DATABASES;
```

`mysql-test` 正常应能看到 6 个库（含 `viptutor_new8`、`viptutor-migrate`、`agent-dev` 等）。

---

## 六、常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| `/mcp` 里没有 `mysql-*` | npx 下载失败 / JSON 语法错 / 未重启 | 手动跑 `npx -y mysql-mcp-server` 看报错；校验 JSON；重启 Claude Code |
| 工具报 `connect ECONNREFUSED` / timeout | 网络不通或 VPN 未连 | 确认能 telnet 到 `<地址>:3306` |
| `ER_DBACCESS_DENIED_ERROR`（迁移库） | 用了横杠 `viptutor-new9` | 改成下划线 `viptutor_new9` |
| 查出来的数据属于别的库 | 没传 `database`，连接复用了上一次的库 | 每条查询显式传 `database`；发现混库立即停止并报告 |
| `ER_TABLEACCESS_DENIED` / 看不到某库 | 账号无该库权限 | 用对应环境的 server 查，不要跨 server |
| 生产查询超时 | 无索引条件或大范围聚合 | 加 `LIMIT` + 索引条件；大表行数用 `information_schema.TABLES.TABLE_ROWS` 估算 |
| `cmd not found`（非 Windows） | `command` 写死成 `cmd` | macOS/Linux 改为 `"command": "npx"`，`args: ["-y", "mysql-mcp-server"]` |

---

## 七、改动后的同步清单

改数据库地址 / 账号 / 库名时，三处一起改，缺一处就会出「查错库、标错环境」的问题：

- [ ] 全局 `CLAUDE.md`「数据库连接信息」表格
- [ ] `.claude.json` 对应 `mcpServers.mysql-*.env`
- [ ] 重启 Claude Code，并跑第五节的 `CURRENT_USER()` 自检

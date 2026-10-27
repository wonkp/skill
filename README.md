# skill

个人 Claude Code skills 集合。每个子目录是一个独立 skill，按需链接到 `~/.claude/skills/` 使用。

## 目录一览

| 目录 | 名称 | 用途 | 触发方式 |
|---|---|---|---|
| [`bruno/`](bruno/) | `/bruno` | 根据 Java Controller 源码（URL / 类名 / 类名#方法）生成可直接发送的 Bruno `.yml` 请求文件 | 手动 `/bruno` |
| [`tice/`](tice/) | `/tice` | 扫描当前分支相对基线的改动，生成提测邮件（Markdown 全文，含提测内容 / 影响范围 / 测试范围 / SQL 与回滚） | 手动 `/tice` |
| [`database/`](database/) | `database` | 只读查询 viptutor 四环境（研发 / 测试 / 迁移 / 生产）的 MySQL，强制标注数据来源 | 自动（提到查库 / 表结构 / 索引 / 慢查询等） |
| [`log/`](log/) | `log` | 只读查询 viptutor 各服务在 Loki 上的日志，按「环境 + 服务」映射到 `job` 标签 | 自动（提到查日志 / 排查报错 / 超时） |
| [`code-review/`](code-review/) | — | 代码审查判据知识库，供 `code-review` skill 的 Standards 轴使用 | 被引用 |

## 各 skill 说明

### bruno — Java 接口 → Bruno 请求文件

输入接口 URL、Controller 类名或 `类名#方法`，也可直接粘贴 Java 代码。解析出路径、方法、参数后，**生成前先确认参数粒度**（全量 / 关键参数 / 默认值），再产出 `.yml`。

源码仓库与 Bruno 集合路径不写死，从全局 `CLAUDE.md`「项目路径（skill 通用配置）」读取，支持多项目成对登记。`disable-model-invocation: true`，只能手动 `/bruno` 触发。

- 详见 [bruno/SKILL.md](bruno/SKILL.md)，示例见 [bruno/EXAMPLES.md](bruno/EXAMPLES.md)

### tice — 提测邮件生成

一次问全所需信息（对比基线、需求名称、前端改动、遗留问题、是否做代码审核），拉取 `<base>...HEAD` 改动，识别 SQL / 配置 / 前端影响，套模板输出 Markdown。硬性要求：SQL 必须**附回滚脚本**，提测内容与测试范围详细分条。可自动衔接 `code-review` 生成审查报告。

默认只在对话输出，明确要求存文件时才落到 `docs/submit/YYYYMMDD-提测邮件-<功能>.md`。`disable-model-invocation: true`。

- 详见 [tice/SKILL.md](tice/SKILL.md)

### database — MySQL 只读查询

四个环境各一个 MCP server，先按关键字路由，再查询，**每条结果必须标注环境色标 + 库名 + 表名**：

| 环境关键字 | MCP server | 默认库 |
|---|---|---|
| 生产 / 线上 / prod | `mysql-prod` | `viptutor` |
| 测试 / test / qa | `mysql-test` | `viptutor-test` |
| 研发 / dev / 开发 | `mysql-dev` | `viptutor-dev` |
| 迁移 / migrate | `mysql-migrate` | `viptutor_new9` |

关键约束：只读（仅 SELECT / SHOW / DESCRIBE / EXPLAIN）；**每次都必须显式传 `database`**（MCP 复用单连接会记住上次的库）；无环境关键字时必须反问；大表禁止 `COUNT(*)`，用 `information_schema.TABLES` 估算。连接信息只认全局 `CLAUDE.md` 的表格，skill 内不硬编码。

- 用法规约：[database/SKILL.md](database/SKILL.md)
- 配置（MCP + 全局提示词）：[database/SETUP.md](database/SETUP.md)

### log — Loki 日志查询

通过单个 `log-loki` MCP 查询，重点是把用户说的「环境 + 服务」正确映射成 `job` 标签：

- prod：`viptutor/viptutor-<service>`（带前缀）
- 非 prod：`viptutor-<env>/<service>`（裸服务名）

时间参数只接受 UTC ISO 8601，不支持 `1h ago` / `now`；`limit` 上限 1000。

- 用法规约：[log/SKILL.md](log/SKILL.md)
- 配置（MCP）：[log/SETUP.md](log/SETUP.md)

### code-review — 审查判据

本目录**不含 skill 本体**，只有 `CODING_STANDARDS.md`：三档严重度折算、四个基本问题（正确性 / 失败方式 / 兼容性 / 可运维性）、各维度具体判据。`code-review` skill 的 Standards 轴会扫描仓库内的标准文档并以此判定违规。

- 判据本体：[code-review/CODING_STANDARDS.md](code-review/CODING_STANDARDS.md)

## 依赖

| 依赖 | 用于 | 配置位置 |
|---|---|---|
| Node.js ≥ 18 + `npx` | database、log 的 MCP server | 环境变量 |
| `mysql-mcp-server` × 4 | database | `.claude.json` → `mcpServers.mysql-*` |
| `simple-loki-mcp` | log | `.claude.json` → `mcpServers.log-loki` |
| 全局 `CLAUDE.md` | database 凭据、bruno 项目路径 | `~/.claude/CLAUDE.md` |

MCP 配置改动后需重启 Claude Code，用 `/mcp` 确认状态。

## 安装

把目录链接到个人 skills 目录：

```bash
ln -s /path/to/skill/database ~/.claude/skills/database
```

Windows 下用目录联接（`mklink /J`）或直接复制。skill 目录内必须有 `SKILL.md`，其 frontmatter 的 `name` 即调用名。

## 增加新 skill

1. 新建目录 `<skill-name>/`，写入 `SKILL.md`（`name` + `description` 必填）。
2. 需要 MCP 或外部配置的，另写 `SETUP.md` 说明前置条件、MCP 配置、自检方法与排错。
3. 在本文件「目录一览」补一行。

---
name: log
description: 查询 viptutor 服务日志。Use when the user wants to query or inspect logs（查日志、看日志、查一下 system/teaching/sale 等服务的日志、排查报错/异常/超时）from the viptutor services across environments（prod/migrate/test/dev）. 通过 log-loki MCP 查询，需先按映射表把「环境 + 服务」转成 job 标签。
---

# Loki 日志查询

通过 `log-loki` MCP 查询 viptutor 各服务日志。核心工具是 `mcp__log-loki__query_loki`。查日志前，先把用户说的「环境 + 服务」映射成 Loki 的 `job` 标签。

## 环境 → namespace

| 环境 | namespace |
|---|---|
| prod（生产） | `viptutor` |
| migrate（迁移） | `viptutor-migrate` |
| test（测试） | `viptutor-test` |
| dev（开发） | `viptutor-dev` |

## job 标签命名规则

`job` 标签 = `<namespace>/<job名>`。job 名在 prod 与非 prod 环境不同：

- **prod**：`viptutor/viptutor-<service>`（服务名加 `viptutor-` 前缀）
- **非 prod**（migrate / test / dev）：`viptutor-<env>/<service>`（裸服务名）

## 核心服务 → job 映射表

| 服务 | prod (`viptutor`) | migrate (`viptutor-migrate`) | test (`viptutor-test`) | dev (`viptutor-dev`) |
|---|---|---|---|---|
| system（系统） | `viptutor/viptutor-system` | `viptutor-migrate/system` | `viptutor-test/system` | `viptutor-dev/system` |
| teaching（教学） | `viptutor/viptutor-teaching` | `viptutor-migrate/teaching` | `viptutor-test/teaching` | `viptutor-dev/teaching` |
| sale（销售） | `viptutor/viptutor-sale` | `viptutor-migrate/sale` | `viptutor-test/sale` | `viptutor-dev/sale` |

按同一规则推导的其他服务：`app`、`backstage`、`landing`、`futureabc`、`homework` 等（prod 加 `viptutor-` 前缀，非 prod 裸名）。

例外（各环境均为裸名，不加前缀）：`report`、`xxl-job-admin`（如 `viptutor/report`、`viptutor-test/xxl-job-admin`）。

特殊前缀服务：`math*`（如 `viptutor/math-homework-web`）、`vipchinese*`、`iyuwen*`。

> 拿不准时，用 `mcp__log-loki__get_label_values`（label 传 `job` 或 `app`）查实际存在的值，不要凭空猜。

## 查询步骤

1. **确定 job 标签**：据用户说的环境 + 服务查上表得到 job 值；不确定就用 `get_label_values` 确认。

2. **计算时间范围**：`query_loki` 的 `from` / `to` 只接受 ISO 8601 UTC（`YYYY-MM-DDTHH:MM:SSZ`），**不支持**相对时间（`1h ago`、`now`）。用 `date` 算：

   ```bash
   date -u +%Y-%m-%dT%H:%M:%SZ                      # 当前 UTC（作 to）
   date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%SZ  # N 分钟前（作 from）
   ```

3. **执行查询**：Loki 查询串用 `{job="<job标签>"}`：

   ```
   {job="viptutor-test/system"}
   ```

   附加过滤（LogQL）：
   - 关键字包含：`{job="viptutor-test/system"} |= "ERROR"`
   - 关键字排除：`{job="viptutor-test/system"} != "health"`
   - 正则匹配：`{job="viptutor-test/system"} |~ "Exception|Error"`
   - 组合：`{job="viptutor-test/system"} |= "ERROR" |~ "NullPointer|Timeout"`

   常用参数：`limit`（默认 1000，最大 1000）、`output`（`default` / `raw` / `jsonl`）、`forward=true`（时间正序）。默认倒序（最新在前）。

4. **整理结果**：日志含 ANSI 颜色码，给用户看前先剥离；重点挑出 ERROR / WARN / Exception 等异常行，附上时间与 traceId（日志里形如 `ae845915-...` 的字段）。

## 等价查询方式

也可用 `namespace` + `app` 两个标签组合，等价于 job：

- prod：`{namespace="viptutor", app="viptutor-system"}`
- 非 prod：`{namespace="viptutor-test", app="system"}`

（`app` 标签在 prod 同样带 `viptutor-` 前缀，非 prod 为裸名。）

## 注意事项

- 时间戳必须是 UTC ISO 8601；时区错了查到的就是错误时间窗。日志内容里的 `+08:00` 是容器本地时间，与 `from`/`to` 无关。
- 日志含敏感数据（客户手机号、姓名等），展示/引用时注意脱敏，勿外传。
- 建议显式传入 `from`/`to`，避免依赖默认时间窗导致结果不可预期。
- `query_loki` 的 `batch`/`limit` 上限 1000；日志量大时用 `limit` + 关键字过滤收窄，而不是拉全量。

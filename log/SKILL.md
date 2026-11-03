---
name: log
description: 查询 viptutor 服务日志。Use when the user wants to query or inspect logs（查日志、看日志、查一下 system/teaching/sale 等服务的日志、排查报错/异常/超时）from the viptutor services across environments（prod/migrate/test/dev）. 通过 log-loki MCP 查询，需先按映射表把「环境 + 服务」转成 job 标签。每条结果必须标明数据来源环境、namespace、服务与时间窗；无环境关键字时必须先反问。
---

# Loki 日志查询

通过 `log-loki` MCP 查询 viptutor 各服务日志。**用户输入环境关键字 → 路由到对应 namespace/job → 查询 → 每条结果标注来源**。

核心工具：`mcp__log-loki__query_loki`；辅助：`mcp__log-loki__get_labels`、`mcp__log-loki__get_label_values`。

> 🔑 本 skill 只通过 `log-loki` 这一个 MCP 取数，不存在第二条数据来源。标注时区分的是**环境（namespace）与实际查询的 job**，不是 MCP server。

---

## 一、关键字路由（第一步，必做）

| 环境关键字（含同义词） | 环境 | namespace | 色标 | job 命名 |
|---|---|---|---|---|
| **生产**、线上、正式、prod、production、live | 生产 | `viptutor` | 🟥 | `viptutor/viptutor-<service>` |
| **测试**、test、qa、sit、测服 | 测试 | `viptutor-test` | 🟨 | `viptutor-test/<service>` |
| **研发**、开发、dev、develop、本地 | 研发 | `viptutor-dev` | 🟩 | `viptutor-dev/<service>` |
| **迁移**、migrate、migration、数据迁移 | 迁移 | `viptutor-migrate` | 🟦 | `viptutor-migrate/<service>` |

路由规则：

1. **命中哪个关键字就查哪个 namespace**，不要在 `viptutor-test` 上查生产日志，也不要跨 namespace 拼凑。
2. **同时提到多个环境**（如「对比生产和测试的 system 日志」）→ 分别查询，结果分开成段，每段独立标注来源。
3. **没有环境关键字**（如「查一下 system 的报错日志」）→ **必须先问用户是哪个环境**，不得默认走某一个。
4. **用户直接给了 job / namespace**（如 `viptutor-test/system`）→ 按前缀反推环境后再路由；前缀不属于上表时先澄清。
5. **服务名不确定** → 先用 `get_label_values`（label 传 `job` 或 `app`）核对实际值，不要凭空猜。

---

## 二、强制溯源（每条结果都必须标注）

### 环境色标

每个环境配一个固定色块，一眼分辨，**不得混用**：

| 环境 | 色标 | 完整标记 |
|---|---|---|
| 生产 | 🟥 | `🟥 **生产**` |
| 测试 | 🟨 | `🟨 **测试**` |
| 研发 | 🟩 | `🟩 **研发**` |
| 迁移 | 🟦 | `🟦 **迁移**` |

> 色块用方形（🟥🟨🟩🟦）而非圆形（🔴🟡🟢🔵）：方形色块面积大、饱和度一致，在终端里更容易一眼分辨；首行汇总统一用 📋 图标，不要用黄色系 emoji，避免和 🟨 混淆。

### 输出格式

每段查询结果的**紧邻上方**必须有一行来源标记，格式固定：

```
> 🟨 **测试** · namespace `viptutor-test` · 服务 `system` · job `viptutor-test/system` · 时间窗 `2026-11-03T02:00:00Z` ~ `2026-11-03T02:15:00Z`
```

多环境 / 多服务时逐行列出：

```
> 🟨 **测试** · namespace `viptutor-test` · 服务 `system` · job `viptutor-test/system` · 时间窗 `2026-11-03T02:00:00Z` ~ `2026-11-03T02:15:00Z`
> 🟥 **生产** · namespace `viptutor` · 服务 `teaching` · job `viptutor/viptutor-teaching` · 时间窗 `2026-11-03T02:00:00Z` ~ `2026-11-03T02:15:00Z`
```

整个回答的**首行**再给一次汇总（📋 开头，让读者不看内容也知道日志来自哪）：

```
**📋 🟨 查询环境：测试 ｜ namespace：viptutor-test ｜ 服务：system ｜ 时间窗：2026-11-03T02:00Z ~ 02:15Z**
```

### 溯源硬性要求

0. **标注必须来自实际执行的查询**：namespace / job 以查询串里的 `job="..."` 为准，时间窗以实际传给 `from` / `to` 的值为准，不能照抄用户意图或上一次查询。
1. **没查过的 namespace 不许标**。例如只查了 `viptutor-test`，就不能在结果里出现「生产」字样。
2. **空结果也要标**：写明「查询 🟨 测试 · namespace `viptutor-test` · job `viptutor-test/system` · 时间窗 … 无匹配日志」，而不是只回一句「没有日志」。
3. **失败也要标**：查询报错 / 超时时写明「尝试查询 <环境> · namespace X · job Y · 时间窗 Z 失败，原因：…」，便于定位是哪一层出的问题。
4. **多条查询逐条标**：不同 job、不同时间窗的多次查询不合并到一张来源不明的表里。
5. **混入非预期 namespace 的日志**（如查 test 却出现 `viptutor/...`）→ **立即停下并报告**，不要当成用户要的数据。
6. **时间口径一致**：展示的日志时间与标注的时间窗必须同为 UTC（或都注明已换算 +8），不得混用。

---

## 三、job 标签命名规则

`job` 标签 = `<namespace>/<job名>`。job 名在 prod 与非 prod 环境不同：

- **prod**：`viptutor/viptutor-<service>`（服务名加 `viptutor-` 前缀）
- **非 prod**（migrate / test / dev）：`viptutor-<env>/<service>`（裸服务名）

## 四、核心服务 → job 映射表

| 服务 | prod (`viptutor`) | migrate (`viptutor-migrate`) | test (`viptutor-test`) | dev (`viptutor-dev`) |
|---|---|---|---|---|
| system（系统） | `viptutor/viptutor-system` | `viptutor-migrate/system` | `viptutor-test/system` | `viptutor-dev/system` |
| teaching（教学） | `viptutor/viptutor-teaching` | `viptutor-migrate/teaching` | `viptutor-test/teaching` | `viptutor-dev/teaching` |
| sale（销售） | `viptutor/viptutor-sale` | `viptutor-migrate/sale` | `viptutor-test/sale` | `viptutor-dev/sale` |

按同一规则推导的其他服务：`app`、`backstage`、`landing`、`futureabc`、`homework` 等（prod 加 `viptutor-` 前缀，非 prod 裸名）。

例外（各环境均为裸名，不加前缀）：`report`、`xxl-job-admin`（如 `viptutor/report`、`viptutor-test/xxl-job-admin`）。

特殊前缀服务：`math*`（如 `viptutor/math-homework-web`）、`vipchinese*`、`iyuwen*`。

> 拿不准时，用 `mcp__log-loki__get_label_values`（label 传 `job` 或 `app`）查实际存在的值，不要凭空猜。

---

## 五、查询步骤

1. **解析环境关键字 → namespace**（第一节路由表）；没有关键字先反问，不要猜。
2. **确定 job 标签**：据用户说的服务查第四节映射表；不确定就用 `get_label_values` 确认。
3. **计算时间范围**：`query_loki` 的 `from` / `to` 只接受 ISO 8601 UTC（`YYYY-MM-DDTHH:MM:SSZ`），**不支持**相对时间（`1h ago`、`now`）。用 `date` 算：

   ```bash
   date -u +%Y-%m-%dT%H:%M:%SZ                      # 当前 UTC（作 to）
   date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%SZ  # N 分钟前（作 from）
   ```

   记下这对值，输出时要原样标注。

4. **执行查询**：Loki 查询串用 `{job="<job标签>"}`：

   ```
   {job="viptutor-test/system"}
   ```

   附加过滤（LogQL）：
   - 关键字包含：`{job="viptutor-test/system"} |= "ERROR"`
   - 关键字排除：`{job="viptutor-test/system"} != "health"`
   - 正则匹配：`{job="viptutor-test/system"} |~ "Exception|Error"`
   - 组合：`{job="viptutor-test/system"} |= "ERROR" |~ "NullPointer|Timeout"`

   常用参数：`limit`（默认 1000，最大 1000）、`output`（`default` / `raw` / `jsonl`）、`forward=true`（时间正序）。默认倒序（最新在前）。

5. **整理结果**：日志含 ANSI 颜色码，给用户看前先剥离；重点挑出 ERROR / WARN / Exception 等异常行，附上时间与 traceId（日志里形如 `ae845915-...` 的字段）。
6. **输出时按第二节标注来源**：首行汇总 + 每段结果上方的来源行，缺一不可。

---

## 六、等价查询方式

也可用 `namespace` + `app` 两个标签组合，等价于 job：

- prod：`{namespace="viptutor", app="viptutor-system"}`
- 非 prod：`{namespace="viptutor-test", app="system"}`

（`app` 标签在 prod 同样带 `viptutor-` 前缀，非 prod 为裸名。）

用等价方式查询时，来源行里的命名空间与 job 照常按实际过滤条件填写。

---

## 七、注意事项

- 时间戳必须是 UTC ISO 8601；时区错了查到的就是错误时间窗。日志内容里的 `+08:00` 是容器本地时间，与 `from`/`to` 无关。
- 日志含敏感数据（客户手机号、姓名等），展示/引用时注意脱敏，勿外传。
- 建议显式传入 `from`/`to`，避免依赖默认时间窗导致结果不可预期。
- `query_loki` 的 `batch`/`limit` 上限 1000；日志量大时用 `limit` + 关键字过滤收窄，而不是拉全量。

---

## 八、输出格式总则

1. **首行汇总**：`**📋 🟨 查询环境：测试 ｜ namespace：viptutor-test ｜ 服务：system ｜ 时间窗：2026-11-03T02:00Z ~ 02:15Z**`（色块按环境取）
2. **每段结果上方**：一行来源标记，形如 `> 🟨 **测试** · namespace viptutor-test · 服务 system · job viptutor-test/system · 时间窗 …`（标识符用反引号包裹，见第二节）
3. 结果用 Markdown 表格（时间 / 级别 / traceId / 摘要）；行数多时先汇总条数再贴关键行，不贴几百行原始日志。
4. 多环境对比：每段独立标注，不合并成一张来源不明的表。
5. 失败如实说明（超时 / 标签不存在 / 时间窗无数据），并给出可替代查法。
6. 展示前剥离 ANSI 颜色码；日志时间注明是 UTC 还是已换算 +8。

### 输出前自检（每次回答前默过一遍）

- [ ] 第一行是不是 `**📋 <色标> 查询环境：… ｜ namespace：… ｜ 服务：… ｜ 时间窗：…**`？
- [ ] 标的环境色标和**实际查询的 namespace** 一致吗？
- [ ] 每段结果上方都有 `> <色标> **<环境>** · namespace … · 服务 … · job … · 时间窗 …` 吗？
- [ ] 结果为空、报错、超时、只有条数汇总时，也标了吗？

四条缺一即为不合格输出，补齐后再回答。

### 反面示例（禁止）

```
❌ system 服务最近有 12 条 ERROR。
```

没有来源标记，无法判断是生产还是测试，这种回答不可接受。

```
❌ **📋 🟨 查询环境：测试 ｜ namespace：viptutor-test ｜ 服务：system**

> 🟥 **生产** · namespace `viptutor` · 服务 `system` · job `viptutor/viptutor-system`

| 时间 (UTC) | 级别 | 摘要 |
|---|---|---|
| 02:03:11 | ERROR | NullPointerException |
```

首行标测试、明细标生产，自相矛盾，说明标注是照抄意图而非实际查询。

### 正面示例

```
**📋 🟨 查询环境：测试 ｜ namespace：viptutor-test ｜ 服务：system ｜ 时间窗：2026-11-03T02:00Z ~ 02:15Z**

> 🟨 **测试** · namespace `viptutor-test` · 服务 `system` · job `viptutor-test/system` · 时间窗 `2026-11-03T02:00:00Z` ~ `2026-11-03T02:15:00Z`

| 时间 (UTC) | 级别 | traceId | 摘要 |
|---|---|---|---|
| 2026-11-03 02:03:11 | ERROR | `ae845915-…` | NullPointerException at … |
```

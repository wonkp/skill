---
name: database
description: 查询 viptutor 各环境的 MySQL 数据库。Use when the user wants to query or inspect database（查库、查表、看表结构、表数据量、慢查询、连接数、锁、索引、库大小、排查数据问题）across environments. 用户提到「生产/线上/prod」「测试/test/qa」「研发/dev/开发」「迁移/migrate」等关键字时，路由到对应的 mysql-dev / mysql-test / mysql-migrate / mysql-prod MCP server 只读查询。每条结果必须标明数据来源环境、库名与表名。连接信息一律引用全局配置 CLAUDE.md 的「数据库连接信息」表格，禁止在本 skill 内硬编码。
---

# MySQL 数据库查询

四个环境各有独立的 MCP server。**用户输入环境关键字 → 路由到对应 server → 查询 → 每条结果标注来源**。

> 🔑 **凭据来源**：本 skill **不保存任何 ip / 用户名 / 密码**。连接信息以全局配置 `C:\Users\wonkp\.claude\CLAUDE.md`「数据库连接信息（权威源）」表格为准（列为：数据库类型 | 地址 | 端口 | 用户名 | 密码 | 数据库名称）。表格与实际不符时先报告差异，不要猜测。

---

## 一、关键字路由表（第一步，必做）

| 环境关键字（含同义词） | MCP server | 工具名前缀 | 默认库 |
|---|---|---|---|
| **生产**、线上、正式、prod、production、live | `mysql-prod` | `mcp__mysql-prod__*` | `viptutor` |
| **测试**、test、qa、sit、测服 | `mysql-test` | `mcp__mysql-test__*` | `viptutor-test` |
| **研发**、开发、dev、develop、本地 | `mysql-dev` | `mcp__mysql-dev__*` | `viptutor-dev` |
| **迁移**、migrate、migration、数据迁移 | `mysql-migrate` | `mcp__mysql-migrate__*` | `viptutor_new9` |

路由规则：

1. **命中哪个关键字就调哪个 server**，不要在 `mysql-test` 上查生产数据，也不要跨 server 拼凑。
2. **同时提到多个环境**（如「对比生产和测试的订单数」）→ 分别调用各自 server，结果分开成段，每段独立标注来源。
3. **没有环境关键字**（如「查一下 edu_clazz 表」）→ **必须先问用户是哪个环境**，不得默认走某一个。这是一次例外允许的提问，因为选错环境会造成误判。
4. **用户直接给了库名**（如「查 viptutor_new9」）→ 按库名反推环境后再路由；库名归属见第三节。
5. 关键字有歧义时（如「dev 环境的生产库」）**先澄清**，不要自行取舍。

四个 server 已于 2026-10-27 全部验证连通。

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

> 色块用方形（🟥🟨🟩🟦）而非圆形（🔴🟡🟢🔵），因为方形色块面积大、饱和度一致，且与来源图标 🌟 的黄色不会混淆。

### 输出格式

每段查询结果的**紧邻上方**必须有一行来源标记，格式固定：

```
> 🌟 来源 ｜ 🟥 **生产** · 库 `viptutor` · 表 `trans_order`
```

多表 / 多库时逐行列出：

```
> 🌟 来源 ｜ 🟨 **测试** · 库 `viptutor-test` · 表 `edu_clazz`、`edu_clazz_student`
> 🌟 来源 ｜ 🟥 **生产** · 库 `viptutor` · 表 `edu_clazz`
```

整个回答的**首行**再给一次汇总：

```
**🌟 🟥 查询环境：生产 ｜ 库：viptutor ｜ 涉及表：edu_clazz、trans_order**
```

### 溯源硬性要求

1. **标注必须来自实际执行的查询**，不能照抄用户意图。`database` 参数传的是什么、SQL 里 `FROM` 的是哪张表，就标什么。
2. **没查过的库不许标**。例如只查了 `mysql-test`，就不能在结果里出现「生产」字样。
3. **`information_schema` 查询**的来源以 `WHERE TABLE_SCHEMA = '<库>'` 为准，因为此时 `database` 参数不决定数据范围。
4. **聚合/计算类结果也要标**（如「总行数 1234」），因为它同样来自某个库。
5. **失败也要标**：查询报错时写明「尝试查询 `<环境> · 库 X · 表 Y` 失败，原因：…」，便于定位是哪一层出的问题。
6. 若结果里混入了非预期库的数据（如 `mysql-test` 因默认库漂移落到了 `viptutor_new9`），**立即停下并报告**，不要当成用户要的数据。

---

## 三、库归属与可达性

| 库 | 归属环境 | 表数 | 估算行数 | 通过哪个 server 访问 |
|---|---|---|---|---|
| `viptutor-dev` | 研发 | — | — | `mysql-dev` |
| `viptutor-test` | 测试 | 401 | 8601 万 | `mysql-test` |
| `viptutor-test-xxl` | 测试（调度中心） | 8 | — | `mysql-test` |
| `viptutor_new9` | 迁移 | 399 | 2.48 亿 | `mysql-migrate` |
| `viptutor` | 生产 | — | — | `mysql-prod` |
| `agent-dev` | Agent 平台 | 46 | 2.4 万 | `mysql-test` / `mysql-dev` 均可见 |
| `viptutor_new8` | 同实例分库 | 349 | 2.08 亿 | `mysql-test` |
| `viptutor-migrate` | 历史迁移库 | 256 | 450 万 | `mysql-test` |
| `viptutor-migrate-xxl` | 历史调度中心 | 8 | — | `mysql-test` |

- `*_xxl` 是 XXL-JOB 调度中心库，各仅 8 张 `xxl_job_*` 表，只在查定时任务配置/执行日志时用。
- 服务器 MySQL **8.0.36**。

> ⚠️ **迁移库名与全局表格不一致**：全局表格「迁移」行写 `viptutor-new9`（横杠），该库**不存在**（实测 `ER_DBACCESS_DENIED_ERROR`）。`mysql-migrate` 实际连 **`viptutor_new9`（下划线）**，经用户 2026-10-27 确认。表格归用户维护，本 skill 不改；按表格查失败时回退到 `viptutor_new9`。

### 连接账号现状

| server | 实测 `CURRENT_USER()` | 权限性质 |
|---|---|---|
| `mysql-dev` | `viptutor_dev@%` | `ALL PRIVILEGES`，只读靠约定 |
| `mysql-test` | `viptutor_test@%` | `ALL PRIVILEGES`，只读靠约定 |
| `mysql-migrate` | `viptutor_test@%` | `ALL PRIVILEGES`，只读靠约定 |
| `mysql-prod` | `viptutor_r@100.0.0.0/8` | **只读账号**（阿里云 DMS 代理），服务端兜底 |

---

## 四、必守规则

### 4.1 每次调用必须显式传 `database`

MCP 服务端复用单一连接，会**记住最后一次使用的库**。实测：指定 `database=viptutor-migrate` 后，下一条不带 `database` 的查询直接落在 `viptutor-migrate`，`.claude.json` 里的 `MYSQL_DATABASE` 不再生效。

拆成四个 server 后**每个 server 内部行为不变**，且一个 server 能访问多库时（`mysql-test` 可见 6 个库）风险依旧。

- 每个 `execute_query` / `describe_table` / `list_tables` 都**必须**显式传 `database`。
- 只有纯 `information_schema` 查询（已用 `TABLE_SCHEMA` 限定）可省略，但仍建议传。

### 4.2 只读红线

1. 只用 4 个工具：各 server 下的 `list_databases`、`list_tables`、`describe_table`、`execute_query`。不要用 Bash 调 mysql 客户端绕开。
2. `execute_query` 只接受 SELECT / SHOW / DESCRIBE / EXPLAIN。以下即使以 SELECT 开头也**一律禁止**：
   - `SELECT ... INTO OUTFILE` / `INTO DUMPFILE`（写服务器文件）
   - `SELECT ... FOR UPDATE` / `FOR SHARE` / `LOCK IN SHARE MODE`（加锁）
   - 调用有副作用的函数/存储过程
   - `/*!50000 ... */` 注释绕过
3. `INSERT` / `UPDATE` / `DELETE` / `REPLACE` / `TRUNCATE` / `ALTER` / `DROP` / `CREATE` / `RENAME` / `GRANT` / `CALL` / `SET` 不执行，含 `WITH ... UPDATE/DELETE`。
4. 用户要改数据时：**输出 SQL 让用户自己执行**，不通过 MCP 落库。
5. **生产环境额外谨慎**：虽然 `mysql-prod` 是只读账号，仍不得尝试任何写操作探测；生产查询必须带 `LIMIT` 和索引条件。

### 4.3 库名含 `-` 必须加反引号

`` `viptutor-test`.edu_clazz ``、`` `viptutor-dev`.sys_user ``。

---

## 五、查询步骤

1. **解析关键字 → 选定 server**（第一节路由表）。
2. **无环境关键字 → 反问**，不要猜。
3. **确定库**：用默认库，或按用户指定的库名。
4. **首次连某环境跑一致性自检**（本次会话已确认过可跳过）：

   ```sql
   SELECT CURRENT_USER() AS conn_user, DATABASE() AS default_db,
          @@hostname AS host, @@port AS port, @@read_only AS ro;
   ```

   与第三节账号表比对，不一致立即停止并报告。

5. **不确定表名**：`SHOW TABLES LIKE '%关键字%'` 或查 `information_schema.TABLES`。
6. **看结构**：优先 `describe_table`；索引/字符集/注释用 `SHOW CREATE TABLE`、`SHOW INDEX FROM`。
7. **写查询**：显式传 `database`，明细必带 `LIMIT`（默认 20）和时间范围。
8. **输出时按第二节标注来源**。

---

## 六、注意事项

### 禁止对大表 COUNT(*)

`viptutor-test` / `new8` / `new9` 在 8600 万 ~ 2.5 亿行量级，`COUNT(*)` 会超时（跨库 COUNT 实测已直接 Timeout）。估算行数用：

```sql
SELECT TABLE_NAME, TABLE_ROWS, ROUND(DATA_LENGTH/1024/1024,1) AS data_mb,
       ROUND(INDEX_LENGTH/1024/1024,1) AS idx_mb, UPDATE_TIME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'viptutor-test' AND TABLE_NAME = 'edu_clazz';
```

`TABLE_ROWS` 是 InnoDB 估算值（有误差），但不扫表。确需精确值先确认表小（万级以下）再 `COUNT(*)`。

### 其他

- **超时**：MCP 侧超时较短，跨库 JOIN、大范围聚合极易超时。优先单库、带索引条件、分步查。
- **时区**：返回时间为 UTC。展示时说明是 UTC 还是已换算本地时间（+8）。
- **敏感字段**：`api_key`、密码、手机号、身份证等脱敏（`sk-****abc`、`138****1234`）。
- **备份/临时表多**：业务库有大量 `*_bak*`、`*_copy*`、`bak_*`、`tmp_*` 表，统计表清单时说明是否排除。

---

## 七、常用模板

> 下列模板中的 `<server>` 按路由结果替换为 `mysql-dev` / `mysql-test` / `mysql-migrate` / `mysql-prod`，`<db>` 替换为实际库名。

**表清单（按前缀过滤）**

```sql
SHOW TABLES LIKE 'edu_wrong%';
```

**库内大表排行**

```sql
SELECT TABLE_NAME, TABLE_ROWS, ROUND((DATA_LENGTH+INDEX_LENGTH)/1024/1024,1) AS total_mb, UPDATE_TIME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = '<db>'
ORDER BY DATA_LENGTH+INDEX_LENGTH DESC
LIMIT 20;
```

**索引情况**

```sql
SHOW INDEX FROM edu_clazz;
-- 或
SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols, NON_UNIQUE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = '<db>' AND TABLE_NAME = 'edu_clazz'
GROUP BY INDEX_NAME, NON_UNIQUE;
```

**当前连接 / 活跃会话**

```sql
SELECT ID, USER, HOST, DB, COMMAND, TIME, STATE, LEFT(INFO, 120) AS info
FROM information_schema.PROCESSLIST
WHERE COMMAND <> 'Sleep'
ORDER BY TIME DESC
LIMIT 20;
```

**锁等待**

```sql
SELECT * FROM performance_schema.data_lock_waits;
SELECT ENGINE_TRANSACTION_ID, OBJECT_SCHEMA, OBJECT_NAME, INDEX_NAME, LOCK_TYPE, LOCK_MODE, LOCK_STATUS
FROM performance_schema.data_locks LIMIT 50;
```

**慢查询 TOP**

```sql
SELECT DIGEST_TEXT, COUNT_STAR, ROUND(AVG_TIMER_WAIT/1e9,2) AS avg_ms,
       ROUND(MAX_TIMER_WAIT/1e9,2) AS max_ms, SUM_ROWS_EXAMINED
FROM performance_schema.events_statements_summary_by_digest
ORDER BY SUM_TIMER_WAIT DESC
LIMIT 20;
```

**最近更新的数据**

```sql
SELECT id, create_time, update_time FROM edu_clazz
WHERE update_time >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)
ORDER BY update_time DESC LIMIT 20;
```

---

## 八、输出格式总则

1. **首行汇总**：`**🌟 🟥 查询环境：生产 ｜ 库：viptutor ｜ 涉及表：trans_order**`（色块按环境取）
2. **每段结果上方**：`> 🌟 来源 ｜ 🟨 **测试** · 库 `viptutor-test` · 表 `trans_order``
3. 结果用 Markdown 表格；行数多时先汇总再 Top N，不贴几百行明细。
4. 多环境对比：每段独立标注，不合并成一张来源不明的表。
5. 失败如实说明（超时 / 无权限 / 表不存在 / 库名不符），并给出可替代查法。
6. 涉及写操作的请求：给出 SQL 并注明「需由你自己执行」，不通过 MCP 执行。

### 反面示例（禁止）

```
❌ 订单总数是 12345 条。
```
没有来源标记，无法判断是生产还是测试，这种回答不可接受。

### 正面示例

```
**🌟 🟥 查询环境：生产 ｜ 库：viptutor ｜ 涉及表：trans_order**

> 🌟 来源 ｜ 🟥 **生产** · 库 `viptutor` · 表 `trans_order`

| 统计项 | 值 |
|---|---|
| 订单总数 | 12345 |
```

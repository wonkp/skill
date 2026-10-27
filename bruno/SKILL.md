---
name: bruno
description: 用 /bruno 启动，根据 Java 接口（URL 或 Controller 类名/方法）生成 Bruno 请求文件，生成前会先确认参数粒度。
disable-model-invocation: true
---

# /bruno — Java 接口 → Bruno 请求文件

**用法**：`/bruno <接口 URL 或 Controller 类名/方法>`

```
/bruno /attendance/clazz/page          # 给 URL
/bruno AttendanceClazzController       # 给类名
/bruno CourseController#page           # 给类名#方法
/bruno 考勤监控分页                     # 给已有接口名
```

也可以直接粘贴 Java 代码。

从 Java Controller 源码产出可直接在 Bruno 里发送的 `.yml` 请求文件。

若 `/bruno` 后面没带目标，先反问要生成哪个接口，不要自己挑一个。

## 第零步：读取全局路径配置

**本 skill 不写死任何绝对路径**，两个目录都从全局配置取：

- 配置文件：全局 `~/.claude/CLAUDE.md`（Windows 为 `C:\Users\<用户名>\.claude\CLAUDE.md`）
- 配置段：「项目路径（skill 通用配置）」，形如

  ```markdown
  # 项目路径（skill 通用配置）

  - 源码仓库根：C:\IT\project\<源码仓库>
  - Bruno 集合根：C:\IT\project\<Bruno 集合目录>
  ```

| 配置项 | 记作 | 作用 |
|---|---|---|
| **源码仓库根** | `$SOURCE_ROOT` | 找 Controller、解析 DTO（只读） |
| **Bruno 集合根** | `$BRUNO_ROOT` | 生成 `.yml`，**恒定输出到这里**（写） |

取值顺序，先到先得：

1. 用户在本次 `/bruno` 里显式给了路径 → 以用户的为准，仅本次有效，**不要**改全局配置
2. 全局 `CLAUDE.md` 里的「项目路径」段 → 用它
3. 都没有 → **停下反问**用户要这两个路径，不要猜、不要回退到任何示例路径

> 全局 `CLAUDE.md` 的内容每轮对话都在上下文里，直接取用即可，不必额外读文件。内容里找不到「项目路径」段，即视为未配置，走第 3 条。
>
> 后续步骤里出现 `$SOURCE_ROOT` / `$BRUNO_ROOT` 的地方，一律按这里取到的实际值展开。

**源码仓库的定位**：当前工作目录若有 `pom.xml`，它就是 `$SOURCE_ROOT`；若没有（例如在 Bruno 目录里被调用），用配置里的「源码仓库根」。

**在 bash 里拼路径**：配置里是 Windows 风格（`C:\...`），直接用会被反斜杠转义吃掉，先转成 POSIX 形式：

```bash
BRUNO=$(cygpath -u '<Bruno 集合根的实际值>')   # C:\IT\project\X → /c/IT/project/X
```

## 第一步：定位接口

四种输入，先判断是哪种：

| 输入 | 做法 |
|---|---|
| **URL**（`/attendance/clazz/page`） | 在 `$SOURCE_ROOT` 下 Grep 路径片段（去掉开头 `/`，用最长的那段搜），在 `*Controller.java` 里定位 |
| **类名**（`AttendanceClazzController`） | 在 `$SOURCE_ROOT` 下 Glob `**/<类名>.java` |
| **类名#方法**（`CourseController#page`） | Glob 定位类，再读该方法的注解 |
| **粘贴的 Java 代码** | 直接读，不再检索 |

拿到 Controller 后，**必须**做的一件事：`@RequestMapping` 的类级路径 + 方法上的 `@GetMapping/@PostMapping/...` 拼出完整路径。方法级路径为空的用类级路径。

### 判据：哪些不该生成

| 特征 | 处理 |
|---|---|
| 类名含 `Rpc`（`TransApprovalRpcController`） | 跳过，是 gRPC/内部远程调用 |
| 包路径含 `.feign` | 跳过，是服务间 RPC 接口，不对 Web 暴露 |
| 类级路径以 `/rpc` 开头 | 跳过，同上 |
| `@SaIgnore` 标注 | **照常生成**，只是说明它不需要登录态 |

不确定某个 Controller 是否对 Web 暴露时，看它所在的模块有没有 `*-web` 兄弟模块依赖它（见下表）。

## 第二步：确定 URL 前缀

接口路径前面要挂环境变量，**不能**写死域名。映射规则按 Controller 所在的 Maven 模块推（下表路径均相对 `$SOURCE_ROOT`）：

| 源码模块目录 | URL 变量 | 服务 context-path |
|---|---|---|
| `pptutor-teaching/teaching-web`、`pptutor-teaching/teaching-research` | `{{teaching-url}}` | `/teaching-web` |
| `pptutor-sale/sale-web`、`pptutor-sale/sale-research`、`pptutor-sale/sale-common` | `{{sale-url}}` | `/sale-web` |
| `pptutor-system/system-web`、`system-api`、`system-base`、`msg-notify`、`permission-auth`、`ticket-approval`、`call-center` | `{{system-url}}` | `/system-base` |
| `pptutor-app/app-web` | 集合里没有变量 | context-path 为 `/` |

**变量名以集合里的实际值为准。** 表里是常见约定；生成前扫一眼 `$BRUNO_ROOT` 下的环境文件（`environments/*.bru`、`environments/*.yml`、`bruno.json`）确认变量名真的存在，不存在就说明该服务在集合里还没有对应变量，按 `app-web` 那一行的方式处理并告知用户。

**推导规则**：子模块（`*-research` / `*-common` / `msg-notify` 等）本身不启动服务，它们被同域的 `*-web` 依赖，所以 URL 变量取那个 `*-web` 的。环境变量值已经把 context-path 包含在内了 —— 例如测试环境 `teaching-url` = `https://test-api.mathplore.com/teaching-web`，所以 url 写成 `"{{teaching-url}}/attendance/clazz/page"` 就行，**不要再拼一次 `/teaching-web`**。

> **按 Maven 模块判，不要按包名判。** 包路径里的业务域名词会骗人：
>
> ```
> $SOURCE_ROOT/pptutor-teaching/teaching-research/.../adapter/sale/controller/HandoverController.java
> @RequestMapping("/handover")
> ```
>
> 包里的 `sale` 是业务域（销售业务），但这个类的模块是 `teaching-research`，而 `teaching-web` 依赖它 —— 所以它暴露在 **teaching-web** 下，URL 用 `{{teaching-url}}/handover/...`。同理 `sale-research` 下 `customer/`、`order/` 等各种包名，一律按 `sale-web` 走。

拿不准 `*-web` 是不是真的依赖了那个子模块，读 `*-web/pom.xml` 确认：

```bash
grep -A2 "artifactId>$MODULE" "$SOURCE_ROOT/pptutor-teaching/teaching-web/pom.xml"
```

## 第三步：解析参数

逐个方法参数判断它落到 URL 的哪一部分：

| Java 写法 | 落到 yml 的 |
|---|---|
| `@RequestParam Long studentId` | `params` 里 `type: query` |
| `@RequestParam(required = false, defaultValue = "1")` | 同上，`value` 用 default 值 |
| 无注解的简单类型（`Long clazzId`） | 同上，Spring 当 query 处理 |
| `@PathVariable Long id` | `url` 里写 `:id` 占位，`params` 里 `type: path` |
| `@RequestBody XxxReq req` | `body.type: json` |
| `@RequestBody List<Xxx> req` | `body.type: json`，顶层是数组 |
| `MultipartFile file` / `@RequestPart` | `body.type: multipart-form` |
| `@Valid` / `@Validated` | 不影响 yml，只是校验 |

`@RequestBody` 是**必查**项：它决定了 body 类型，而 `PageRequest` 这类父类字段最容易漏。GET 请求也可能有 body（少见但合法），按注解走，不要按 method 猜。

**路径参数要换写法**：Spring 的占位符是花括号，Bruno 用冒号。两种 Java 写法都要转：

| Java | Spring URL | Bruno URL |
|---|---|---|
| `@GetMapping("/is/update/{parentId}")` + `@PathVariable Long parentId` | `/is/update/{parentId}` | `/is/update/:parentId` |
| `@PostMapping("/detail/{id}")` + `@PathVariable("id") Long clazzId` | `/detail/{id}` | `/detail/:id` |

第二种容易看错：`@PathVariable("id")` 括号里的才是 URL 上的名字，变量名 `clazzId` 只是 Java 侧的标识。**以括号里的为准**，没写括号就用参数名。

### 追 DTO 继承链

`@RequestBody` 的参数类型要**沿 `extends` 一路向上追到底**，父类字段全部算数。这是最容易出错的地方：

```java
AttendanceClazzPageReq extends AttendanceClazzFilterReq extends PageRequest
//                                     ↑ 25 个筛选字段        ↑ page / pageSize / pageFlag
```

`com.pptutor.cloud.base.dto.PageRequest` 提供 `page`（默认 1）、`pageSize`（默认 10），分页接口务必带上。

### 字段 → 示例值

| Java 类型 | 生成的 JSON 值 |
|---|---|
| `Long` / `Integer` / `int` | 数字，如 `1` |
| `String` | `""` 或注释里给的示例；`parentAccount` 这类带格式的用 `"86-13488802221"` |
| `Boolean` / `boolean` | `true` / `false` |
| `LocalDateTime` / `Date` | **数字时间戳**（如 `1784622999000`）。框架配了 `LocalDateTimeToTimestampSerializer`，反序列化同时接受时间戳与 ISO 字符串 |
| `LocalDate` | `"yyyy-MM-dd"` 字符串 |
| `LocalTime` 且带 `@JsonFormat(pattern = "HH:mm")` | `"HH:mm"` 字符串，如 `"09:00"` |
| `BigDecimal` | **字符串**，如 `"26817.00"`（框架用 `ToStringSerializer`） |
| `List<T>` | 数组，给 1~2 个元素 |
| 嵌套对象 | 展开成嵌套 JSON |
| `Map<String, Object>` | `{}` |

**枚举/状态字段的取值直接从 Javadoc 注释抄**，这是白捡的准确信息：

```java
/** 课堂状态：1-待上课，2-上课中，3-已上课，4-已取消 */
private Integer clazzStatus;
```

看到 `@InEnum` 注解则以枚举类为准，它指明了取值来源：

```java
@InEnum(enumType = BoolEnum.class, message = "是否启用枚举值不正确")
private Integer validFlag;
// → BoolEnum { FALSE(0,"否"), TRUE(1,"是") }  → 值填 1
```

生成时在字段值旁边保留这层语义。若原 DTO 既无注释也无 `@InEnum`，值给 `1` 并在回复里说明「取值含义需确认」。

需要看完整的「源码 → yml」对照时，读 [`EXAMPLES.md`](EXAMPLES.md)：四类形态各一个实例（GET+query、POST+继承链 DTO、路径参数、新建目录），含逐项推导依据。

## 第四步：确认参数粒度（生成前的门禁）

**这一步是硬门禁，不能跳过。**

用户在这次 `/bruno` 里**已经明确说了**粒度（「全量」「只要必填」「最小可跑」「只给 xxx 字段」）→ 直接进第五步。

**没说** → 先反问，用 AskUserQuestion 给出选项，**等到用户答复再生成**：

| 选项 | 含义 |
|---|---|
| 全量字段 | 按继承链铺开所有字段，含嵌套对象与集合 |
| 只要必填 | 仅 `@NotNull` / `@NotBlank` / `@NotEmpty` 字段 + 分页参数 |
| 最小可跑 | 必填字段 + 有 Javadoc 示例的字段 |

反问时带上实情帮用户判断，例如：「`CoursePageReq` 连父类共 11 个字段，要全量还是只留必填？」

> **反问后不许先斩后奏。** 在同一个回合里既问又写文件，等于没问。问完就停，等用户答。
>
> 例外：用户已经指定粒度时不要多此一问。

集合里两种风格都有（`考情监控分页.yml` 只写 6 个字段，`退费提交.yml` 铺满整层），所以粒度是用户偏好，没有默认值可猜。

## 第五步：写文件

模板（照抄这个结构，字段顺序别改）：

```yaml
info:
  name: <中文接口名>
  type: http
  seq: <N>

http:
  method: POST
  url: "{{teaching-url}}/attendance/clazz/page"
  body:
    type: json
    data: |-
      {
        "clazzStatus": 1,
        "pageSize": 10,
        "page": 1
      }
  auth: inherit

settings:
  encodeUrl: true
  timeout: 0
  followRedirects: true
  maxRedirects: 5
```

要点：

- **`auth: inherit`** —— 集合级已配好 `authorization: {{token}}`，请求前脚本自动登录填充，不要自己写 headers。
- **只有第三方接口**（企业微信、dify 这类不带 token 的）才省掉 `auth: inherit`，并显式写 `headers` 与 `forwardAuthorizationHeader: false`。
- `forwardAuthorizationHeader: true` 用于把本服务的 token 透传给下游服务；普通接口可省略（集体现状：多数文件省略了它）。
- **GET 的 query 参数**用 `params` 数组，`type: query`；**POST 的 JSON 参数**一律进 body，不要写进 params。

### 接口名

优先取 Controller 方法上的 Swagger 注解 `@Tag` / `@Operation(summary=...)`，没有就取方法的 Javadoc 第一句，再没有才用方法名。用中文，短，与集合里已有风格一致（`考情监控分页`、`退费提交`、`触发CC报告`）。

### seq 与落盘位置

`seq` 取**整个集合当前的全局最大 seq + 1**（`$BRUNO_ROOT` 按第零步取值，bash 里先 `cd` 过去或用 `cygpath` 转换）：

```bash
grep -rh "  seq: " "$BRUNO_ROOT" --include="*.yml" | awk '{print $2}' | sort -n | tail -1
```

集合为空或 grep 无输出时，从 `1` 开始。

文件放哪（以下目录均在 `$BRUNO_ROOT` 下）：

- 能归入已有中文目录就放进去 —— `考勤监控/`、`资料管理/`、`退费/`、`企业微信/`
- 新开子目录时，**必须**同时建 `folder.yml`，否则 Bruno 读不到：

  ```yaml
  info:
    name: <目录名>
    type: folder
    seq: <N>

  request:
    auth: inherit
  ```

- 归不进任何目录的放集合根目录

文件名用接口名，如 `考勤监控/考情监控分页.yml`。**不要覆盖同名文件** —— 先看目标路径是否已存在，存在就改用户的文件之前先问一句。

## 完成前自查

逐条对，有一条不过就不要说完成了：

- [ ] 参数粒度已由用户明确指定；未指定时已反问并**等到了答复**（没有边问边写）
- [ ] `$SOURCE_ROOT` / `$BRUNO_ROOT` 取自全局 `CLAUDE.md`「项目路径」段（或用户本次显式指定），**没有**凭记忆套用示例路径
- [ ] 用到的 `{{xxx-url}}` 变量在 `$BRUNO_ROOT` 的环境文件里真实存在
- [ ] URL 的变量前缀与 Controller 所在模块对得上（teaching / sale / system）
- [ ] `url` 里**没有**重复拼 context-path
- [ ] 是 RPC / Feign 接口的话已经排除，没生成文件
- [ ] 路径参数在 `url` 里是 `:name` 形式，且在 `params` 里有 `type: path` 的对应项
- [ ] `@RequestBody` 的 DTO 继承链**追到底**了，父类字段没漏
- [ ] 时间字段用数字时间戳，`BigDecimal` 用字符串
- [ ] `auth: inherit` 在（除非是第三方接口）
- [ ] `seq` 是全集合唯一且最大的，没和现有文件撞
- [ ] 新建子目录时有配套 `folder.yml`
- [ ] 目标路径原本不存在（或已跟用户确认过要覆盖）

最后向用户报告：文件写到了哪个绝对路径、`seq` 取了多少、URL 是怎么从模块推出来的、哪些字段的示例值需要他替换成真实数据。

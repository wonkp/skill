# 对照示例：从源码到 yml

一个真实的完整案例，覆盖本集合里最常见的两种形态（纯 query 的 GET、带继承链 DTO 的 POST）。

> 下文所有源码路径都相对 `$SOURCE_ROOT`，`Bruno/` 目录指 `$BRUNO_ROOT`。两者的取值见 `SKILL.md` 第零步（全局 `CLAUDE.md` 的「项目路径」段），示例里的目录结构只是示意。

---

## 案例 A：GET + query 参数

### 源码

`pptutor-teaching/teaching-research/.../adapter/teaching/controller/ClazzPlaybackRecordController.java`

```java
@RestController
@RequiredArgsConstructor
@RequestMapping("/playback")
public class ClazzPlaybackRecordController {

    @GetMapping("/agentAnalysis")
    @SaIgnore
    public RestResult<String> agentAnalysis(@RequestParam Long clazzId) {
        ...
    }
}
```

### 推导

| 项 | 值 | 依据 |
|---|---|---|
| 完整路径 | `/playback/agentAnalysis` | 类级 `/playback` + 方法级 `/agentAnalysis` |
| URL 变量 | `{{teaching-url}}` | 模块是 `teaching-research`，被 `teaching-web` 依赖 |
| 参数位置 | query | `@RequestParam` |
| 认证 | 照常生成 | `@SaIgnore` 只表示不需登录态，不影响是否生成 |
| 接口名 | 触发CC报告 | 集合里已有此接口，沿用既有命名 |

### 产物

```yaml
info:
  name: 触发CC报告
  type: http
  seq: 22

http:
  method: GET
  url: "{{teaching-url}}/playback/agentAnalysis?clazzId=7232247"
  params:
    - name: clazzId
      value: "7232247"
      type: query
  auth: inherit

settings:
  encodeUrl: true
  timeout: 0
  followRedirects: true
  maxRedirects: 5
  forwardAuthorizationHeader: false
```

---

## 案例 B：POST + 继承链 DTO

### 源码

`CourseController.java`

```java
@RestController
@RequestMapping("/course")
public class CourseController {

    /** 分页查询 */
    @PostMapping("/page")
    public RestResult<PageResult<Course>> page(@Valid @RequestBody CoursePageReq req) {
```

`CoursePageReq.java` —— **两条继承边都要追**：

```java
@Data
@EqualsAndHashCode(callSuper = true)
public class CoursePageReq extends PageRequest {

    /** 课程分类字典数值 */
    private Integer courseCategory;

    /** 名称 */
    private String name;

    /**
     * 是否启用
     * @see BoolEnum
     */
    @InEnum(enumType = BoolEnum.class, message = "是否启用枚举值不正确")
    private Integer validFlag;

    /** 操作人ID */
    private Long updateUserId;

    /** 操作时间-开始 */
    private LocalDateTime startTime;

    /** 操作时间-结束 */
    private LocalDateTime endTime;

    /** 操作时间排序值:默认倒序-DESC;正序-ASC */
    @InEnum(enumType = SortEnum.class, message = "操作时间排序值非法")
    private String timeSorted;

    /** ID排序值:默认倒序-DESC;正序-ASC */
    @InEnum(enumType = SortEnum.class, message = "ID排序值非法")
    private String idSorted;
}
```

父类 `com.pptutor.cloud.base.dto.PageRequest`：

```java
public class PageRequest implements Serializable {
    @Min(value = 1, message = "当前页码不合法")
    private int page = 1;          // 默认 1

    @Min(value = 1, message = "每页展示数量不合法")
    private int pageSize = 10;     // 默认 10

    private int offset;            // getter 里算出来，不用传

    private boolean pageFlag = true;
}
```

枚举经 `@InEnum` 指路后读到：

```java
public enum BoolEnum implements BaseEnum<Integer> { FALSE(0, "否"), TRUE(1, "是"); }
public enum SortEnum implements BaseEnum<String> { ASC("ASC", "正序"), DESC("DESC", "倒序"); }
```

### 推导要点

| 项 | 值 | 依据 |
|---|---|---|
| 完整路径 | `/course/page` | 类级 `/course` + 方法级 `/page` |
| body 类型 | `json` | `@RequestBody` |
| `validFlag` | `1` | `BoolEnum.TRUE` |
| `timeSorted` / `idSorted` | `"DESC"` | Javadoc 说默认倒序 |
| `startTime` / `endTime` | 数字时间戳 | `LocalDateTime`，框架配了 `LocalDateTimeToTimestampSerializer` |
| `offset` | **不生成** | 派生字段，只有 getter 无 setter |
| `page` / `pageSize` / `pageFlag` | `1` / `10` / `true` | 来自父类 `PageRequest`，用默认值 |

### 产物

```yaml
info:
  name: 课程分页
  type: http
  seq: 26

http:
  method: POST
  url: "{{teaching-url}}/course/page"
  body:
    type: json
    data: |-
      {
        "courseCategory": 1,
        "name": "",
        "validFlag": 1,
        "updateUserId": 1,
        "startTime": 1784622999000,
        "endTime": 1784622999000,
        "timeSorted": "DESC",
        "idSorted": "DESC",
        "page": 1,
        "pageSize": 10,
        "pageFlag": true
      }
  auth: inherit

settings:
  encodeUrl: true
  timeout: 0
  followRedirects: true
  maxRedirects: 5
```

---

## 案例 C：路径参数（花括号 → 冒号）

### 源码

`HandoverController.java`（**注意包路径里的 `sale` 是业务域，不是服务**）

```java
// 文件位于 pptutor-teaching/teaching-research/.../adapter/sale/controller/
@RequestMapping("/handover")
public class HandoverController {

    @SaIgnore
    @GetMapping("/is/update/{parentId}")
    public RestResult<Boolean> isUpdateSorkClazzStatus(@PathVariable Long parentId) {
```

### 推导

`{parentId}` 换成 `:parentId`，并在 `params` 里补一条 `type: path`。URL 变量仍是 `{{teaching-url}}` —— 包名里的 `sale` 是业务域，这个类的 Maven 模块是 `teaching-research`。

### 产物

```yaml
info:
  name: 查询是否可修改排课状态
  type: http
  seq: 26

http:
  method: GET
  url: "{{teaching-url}}/handover/is/update/:parentId"
  params:
    - name: parentId
      value: "0"
      type: path
  auth: inherit

settings:
  encodeUrl: true
  timeout: 0
  followRedirects: true
  maxRedirects: 5
```

---

## 案例 D：新建子目录

新开目录时必须同时建 `folder.yml`，否则 Bruno 不显示（目录整体位于 `$BRUNO_ROOT` 下）：

```
$BRUNO_ROOT/
├── 课程管理/
│   ├── folder.yml          ← 必须有
│   └── 课程分页.yml
```

```yaml
# folder.yml
info:
  name: 课程管理
  type: folder
  seq: 26

request:
  auth: inherit
```

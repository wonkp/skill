// tice 提测邮件 Markdown 生成器
// 用法：node render.js <data.json> <output.md>
// data.json 结构见 SKILL.md「输出」一节与 example-data.json。
//
// 结构约定（改动前务必读）：
// 1. 章节用 `## `，子分组用 `### `（如【前端】【Nacos 配置】）
// 2. 条目用 `- ` 无序列表，标签加粗（`- **标签**：说明`），不用 1./①，方便逐行改字
// 3. Nacos 配置固定用 ```yaml 代码块（分层缩进 + 行内 # 注释），其余类别用列表
// 4. SQL 用 ```sql 代码块，升级与回滚必须在同一块内
// 5. 章节顺序：需求信息 → 提测内容 → 测试范围 → 部署内容 → 配置文件 → SQL 脚本 → 遗留问题 → 代码审核
// 6. 不使用表格：邮箱与聊天窗口里表格易变形，全部用列表

const fs = require('fs');

// `## 需求信息`
const H = (t) => `## ${t}`;

// `- **标签**：说明`
const item = (label, text) => `- **${label}**：${text}`;

// `- 键：值`（键名不加粗，用于产品/项目名称这类元信息）
const plain = (k, v) => `- ${k}：${v}`;

const items = (rows) => rows.map(([k, v]) => item(k, v)).join('\n');
const plains = (rows) => rows.map(([k, v]) => plain(k, v)).join('\n');

const code = (lang, lines) => ['```' + lang, ...lines, '```'].join('\n');

// ---------------- 正文组装 ----------------
function buildBody(d) {
  const out = [];

  out.push('尊敬的各位领导、同事:');
  out.push('');
  out.push(`我们非常高兴地通知您，经过研发团队的不懈努力，《${d.title}》现已完成开发阶段，准备进入代码测试阶段。`);

  // 需求信息
  out.push('', H('需求信息'), '');
  out.push(plains([
    ['产品', d.product || '{待补充：产品}'],
    ['需求地址', d.reqUrl || '{待补充：需求地址}'],
    ['原型地址', d.protoUrl || '{待补充：原型地址}'],
  ]));

  // 提测内容
  out.push('', H('提测内容'), '');
  out.push(items(d.changes || []));

  // 测试范围
  out.push('', H('测试范围'), '');
  out.push(items(d.tests || []));

  // 部署内容
  out.push('', H('部署内容'), '');
  out.push('### 【前端】', '');
  out.push(plains(d.front || [['项目名称', '无']]));
  out.push('', '### 【后端】', '');
  out.push(plains(d.back || []));

  // 配置文件
  out.push('', H('配置文件'), '');
  if (!d.configs || d.configs.length === 0) {
    out.push('无');
  } else {
    d.configs.forEach((g, idx) => {
      if (idx > 0) out.push('');
      out.push(`### ${g.title}`, '');
      if (g.dataId) {
        out.push(`dataId：${g.dataId}　group：${g.group || 'DEFAULT_GROUP'}`, '');
      }
      // Nacos 固定 YAML 块；其余类别用列表
      if (g.yaml && g.yaml.length) {
        out.push(code('yaml', g.yaml));
      } else {
        if (/nacos/i.test(g.title)) {
          console.error('警告：Nacos 配置必须以 yaml 数组提供（格式已固定为 YAML）');
        }
        out.push(items(g.items || []));
      }
    });
  }

  // SQL
  out.push('', H('SQL 脚本'), '');
  if (!d.sql || d.sql.length === 0) {
    out.push('无');
  } else {
    out.push(code('sql', d.sql));
    if (d.sqlNote) out.push('', `> ${d.sqlNote}`);
  }

  // 遗留问题
  out.push('', H('遗留问题'), '');
  out.push(d.legacy && d.legacy.length ? items(d.legacy) : '- 无：本次无遗留问题。');

  // 代码审核
  out.push('', H('代码审核'), '');
  if (!d.audit) {
    out.push('无');
  } else {
    out.push(d.audit.summary);
    out.push('');
    out.push(items([
      ['高风险', d.audit.high || '无'],
      ['中风险', d.audit.mid || '无'],
      ['处理情况', d.audit.done || '无'],
    ]));
  }

  return out.join('\n') + '\n';
}

// ---------------- CLI ----------------
if (require.main === module) {
  const [dataPath, outPath] = process.argv.slice(2);
  if (!dataPath || !outPath) {
    console.error('用法: node render.js <data.json> <output.md>');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const md = buildBody(data);
  fs.writeFileSync(outPath, md, 'utf8');

  const sections = (md.match(/^## /gm) || []).length;
  const tables = (md.match(/^\s*\|/gm) || []).length;
  console.log(`written: ${outPath}  ${Buffer.byteLength(md)} bytes  sections=${sections} table-rows=${tables}`);
  if (sections !== 8) console.error(`警告：章节数为 ${sections}，应为 8（需求信息/提测内容/测试范围/部署内容/配置文件/SQL 脚本/遗留问题/代码审核）`);
  if (tables > 0) console.error('警告：产出含表格行，请改为列表');
}

module.exports = { buildBody };

// tice 提测邮件 HTML 生成器（企业微信邮箱 / 亮暗双主题友好）
// 用法：node render.js <data.json> <output.html>
// data.json 结构见 SKILL.md「HTML 输出」一节；未提供的字段按占位符规则处理。
//
// 设计约束（改动前务必读）：
// 1. 零 <table>：企业微信邮箱会清洗表格样式，全部改用 <p> + 悬挂/整块缩进。
// 2. 正文不写 color：继承客户端主题色，白底黑字、深底白字都正常。
// 3. 强调色用中间明度 #239292（白底 3.75:1 / 深底 4.44:1），两端代价均衡。
// 4. 全文只有一种线色 #239292，章节线与页脚线完全一致。
// 5. SQL 块无边框无底色，只靠等宽字体区分。
// 6. 字号统一 15px（正文/配置/SQL 一致），章节标题 17px。

const fs = require('fs');
const path = require('path');

// ---------------- 设计令牌：只需改这里 ----------------
const T = {
  accent: '#239292',      // 主强调色：章节标题、条目小标题、页码、姓名
  accentSoft: '#7c8794',  // 次级：键名（产品/项目名称）、公司名、注释
  fs: '15px',             // 统一字号
  fsH: '17px',            // 章节标题
  fsNote: '14px',         // 注释
  fsFootSmall: '13px',    // 页脚公司名
  fsFootName: '17px',     // 页脚姓名
  lineH: '1.9',
  pagePad: '40px 44px',
  pageWidth: '860px',
  indent: '1.8em',        // 整块缩进
  fontStack: "'Microsoft YaHei','PingFang SC',Arial,sans-serif",
  monoStack: "'Consolas','Courier New',monospace",
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const P = (t, st) => `<p style="${st}">${t}</p>`;

// 章节标题：teal 1px 上分割线 + 17px 加粗 + 字距 1.5px
const H = (t) =>
  `<p style="margin:32px 0 14px;padding:10px 0 0 0;border-top:1px solid ${T.accent};font-size:${T.fsH};font-weight:700;color:${T.accent};line-height:1.5;letter-spacing:1.5px">${esc(t)}</p>`;

// 条目：整块缩进、无序号、小标题只变色不加粗
// 注意：label 与 text 均在此处转义，调用方不要重复 esc（否则出现 &amp;lt;）
const item = (label, text) =>
  `<p style="margin:0 0 9px;padding-left:${T.indent};font-size:${T.fs};line-height:${T.lineH}"><span style="color:${T.accent}">${esc(label)}：</span>${esc(text)}</p>`;

// 键值行：键名用次级色（产品、项目名称、分支名称等）
const plain = (k, v) =>
  `<p style="margin:0 0 6px;padding-left:${T.indent};font-size:${T.fs};line-height:${T.lineH}"><span style="color:${T.accentSoft}">${esc(k)}：</span>${esc(v)}</p>`;

const items = (rows) => rows.map(([k, v]) => item(k, v)).join('\n  ');
const plains = (rows) => rows.map(([k, v]) => plain(k, v)).join('\n  ');

// 子标题【前端】【Nacos 配置】等：加粗，可选附注（如 dataId）
const SUB = (t, extra = '') =>
  `<p style="margin:20px 0 9px;font-size:${T.fs};font-weight:700;color:${T.accent};letter-spacing:0.5px">${esc(t)}${extra}</p>`;

// 代码块（SQL / YAML 共用）：等宽、无边框、无底色；空行用 &nbsp; 占位，行首空格转 &nbsp; 保持缩进
const codeBlock = (lines) => {
  const body = lines
    .map((l) => (l === '' ? '&nbsp;' : esc(l).replace(/ /g, '&nbsp;')))
    .join('<br>');
  return `<p style="margin:0;font-family:${T.monoStack};font-size:${T.fs};line-height:1.75">${body}</p>`;
};
const sqlBlock = codeBlock;

// ---------------- 页脚：线上分割线与章节线同色同粗细 ----------------
const footer = (f) => `
  <p style="margin:36px 0 0;padding:10px 0 0 0;border-top:1px solid ${T.accent};height:0;font-size:0;line-height:0">&nbsp;</p>
  <p style="margin:15px 0 0;font-size:${T.fsFootSmall};font-weight:700;line-height:18px;color:${T.accentSoft};letter-spacing:0.5px;font-family:${T.fontStack}"><a href="${f.corpUrl}" target="_blank" style="color:${T.accentSoft};text-decoration:none">${esc(f.company)}</a>&nbsp;<img width="14" height="14" style="width:14px;height:14px;vertical-align:-1px" src="https://rescdn.qqmail.com/node/wwqy/qymng/style/images/sass/independent/card_verify_full.png">&nbsp;<img width="7" height="11" style="width:7px;height:11px;vertical-align:0" src="https://rescdn.qqmail.com/node/wwqy/qymng/style/images/sass/independent/card_more.png"></p>
  <p style="margin:8px 0 0;font-size:${T.fsFootName};line-height:24px;font-family:${T.fontStack}"><a href="${f.userUrl}" target="_blank" style="color:${T.accent};text-decoration:none;font-weight:700">${esc(f.name)}</a>　<span style="color:${T.accentSoft};font-size:${T.fs}">${esc(f.title)}</span>&nbsp;<img width="22" height="22" style="width:22px;height:22px;vertical-align:-5px" src="https://rescdn.qqmail.com/node/wwqy/qymng/style/images/sass/independent/card_logo.png"></p>`;

// ---------------- 正文组装 ----------------
function buildBody(d) {
  const parts = [];

  // 抬头
  parts.push(`  <p style="margin:0 0 18px;font-size:${T.fs}">尊敬的各位领导、同事:</p>`);
  parts.push(`  <p style="margin:0 0 4px;text-indent:2em;font-size:${T.fs}">我们非常高兴地通知您，经过研发团队的不懈努力，《${esc(d.title)}》现已完成开发阶段，准备进入代码测试阶段。</p>`);

  // 需求信息
  parts.push('', `  ${H('需求信息')}`);
  parts.push('  ' + plains([['产品', d.product], ['需求地址', d.reqUrl], ['原型地址', d.protoUrl]]));

  // 提测内容
  parts.push('', `  ${H('提测内容')}`);
  parts.push('  ' + items(d.changes));

  // 测试范围
  parts.push('', `  ${H('测试范围')}`);
  parts.push('  ' + items(d.tests));

  // 部署内容
  parts.push('', `  ${H('部署内容')}`);
  parts.push(`  ${SUB('【前端】')}`);
  parts.push('  ' + plains(d.front));
  parts.push(`  ${SUB('【后端】')}`);
  parts.push('  ' + plains(d.back));

  // 配置文件：无配置变更时整块只留「无」，不输出子标题
  parts.push('', `  ${H('配置文件')}`);
  if (!d.configs || d.configs.length === 0) {
    parts.push(`  <p style="margin:0 0 6px;padding-left:${T.indent};font-size:${T.fs};line-height:${T.lineH}">无</p>`);
  } else {
    d.configs.forEach((g) => {
      const extra = g.dataId
        ? `　<span style="font-weight:400;color:${T.accentSoft};letter-spacing:0">dataId: ${esc(g.dataId)} / group: ${esc(g.group || 'DEFAULT_GROUP')}　格式：YAML</span>`
        : '';
      parts.push(`  ${SUB(g.title, extra)}`);
      // Nacos 配置固定用 YAML 块（分层缩进 + 行内 # 注释），其余类别用键值行
      if (g.yaml && g.yaml.length) {
        parts.push('  ' + codeBlock(g.yaml));
      } else {
        if (/nacos/i.test(g.title)) {
          console.error('警告：Nacos 配置必须以 yaml 数组提供（格式已固定为 YAML）');
        }
        parts.push('  ' + items(g.items || []));
      }
    });
  }

  // SQL 脚本：升级 + 回滚必须同时存在
  parts.push('', `  ${H('SQL 脚本')}`);
  if (!d.sql || d.sql.length === 0) {
    parts.push(`  <p style="margin:0;font-size:${T.fs};line-height:${T.lineH}">无</p>`);
  } else {
    parts.push('  ' + sqlBlock(d.sql));
    if (d.sqlNote) {
      parts.push(`  ${P(esc(d.sqlNote), `margin:10px 0 0;font-size:${T.fsNote};line-height:${T.lineH};color:${T.accentSoft}`)}`);
    }
  }

  // 遗留问题 → 代码审核
  parts.push('', `  ${H('遗留问题')}`);
  parts.push('  ' + (d.legacy && d.legacy.length ? items(d.legacy) : items([['无', '本次无遗留问题。']])));

  parts.push('', `  ${H('代码审核')}`);
  if (!d.audit) {
    parts.push(`  <p style="margin:0 0 6px;padding-left:${T.indent};font-size:${T.fs};line-height:${T.lineH}">无</p>`);
  } else {
    parts.push(`  ${P(esc(d.audit.summary), `margin:0 0 10px;font-size:${T.fs};line-height:${T.lineH}`)}`);
    parts.push('  ' + items([
      ['高风险', d.audit.high || '无'],
      ['中风险', d.audit.mid || '无'],
      ['处理情况', d.audit.done || '无'],
    ]));
  }

  parts.push('', footer(d.footer));

  return `<div id="copy-src" style="max-width:${T.pageWidth};margin:0 auto;background:#ffffff;padding:${T.pagePad};font-family:${T.fontStack};font-size:${T.fs};line-height:${T.lineH}">
${parts.join('\n')}
</div>`;
}

// ---------------- 页面外壳：预览壳 + 一键复制 ----------------
function buildPage(d) {
  const stage = buildBody(d);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>提测邮件 · ${esc(d.title)}</title></head>
<body style="margin:0;padding:20px;background:#eef1f5;font-family:'Microsoft YaHei',Arial,sans-serif">

<div style="max-width:${T.pageWidth};margin:0 auto 14px;font-size:13px;color:#555;line-height:1.9">
  <div style="margin-top:2px">
    <button id="btn" style="font-size:15px;padding:8px 20px;cursor:pointer;border:1px solid ${T.accent};background:${T.accent};color:#fff;border-radius:4px">复制全文（正文 + 页脚）</button>
    <button id="theme" style="font-size:15px;padding:8px 20px;cursor:pointer;border:1px solid #c8d0dc;background:#fff;color:#333;border-radius:4px;margin-left:8px">切换暗色预览</button>
    <span id="tip" style="margin-left:12px;font-weight:bold"></span>
  </div>
  <div style="margin-top:6px;color:#c0392b;font-size:12px"><b>注意：</b>企微邮箱发信会自动追加账号签名，用这份页脚前先去邮箱设置关掉，否则末尾两条。</div>
</div>

<div id="stage" style="max-width:${T.pageWidth};margin:0 auto;background:#eef1f5;border-radius:6px">
${stage}
</div>

<script>
var dark = false;
var stage = document.getElementById('stage');
var body = document.getElementById('copy-src');
var themeBtn = document.getElementById('theme');

themeBtn.onclick = function () {
  dark = !dark;
  if (dark) {
    stage.style.background = '#1e1e1e';
    body.style.background = '#1e1e1e';
    body.style.color = '#e6e8ea';
    themeBtn.textContent = '切换亮色预览';
  } else {
    stage.style.background = '#eef1f5';
    body.style.background = '#ffffff';
    body.style.color = '';
    themeBtn.textContent = '切换暗色预览';
  }
};

document.getElementById('btn').onclick = function () {
  // 复制前先恢复亮色，避免把暗色预览背景一起复制走
  var needRestore = dark;
  if (needRestore) {
    body.style.background = '#ffffff';
    body.style.color = '';
  }
  var range = document.createRange();
  range.selectNodeContents(body);
  var sel = window.getSelection();
  sel.removeAllRanges(); sel.addRange(range);
  var ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  sel.removeAllRanges();
  if (needRestore) {
    body.style.background = '#1e1e1e';
    body.style.color = '#e6e8ea';
  }
  var tip = document.getElementById('tip');
  tip.style.color = ok ? '#1e7b34' : '#c0392b';
  tip.textContent = ok ? '✅ 已复制，去企业微信邮箱按 Ctrl+V' : '❌ 复制被拦截，请手动拖选正文后 Ctrl+C';
};
</script>
</body>
</html>`;
}

// ---------------- CLI ----------------
if (require.main === module) {
  const [dataPath, outPath] = process.argv.slice(2);
  if (!dataPath || !outPath) {
    console.error('用法: node render.js <data.json> <output.html>');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  // 页脚默认值：必须是用户本人信息，未提供时留占位符，不许编造
  data.footer = data.footer || {};
  data.footer.company = data.footer.company || '{待补充：公司名称}';
  data.footer.name = data.footer.name || '{待补充：姓名}';
  data.footer.title = data.footer.title || '{待补充：职位}';
  data.footer.corpUrl = data.footer.corpUrl || '#';
  data.footer.userUrl = data.footer.userUrl || '#';

  const html = buildPage(data);
  fs.writeFileSync(outPath, html, 'utf8');
  const t = fs.readFileSync(outPath, 'utf8');
  const tables = (t.match(/<table/gi) || []).length;
  const circles = (t.match(/[①-⑳]/g) || []).length;
  console.log(`written: ${outPath}  ${fs.statSync(outPath).size} bytes  table=${tables} circle=${circles}`);
  if (tables > 0) console.error('警告：产出含 <table>，企业微信邮箱会清洗表格样式');
}

module.exports = { buildPage, buildBody, T };

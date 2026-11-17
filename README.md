# 材料学院党建答题网站

## 本机预览

需要安装 Node.js 18 或更新版本。打开 PowerShell，进入本文件夹后运行：

```powershell
npm start
```

在浏览器打开 `http://127.0.0.1:4173`。结束预览时，在 PowerShell 窗口按 `Ctrl+C`。

运行自动测试：

```powershell
npm test
```

## 替换题库

维护自编题目时编辑 `src/questions.js`；用户提供的 200 题整理在 `src/imported-question-data.js` 并由 `src/imported-questions.js` 导入。每题包含唯一 `id`、专题 `topic`、题型 `type`、题干 `stem`、选项 `options`、正确答案 `answer`、解析 `explanation` 和来源 `source`。题目需引用权威原文或正式文件，时政题注明对应报告或会议材料，并定期核验时效。

- 单选题：`type: 'single'`，`answer` 填一个选项 ID，例如 `'B'`。
- 多选题：`type: 'multiple'`，`answer` 填选项 ID 数组，例如 `['A', 'C']`。
- 判断题：`type: 'judge'`，`answer` 填 `true` 或 `false`，`options` 留空数组。
- 每题都应填写可核对的 `source.title` 和 `source.url`，解析应与来源条文一致。

综合测试从各题型题池分别随机抽取 25 道单选、10 道多选和 20 道判断题，限时 60 分钟、满分 100 分。时事政治题按题型设置抽题上限，整卷最高 20 分，不足部分由其他题目补足。作答进度保存在当前浏览器标签页，刷新页面可继续；未启用账号登录时，交卷记录保存在本机最近记录中。改动题型配比时，请同步更新 `src/quiz-engine.js` 的组卷规则、计分测试和 `test.html` 的规则说明。

正式使用前，请由学院党组织核对所有题目、答案、解析及政策时效。新增的 200 题来自用户提供的 Word 文档；导入时修正了重复题考点标记及已核实的错位解析。正式使用前仍应完成学院党组织审核。

题库数量会随来源核验和内容维护调整。部分题目围绕同一知识点从不同题型考查，综合组卷会尽量避免重复；使用前请核对题目、答案与解析。

## 字体

页面统一使用本地子集版 Noto Sans SC，依据 SIL Open Font License 1.1 发布，可用于本项目。许可文本见 `assets/fonts/OFL.txt`。字体以 WOFF2 格式自托管，不依赖在线字体服务；缺少网页字体时会回退到系统中文字体。

首页、专题练习、综合测试说明和独立答题页分别位于 `index.html`、`practice.html`、`test.html` 和 `exam.html`；新增或更名专题时，请同步更新首页和练习页入口。

## 登录与账号管理

学生首次使用时在登录页点击“注册”，填写学号、姓名和至少 6 位密码，注册成功后直接进入平台，无需邮箱或邮件确认。以后使用学号和密码登录。已有账号及答题记录继续可用。学号会映射为内部邮箱别名，学习记录仍由 Supabase 按用户 ID 隔离。

1. 在 Authentication 的 Sign In / Providers 设置中开启 **Allow new users to sign up**，关闭 **Confirm email**，保留 Email 登录，匿名登录保持关闭。由于使用不接收邮件的内部别名，必须关闭邮件确认，否则学生无法完成注册。
2. 在 SQL Editor 执行 `supabase/quiz-history.sql`，创建答题记录表和用户行级安全策略。
3. 管理员不再需要逐个创建账号。注册填写的学号、姓名分别保存在账号 User Metadata 的 `student_id`、`full_name` 字段，可在 Authentication / Users 中打开账号查看。需要完整名单时，在 Supabase SQL Editor 运行 `supabase/student-directory.sql`，可查看学号、姓名、注册时间和最近登录时间，并通过后台导出结果。
4. 不要把 service role key 配置到网站，也不要交给学生。前端公开 key 只能与 RLS 一起使用。

姓名由学生自行填写，未经过身份核验；请根据班级名单核对。后台名单查询仅供项目管理员在 Supabase 执行，不向学生提供名单接口。学号已注册时不会覆盖原账号；忘记密码请联系管理员处理，内部邮箱别名无法接收密码重置邮件。

启用前已存在的匿名本机答题记录不会自动归到任何学生账号。登录后的本机记录按用户 ID 分开保存；“清除记录”会同时清除该账号的云端历史。答题中进度只保存在当前标签页，结束或退出登录后会清除。

GitHub Pages 上的登录属于前端访问控制，题库文件仍是公开静态资源；个人答题记录由 Supabase RLS 隔离保护。若题库也必须限制下载，需要将题库读取迁移到有服务端鉴权的后端。

## 发布为静态网站

上传 `index.html`、`practice.html`、`test.html`、`exam.html`、`login.html`、`styles.css`、`assets/`、`src/` 和 `supabase/` 到支持静态文件的网站空间即可。不开启账号时无需数据库；开启账号登录时需要配置 Supabase 项目和 RLS。

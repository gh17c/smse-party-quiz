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

综合测试从各题型题池分别随机抽取 25 道单选、10 道多选和 20 道判断题，限时 60 分钟、满分 100 分。时事政治题按题型设置抽题上限，整卷最高 20 分，不足部分由其他题目补足。作答进度保存在当前浏览器标签页，刷新页面可继续；交卷后成绩与解析会保存在本机最近记录中。改动题型配比时，请同步更新 `src/quiz-engine.js` 的组卷规则、计分测试和 `test.html` 的规则说明。

正式使用前，请由学院党组织核对所有题目、答案、解析及政策时效。新增的 200 题来自用户提供的 Word 文档；导入时修正了重复题考点标记及已核实的错位解析。正式使用前仍应完成学院党组织审核。

题库数量会随来源核验和内容维护调整。部分题目围绕同一知识点从不同题型考查，综合组卷会尽量避免重复；使用前请核对题目、答案与解析。

## 字体

页面统一使用本地子集版 Noto Sans SC，依据 SIL Open Font License 1.1 发布，可用于本项目。许可文本见 `assets/fonts/OFL.txt`。字体以 WOFF2 格式自托管，不依赖在线字体服务；缺少网页字体时会回退到系统中文字体。

首页、专题练习、综合测试说明和独立答题页分别位于 `index.html`、`practice.html`、`test.html` 和 `exam.html`；新增或更名专题时，请同步更新首页和练习页入口。

## 发布为静态网站

上传 `index.html`、`styles.css`、`assets/` 和 `src/` 到支持静态文件的网站空间即可。网站不需要数据库或登录服务；答题记录保存在学生当前浏览器，更换设备或清理浏览器数据后不会同步。

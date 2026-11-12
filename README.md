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

编辑 `src/questions.js` 中的 `questionBank`。每题包含唯一 `id`、专题 `topic`、题型 `type`、题干 `stem`、选项 `options`、正确答案 `answer`、解析 `explanation` 和来源 `source`。

- 单选题：`type: 'single'`，`answer` 填一个选项 ID，例如 `'B'`。
- 多选题：`type: 'multiple'`，`answer` 填选项 ID 数组，例如 `['A', 'C']`。
- 判断题：`type: 'judge'`，`answer` 填 `true` 或 `false`，`options` 留空数组。
- 每题都应填写可核对的 `source.title` 和 `source.url`，解析应与来源条文一致。

正式使用前，请由学院党组织核对所有题目、答案、解析及政策时效。当前题库为联网资料整理的示例内容，不代表学院正式题库。

## 发布为静态网站

上传 `index.html`、`styles.css`、`assets/` 和 `src/` 到支持静态文件的网站空间即可。网站不需要数据库或登录服务；答题记录保存在学生当前浏览器，更换设备或清理浏览器数据后不会同步。

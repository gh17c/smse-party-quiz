# 材料学院党建答题网站实施计划

> **面向实施者：** 按任务顺序逐项实现并验证。使用原生 HTML、CSS 与 JavaScript，不增加框架或服务端依赖。

**目标：** 实现一个适配桌面和手机的党建知识练习与模拟测试静态网站。

**架构：** 页面由 `index.html` 提供，样式集中在 `styles.css`，原生 ES 模块按题库、答题规则、本地记录和页面交互分工。题库作为随站发布的数据文件；答题记录只写入浏览器 `localStorage`。

**技术栈：** HTML、CSS、原生 JavaScript ES modules、Node.js 内置 `node:test`（测试纯逻辑模块）。

**设计说明：** [材料学院党建答题网站-MVP设计说明.md](材料学院党建答题网站-MVP设计说明.md)

## 全局约束

- 首版不登录；题库及答题记录不上传服务器。
- 支持单选、多选、判断；多选题需完整匹配才得 1 分，不设部分分。
- 模拟测试从所选专题随机抽 10 题、不计时，提交后统一显示分数与解析。
- 本地最多保留最近 20 次记录；题库使用明确标注的示例题。
- 延续学院横向标识、深红导航、微软雅黑和材料微观横幅；桌面与手机均可用，键盘可操作。

## 评审关注

- 题库为空或某专题少于 10 题：专题练习显示空状态；模拟测试仅在至少有 10 题时开放并明确提示。
- 多选漏选或多选：必须判错；答案选项顺序不影响判分。
- 浏览器存储不可用或历史 JSON 损坏：答题主流程仍可使用，历史显示空状态，不使页面崩溃。
- 连续保存超过 20 次：只留下最近 20 条，顺序从新到旧。
- 小屏幕或键盘操作：选项可完整阅读、焦点清晰，控件不溢出且可操作。

## 文件结构

- `index.html`：语义化页面骨架、导航与应用挂载点。
- `styles.css`：品牌视觉、状态样式、响应式布局和焦点样式。
- `src/questions.js`：示例题库，导出 `questionBank`；每题带来源名称和 URL。
- `src/quiz-engine.js`：纯答题规则；导出 `normalizeAnswer(question, answer)`、`isCorrect(question, answer)`、`getUsableQuestions(questions)`、`getTopicNames(questions)`、`getTopicQuestions(questions, topic)`、`selectRandomQuestions(questions, count, random = Math.random)`。
- `src/progress-store.js`：本地记录读写；导出 `createProgressStore(storage, key = 'smse-party-quiz-history')`，其 `list()`、`add(record)`、`clear()` 均处理存储异常，`add` 保留最近 20 条。
- `src/app.js`：页面状态与渲染，连接题库、答题规则和记录存储。
- `package.json`：声明原生 ES 模块模式，不引入运行依赖。
- `dev-server.mjs`：使用 Node 内置 HTTP 模块提供本地静态预览，明确设置 ES 模块 MIME 类型。
- `README.md`：中文说明本机启动、运行测试、题库替换和静态发布。
- `tests/quiz-engine.test.mjs`：题型判分及随机抽题测试。
- `tests/progress-store.test.mjs`：本地记录上限、损坏数据及存储异常测试。
- `tests/dev-server.test.mjs`：静态资源 MIME 类型与路径访问边界测试。

## Task 1: 题库格式与答题规则

**文件：** 新建 `src/questions.js`、`src/quiz-engine.js`、`tests/quiz-engine.test.mjs`。

**接口：** 每题字段为 `{ id, topic, type, stem, options, answer, explanation, source: { title, url } }`。`type` 为 `single`、`multiple` 或 `judge`；选项为 `{ id, text }` 数组；答案分别为选项 ID、选项 ID 数组或布尔值。`normalizeAnswer` 将多选答案规范化为排序后的 ID 数组；`isCorrect` 返回布尔值；`selectRandomQuestions` 返回不重复抽取的题目。

- [x] 编写并运行测试：单选/判断正确答案判对、错误答案判错；多选完整匹配判对、漏选/多选判错且顺序无关；随机抽取不重复并受注入随机数控制。
- [x] 实现题库格式与纯规则函数；加入覆盖至少两个专题、三种题型的简短示例题，并标注为示例数据。
- [x] 运行 `node --test tests/quiz-engine.test.mjs`，所有测试通过。

## Task 2: 浏览器本地答题记录

**文件：** 新建 `src/progress-store.js`、`tests/progress-store.test.mjs`。

**接口：** `createProgressStore(storage, key)` 返回 `list(): Record[]`、`add(record): Record[]`、`clear(): void`。记录结构为 `{ id, mode, topic, score, total, correctCount, completedAt }`。

- [x] 测试空记录、写入/读取、20 条上限及新记录在前；测试无效 JSON、`getItem`/`setItem` 抛错时返回空记录或不抛错。
- [x] 实现存储适配器，页面调用时注入 `window.localStorage`。
- [x] 运行 `node --test tests/progress-store.test.mjs`，所有测试通过。

## Task 3: 首页与视觉框架

**文件：** 新建 `index.html`、`styles.css`、`assets/`；将 `work/reference-assets/` 中已核验的学院横向标识及 `work/.superpowers/brainstorm/1181-1794463962/content/material-microstructure-2.6.webp` 整理为网站资源。

- [x] 建立包含学院标识、深红主导航、微观纹理横幅、专题练习入口、模拟测试入口和最近记录区域的语义化首页；导航、按钮和表单控件可键盘聚焦。
- [x] 实现微软雅黑优先的字体栈、清晰层级、选中/悬停/焦点状态，以及窄屏布局；沿用工作区已有图片资源，不增加生成图片步骤。
- [x] 启动本地静态服务器，在桌面宽屏和手机宽度检查布局、资源加载、溢出和控制台错误。

## Task 4: 专题练习与错题重做

**文件：** 新建 `src/app.js`，修改 `index.html`、`styles.css`。

- [x] 实现专题选择、题目作答和单题即时反馈；反馈显示对错、正确答案和解析，并提供下一题操作。
- [x] 汇总本轮错题，提供错题重做；重做时按同一题型规则即时判分。
- [x] 完成专题时保存一条记录，首页记录区立即更新；验证无题专题及题库数据无效时的空状态。

## Task 5: 模拟测试与答题回顾

**文件：** 修改 `src/app.js`、`styles.css`。

- [x] 从所选专题随机选 10 题；少于 10 题时禁用开始操作并显示数量说明。答题过程中不显示答案或解析。
- [x] 提交后按纯规则统一判分，展示分数、正确数和逐题答案解析；允许返回首页查看最近记录。
- [x] 验证记录最多 20 条、清除记录后页面同步更新；在桌面与手机完成一次练习和一次模拟测试的端到端检查。

## 完成检查

- [x] 运行 `node --test tests/*.test.mjs`，题库规则与本地存储测试通过。
- [x] 通过本地静态服务器手动验证专题练习、错题重做、模拟测试、提交复盘、历史查看与清除。
- [x] 检查桌面和手机视口、键盘焦点、空题库/题量不足/损坏记录状态，无控制台错误。
- [x] 确认首页和题库明确说明题目为示例，正式上线前需替换并核对学院正式题目、答案和解析。

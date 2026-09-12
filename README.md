# 秋招智能填表助手

一个本地运行的 Chrome / Edge 浏览器扩展，用候选人档案扫描并填写招聘网站的网申表单。扩展始终保留人工复核环节，不会上传本地文件、处理验证码或点击最终提交按钮。

当前版本：`0.14.4`

## 当前功能

- 导入、编辑并校验标准候选人 JSON 档案，支持绑定本地文件后同步保存。
- 扫描当前招聘页面，依据标签、占位符、`name`、`id`、ARIA 名称和附近文本识别字段。
- 填写文本框、文本域、原生选择器、单选、多选以及常见前端框架的自绘组件。
- 支持 Moka、北森、ATSX，以及 Ant Design、Element Plus、Arco、TDesign、Naive UI、Semi UI 的常见表单结构。
- 按档案配置自动补足教育经历和工作经历，并依据学校或公司名称匹配正确记录。
- 处理年月选择器、起止日期顺序和经历描述等复杂字段。
- 默认保留网页已有内容；只有用户明确开启“覆盖”后才替换。
- 填写后回读网页值，区分验证成功、保留原值、资料缺失和验证失败。
- 将无法识别的必填题保存为可复用的自定义答案。
- 自动或手动记录投递历史，支持编辑、分类、筛选、排序和导出 Excel。
- 在招聘列表页识别最多 10 个岗位，逐条打开详情页并提取 JD；已提供 Moka 岗位列表专用适配。
- 使用用户配置的 OpenAI-compatible 接口分析岗位匹配度，并在原列表中显示四档结果和详细理由。
- 提供独立 AI 页面配置 Base URL、API Key、模型、Prompt，以及本地文档或 GitHub Skill。

更细的模块边界见 [modules.md](modules.md)，产品功能和后续需求见 [SPEC.md](SPEC.md)。

## 安装

1. 下载或克隆本仓库。
2. 在 Chrome 打开 `chrome://extensions`，或在 Edge 打开 `edge://extensions`。
3. 开启“开发者模式”。
4. 选择“加载已解压的扩展”，然后选择本项目目录。

## 使用

1. 点击扩展图标，进入“档案”。
2. 导入自己的候选人 JSON，或点击“绑定并同步 JSON”选择本地档案文件。
3. 打开招聘网站的网申页面。
4. 点击“扫描当前页”，检查识别结果。
5. 在“需要补填”区域补充缺失资料，必要时再开启覆盖已有内容。
6. 点击“填充已匹配项”，逐项复核网页中的实际结果。
7. 手动上传简历、处理验证码并提交申请。

### 岗位匹配

1. 点击弹窗右上角的“AI”，填写 Base URL、API Key、模型名称和 Prompt。
2. 如需额外分析规则，可选择本地 Markdown/TXT/JSON 文档，或填写公开 GitHub 仓库、目录、SKILL.md 文件链接。
3. 回到岗位列表页，打开扩展并点击“AI分析当前页岗位匹配度”。
4. 首次使用时确认招聘网站和模型接口的临时访问权限。
5. 插件会依次在非活动标签页中读取最多 10 个岗位，并把“非常匹配／匹配／部分匹配／不匹配”写回列表。
6. 悬停匹配结果查看详情；点击结果可固定或收起详情。

浏览器安全策略要求首次绑定档案文件时由用户亲自选择；扩展不能静默选择本地简历或其他文件。

## 候选人档案

档案结构由 [candidate-profile.schema.json](candidate-profile.schema.json) 定义。真实的 `candidate-profile.json` 被 `.gitignore` 排除，不会提交到仓库。

导入和保存时会检查：

- 顶层对象和经历数组结构；
- 日期格式与起止时间顺序；
- 教育、工作经历的重复段数设置；
- 档案格式版本以及旧版字段迁移。

## 隐私与安全

- 候选人档案、页面扫描结果、投递历史导出和本地密钥均被忽略。
- 扩展只在用户操作后临时访问当前页面，目前不申请持续读取所有网站的权限。
- 岗位分析仅在用户确认后申请对应招聘网站和模型接口的运行时权限。
- API Key 只保存在 `chrome.storage.session`，不会传给招聘网页，浏览器重启后自动清除。
- 发送给模型的档案会排除姓名、电话、邮箱、证件信息、文件路径等无关隐私字段。
- 不填写密码、文件选择器、证件号、银行卡等敏感字段。
- 不自动点击最终提交按钮。

## 测试

不依赖浏览器的核心逻辑测试可以直接运行：

```powershell
node --test tests/ai-match.test.js tests/ai-settings.test.js tests/history-storage.test.js tests/matcher.test.js tests/semantic-provider.test.js tests/xlsx-export.test.js
```

DOM、日期组件和履历上下文测试需要先在本地安装 Playwright，然后运行完整测试集：

```powershell
npm install --save-dev playwright
npx playwright install chromium
node --test tests/*.test.js
```

页面组件的测试夹具和补充说明位于 [`tests`](tests) 目录。

## 项目结构

```text
manifest.json                  扩展清单
background.js                 JD 获取、模型调用和匹配缓存
popup.*                       扫描、填充与投递历史界面
options.*                     候选人档案编辑器
ai.*                          AI、Prompt 和 Skill 设置页
content.js                    页面识别、填写和验证
job-list.js                   岗位列表识别与匹配结果注入
job-detail.js                 岗位详情页 JD 提取
shared/ai-match.js            档案脱敏、Prompt 和模型结果校验
shared/profile.js             档案默认值、迁移和校验
shared/matcher.js             字段语义匹配
shared/storage.js             档案与投递历史存储
shared/semantic-provider.js   本地语义接口预留
shared/xlsx-export.js         投递历史 Excel 导出
tests/                        自动化测试和网页夹具
```

## 当前限制

- 招聘网站的自绘组件和动态页面结构差异很大，新网站可能需要单独适配。
- 当前飞书招聘真实页面受浏览器安全策略影响，日期组件尚未完成真实环境验证。
- 岗位匹配当前只支持 OpenAI-compatible Chat Completions 接口。
- Anthropic 原生 Messages API（`/v1/messages`）暂不支持；如果服务商另行提供 OpenAI-compatible 地址，则可以使用兼容地址。
- Moka 岗位列表会依据岗位卡片和 `#/job/...` 路由精确识别；其他网站仍使用通用规则，没有标准链接或使用复杂虚拟列表的网站需要单独适配。
- 本地 Skill 当前支持 Markdown、TXT 和 JSON；不会执行 Skill 中的脚本或工具调用。
- 文件上传、验证码和最终提交必须由用户完成。

遇到不兼容的网站时，请提供对应控件截图以及可见的网页选项信息。

## 开发约定

- [SPEC.md](SPEC.md) 是产品需求和完成状态的统一记录。
- 完成的条目使用 `- [x] ~~内容~~`；未完成条目保持 `- [ ] 内容`。
- 字段识别与填充模块的长期演进方案见 [AUTOFILL-CORE-ROADMAP.md](AUTOFILL-CORE-ROADMAP.md)。
- 提需求时可引用 [modules.md](modules.md) 中的固定模块编号和名称。

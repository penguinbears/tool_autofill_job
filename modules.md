# 秋招智能填表助手：固定模块字典

> 本文件是讨论需求时的模块命名标准。  
> 当前对应扩展版本：v0.14.3。模块编号一旦发布便保持稳定；即使按钮文字或代码文件调整，也继续使用原编号。

## 最简单的使用方式

描述需求时写：

```text
[模块编号｜固定模块名]
当前行为：
希望改成：
验收标准：
示例数据或页面：
```

例如：

```text
[UI-HISTORY｜投递历史界面] + [REC-STORAGE｜投递记录存储]
当前行为：只能看到全部记录。
希望改成：增加公司名称搜索框，删除记录后搜索结果立即刷新。
验收标准：输入“极氪”时只显示公司名包含“极氪”的记录。
```

不知道编号时，也可以使用表中的固定中文名。涉及多个模块时把编号并列写出。

## 一、用户能看到的界面模块

| 固定编号 | 固定模块名 | 如何找到 | 职责 | 主要文件 |
|---|---|---|---|---|
| `UI-POPUP` | 插件弹窗外壳 | 点击 Edge 工具栏中的插件图标 | 弹窗整体布局、状态栏和各子模块排列 | `popup.html`、`popup.css`、`popup.js` |
| `UI-ACTIONS` | 扫描与填充操作区 | 弹窗顶部“扫描当前页 / 填充已匹配项” | 发起扫描、填写和覆盖已有值 | `popup.html`、`popup.js` |
| `UI-MATCH` | 岗位匹配入口 | 弹窗状态栏上方“AI分析当前页岗位匹配度” | 识别当前列表并启动岗位匹配 | `popup.html`、`popup.js` |
| `UI-AI` | AI 设置页面 | 点击弹窗右上角“AI” | 配置 Base URL、API Key、模型、Prompt 和 Skill | `ai.html`、`ai.css`、`ai.js` |
| `UI-SESSION` | 登录保活界面 | 弹窗中的“登录保活” | 显示当前网站登录状态，开启、检测或停用逐站后台保活 | `popup.html`、`popup.css`、`popup.js` |
| `UI-SUMMARY` | 字段扫描结果区 | 弹窗中的“可匹配 / 可填写 / 缺资料”及字段列表 | 显示识别结果和档案字段路径 | `popup.js` 的 `render()` |
| `UI-MISSING` | 缺失资料补填区 | 弹窗中的“需要补填” | 直接编辑缺失资料并自动保存至档案和已绑定 JSON | `popup.js` 的 `createEditor()`、`persistField()` |
| `UI-ATTENTION` | 人工处理提示区 | 弹窗中的“需要你处理” | 显示资料冲突、下拉失败、文件上传等提示 | `popup.js` 的 `renderAttention()` |
| `UI-HISTORY` | 投递历史界面 | 弹窗底部“投递历史” | 手动添加 URL，展示、编辑、筛选、排序、导出、删除和清空投递记录 | `popup.html`、`popup.js` 的历史相关函数 |
| `UI-PROFILE` | 候选人档案页面 | 点击弹窗右上角“档案” | 编辑、导入、导出、绑定和校验标准档案 | `options.html`、`options.css`、`options.js` |
| `UI-PROFILE-SUMMARY` | 档案摘要区 | 档案页面顶部的身份、教育、工作和提示卡片 | 显示档案完整度及未保存状态 | `options.js` 的 `renderSummary()` |

## 二、网页识别与填写核心模块

这些模块运行在招聘网页中，没有独立可见页面。

| 固定编号 | 固定模块名 | 职责 | 主要代码 |
|---|---|---|---|
| `CORE-PLATFORM` | 招聘平台识别与适配 | 判断北森、Moka 及通用组件结构，提供平台专用选择器 | `content.js` 的 `detectPlatform()`、`MOKA_SEL` 及平台分支 |
| `CORE-SCAN` | 网页字段扫描 | 找到输入框、下拉框、日期控件，提取标签、必填状态和分区 | `content.js` 的 `scan()`、`labelFor()`、`descriptorFor()` |
| `CORE-MATCH` | 档案字段匹配 | 把“手机号码”等网页字段映射为 `personal.phone` 等标准路径 | `shared/matcher.js` 的 `matchField()` |
| `CORE-SEMANTIC` | 可选语义匹配 | 为规则难以判断的字段提供受候选集约束的模型匹配接口；当前仅预留契约且默认关闭 | `shared/semantic-provider.js` |
| `CORE-INPUT` | 普通输入控件填写 | 填写 input、textarea、原生单选/复选框和可编辑区域 | `content.js` 的 `setField()`、`setNativeValue()` |
| `CORE-SELECT` | 下拉框填写 | 处理意向地点、学历、枚举题及单选/多选自绘下拉框 | `content.js` 的 `setCustomCombobox()` |
| `CORE-DATE` | 日期选择器填写 | 处理开始时间、结束时间、年月选择和动态年月面板 | `content.js` 的 `setAtsxMonth()`、`waitForDateState()` 及 `setCustomCombobox()` 日期分支 |
| `CORE-REPEAT` | 重复经历区块 | 根据档案数量新增并填写教育、工作、项目、获奖和语言记录 | `content.js` 的 `repeatableDefinitions`、`ensureRepeatableSections()` |
| `CORE-REPEAT-MAP` | 经历记录对应关系 | 根据学校名、公司名等把网页已有记录对应到正确的档案数组项 | `content.js` 的 `assignRepeatIndexes()` |
| `CORE-CUSTOM` | 自定义必填题 | 将无法归类的必填题按页面标签保存和复用 | `content.js` 的 `customKeyFor()` 与 `additional.custom_answers` |
| `CORE-SAFETY` | 自动填写安全边界 | 跳过敏感信息、文件控件和提交按钮，默认保留网页已有值 | `content.js` 的 `SKIP_TYPES`、`setField()` |
| `CORE-JOB-LIST` | 岗位列表识别 | 识别岗位链接，向列表注入匹配徽标和详情浮层 | `job-list.js` |
| `CORE-JD-EXTRACT` | 岗位 JD 提取 | 在非活动标签页中加载详情并提取主要文本 | `background.js`、`job-detail.js` |
| `CORE-AI-MATCH` | AI 岗位匹配 | 对档案脱敏，调用 Chat Completions，校验结果并计算四档等级 | `background.js`、`shared/ai-match.js` |
| `CORE-SESSION` | 登录状态与后台保活 | 识别顶部账户区域；对用户授权的网站每 10 分钟发送只读请求并记录状态 | `session-detector.js`、`background.js` |

## 三、标准档案与持久化模块

| 固定编号 | 固定模块名 | 职责 | 主要文件 |
|---|---|---|---|
| `DATA-PROFILE` | 标准候选人档案 | 存放实际姓名、教育、工作等填写数据 | `candidate-profile.json` |
| `DATA-SCHEMA` | 档案结构规范 | 约束字段类型、日期格式和经历数组结构 | `candidate-profile.schema.json`、`shared/profile.js` |
| `DATA-MATCH-RULES` | 字段别名规则 | 维护网页文字到档案路径的同义词映射 | `shared/matcher.js` |
| `DATA-STORAGE` | 档案存储与 JSON 同步 | 保存浏览器档案、绑定磁盘 JSON、管理写入权限 | `shared/storage.js` 的档案相关函数 |
| `DATA-PAGE-MAP` | 当前页面字段清单 | 记录已分析网页的字段、冲突和人工确认项 | `current-page-fields.json` |
| `DATA-AI-SETTINGS` | AI 设置与匹配缓存 | 保存非密钥设置、会话级 API Key 和最多 100 条匹配缓存 | `ai.js`、`background.js` |

## 四、投递记录模块

“投递记录”和“经历记录”是两件不同的事：

- **投递记录**：哪家公司、哪个岗位、什么时候执行过填充。
- **经历记录**：教育经历、工作经历、项目经历等候选人资料。

| 固定编号 | 固定模块名 | 职责 | 主要代码 |
|---|---|---|---|
| `REC-CAPTURE` | 投递记录生成 | 填充完成后识别公司、岗位、网址和时间并生成记录 | `content.js` 的 `detectPageCompany()`、`detectPagePosition()` 及填充完成分支 |
| `REC-STORAGE` | 投递记录存储 | 新增、更新、删除、清空投递记录，按 URL + 公司 + 职位识别重复项，最多保存 200 条 | `shared/storage.js` 的 `*ApplicationRecord` / `*ApplicationHistory` 函数 |
| `REC-CLASSIFY` | 投递职位分类 | 根据职位名称自动判断分类，也允许手动覆盖、筛选和排序 | `shared/storage.js` 的 `inferPositionCategory()`、`popup.js` 的分类相关函数 |
| `REC-EXPORT` | 投递记录 Excel 导出 | 把全部投递记录和分类统计实时导出为标准 `.xlsx` 工作簿 | `shared/xlsx-export.js`、`popup.js` 的 `exportHistoryWorkbook()` |
| `UI-HISTORY` | 投递历史界面 | 在插件弹窗中添加 URL，展示、编辑、筛选、排序和导出投递记录 | `popup.html`、`popup.js` 的历史相关函数 |
| `CORE-REPEAT` | 经历记录增删与数量 | 控制网页中教育、工作等记录区块数量 | `content.js` 的重复区块逻辑 |

如果你说“修改记录功能的前端页面和功能逻辑”，建议明确写成下面之一：

```text
[UI-HISTORY｜投递历史界面] + [REC-STORAGE｜投递记录存储]
```

或者：

```text
[CORE-REPEAT｜重复经历区块] + [CORE-REPEAT-MAP｜经历记录对应关系]
```

## 五、配置项的固定叫法

磁盘档案使用中文 key；“内部路径”只用于描述代码匹配逻辑。

| 固定叫法 | 中文档案路径 | 内部路径 | 说明 |
|---|---|---|---|
| 教育经历填写数量 | `自动填写设置.重复区块数量.教育经历` | `autofill.repeat_sections.education` | 例如 `2` 表示最多填写两段教育经历 |
| 学历层次 | `教育经历[].学历` | `education[].education_level` | 用于“本科/硕士/博士”等学历下拉框 |
| 学位 | `教育经历[].学位` | `education[].degree` | 用于“学士/硕士学位”等学位字段，不再与学历层次混用 |
| 专业大类 | `教育经历[].专业大类` | `education[].major_category` | 用于“工科/理科/文科”等专业分类下拉框 |
| 工作经历填写数量 | `自动填写设置.重复区块数量.工作经历` | `autofill.repeat_sections.work_experience` | 当前档案为 `3`，表示填写三段工作经历 |
| 意向地点列表 | `求职意向.意向工作地点` | `application.desired_locations` | 当前为北京、上海、杭州 |
| 单选地点策略 | `求职意向.地点填写策略.单选策略` | `application.location_policy.single_select` | `first_available` 表示选择下拉框第一个有效选项 |
| 多选地点策略 | `求职意向.地点填写策略.多选策略` | `application.location_policy.multi_select` | `all_preferred_available` 表示尽量选择全部偏好地点 |
| 自定义问题答案 | `补充信息.自定义回答` | `additional.custom_answers` | 保存无法归类但以后需要复用的问题 |

## 六、需求描述模板

### 修改界面

```text
[UI-HISTORY｜投递历史界面]
修改位置：每条记录右侧
当前行为：只有编辑和删除
希望改成：增加“已投递/待跟进”状态
验收标准：修改状态后关闭再打开插件，状态仍保留
```

### 修改填写逻辑

```text
[CORE-SELECT｜下拉框填写]
目标字段：教育经历 → 学历
当前行为：点击填充后仍显示“请选择”
希望改成：根据档案中的“硕士/学士”选择对应选项
验收标准：北森和 Moka 页面各测试一次，重新扫描能读到选中值
附加材料：展开后的下拉框截图
```

### 修改经历数量

```text
[CORE-REPEAT｜重复经历区块]
目标区段：工作经历
当前数据：candidate-profile.json 中有 3 条
当前行为：网页只生成 2 条
希望改成：生成并填写 3 条
验收标准：三家公司都出现，且公司名与职责没有串行
```

### 同时修改前端和逻辑

```text
[UI-HISTORY｜投递历史界面]
[REC-CAPTURE｜投递记录生成]
[REC-STORAGE｜投递记录存储]
当前行为：
希望改成：
验收标准：
```

## 七、提供问题材料的优先顺序

1. 固定模块编号或固定模块名。
2. 当前行为、期望行为和可验证的验收标准。
3. 涉及的可见文字，例如“最高学历”“添加工作经历”。
4. 展开后的下拉框或目标区段截图。
5. 可见的网页选项、错误提示或相关 DOM 片段。

## 八、目录结构

```text
job-application-autofill/
├── modules.md                    # 本模块字典
├── README.md                     # 安装与使用说明
├── manifest.json                 # Edge / Chrome 扩展清单
├── background.js                # 岗位详情读取、模型调用和缓存
├── session-detector.js           # 顶部导航栏与登录状态识别
├── popup.html / .css / .js       # 插件弹窗及投递历史界面
├── options.html / .css / .js     # 候选人档案页面
├── ai.html / .css / .js          # AI、Prompt 与 Skill 设置页面
├── content.js                    # 网页扫描、填写、下拉、日期和重复区块
├── job-list.js                   # 岗位列表和匹配结果界面
├── job-detail.js                 # JD 文本提取
├── shared/
│   ├── ai-match.js               # 档案脱敏和匹配结果规范
│   ├── matcher.js                # 字段别名和匹配规则
│   ├── profile.js                # 档案默认结构、迁移与校验
│   ├── storage.js                # 档案同步与投递记录存储
│   └── xlsx-export.js            # 投递记录 Excel 工作簿生成
├── candidate-profile.json        # 当前标准候选人档案
├── candidate-profile.schema.json # 档案 JSON Schema
├── current-page-fields.json      # 当前页面字段分析
└── tests/                        # 自动化测试与网页样例
```

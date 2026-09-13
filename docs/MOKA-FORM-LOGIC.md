# Moka（mokahr）招聘申请表：字段与弹层处理记录

记录日期：2026-09-13。实现入口：`content.js` 中的 Moka / Sugar Design adapter。

## 适用范围与证据

本次针对舜宇 Moka 申请表，以及具有同类组件的 Moka 页面。先判断招聘平台，再识别具体组件；不能因为都叫“出生日期”就把北森、ATSX 和 Moka 的操作路径混用。

- 用户提供了舜宇“出生日期 (年龄)”点击前、点击后的真实 HTML：只读输入框、字段内新增弹层、1990 年标题及十二个中文月份。
- 既有 Moka 页面快照显示普通下拉使用 `sd-Select`；分离式年月使用 `.month-range-select`；内层搜索 input 的 placeholder 可能为空。
- 核对了 [Moka 公开前端脚本（20260727 版本）](https://static-ats.mokahr.com/recruitment-web-client/javascripts/recruitmentWeb-20260727-1843-f5496-gray-release.js) 中的 Sugar Design 日期、月份、下拉组件实现。该历史公开版本可佐证组件结构，不能代表当前页面完整部署版本。
- 当前 Edge 调试接口返回 `Debugger unattached`，本轮未能完成在线连续点击验证。用户提供的 DOM、公开脚本核对和本地组件测试属于不同证据来源；本地测试通过不等于舜宇真实页面已验收。
- 文档与测试不保存真实候选人姓名、生日、联系方式或账号数据。

## 组件名称与稳定前缀

`sd-` 是此处 Sugar Design 组件的 DOM 命名前缀。下面记录可复用的 DOM 组件名称，不把压缩代码内部变量名当作公共 API。

| 作用 | 名称 / DOM 前缀 | 说明 |
| --- | --- | --- |
| 表单区块 | `apply-block-*`、`data-nav-id` | 如 `block-basicInfo`、`block-educationInfo` |
| 字段容器 | `apply-field-*` | 标题、控件、说明共同位于容器内 |
| 字段标题 | 字段直接子级 `title-*` | 读取标题文字，去掉必填星号和冒号 |
| 控件区 | `ctrl-*` | 不把描述文字作为字段名 |
| 下拉触发容器 | **Sugar Design Dropdown / `sd-Dropdown-container-*`** | 普通 Select 和日期选择器都可能使用 |
| 展开的弹层 | `sd-Dropdown-dropdown-*` | 可新增、复用、显示隐藏；不能依赖完整 hash |
| 普通下拉 | **Sugar Design Select / `sd-Select-container-*`** | 通常是 label，内部 input 用于搜索 |
| 已选显示值 | `sd-Input-display-value-*` | 与 input 的搜索词区分 |
| 选项菜单 / 选项 | `sd-Select-menu-*` / `sd-Select-menu-item-*` | 有些变体也提供 `role=option` |
| 日期选择器 | **Sugar Design DatePicker（`sd-picker-*`、`sd-panal-*`、`sd-basic-*`）** | 包在 Dropdown 内；`panal` 是实际拼写，不能擅自改成 `panel` |
| 日期图标 | `sd-picker-addon-*` | 只是入口内部图标，不能单独扫描为字段 |
| 日期面板 | `sd-panal-menu-wrapper-*` | 内含导航和表格 |
| 年份标题 / 月份标题 | `sd-basic-selector-year-*` / `sd-basic-selector-month-*` | 当前显示状态的依据 |
| 上一年 / 下一年 | `sd-Icon-icondoubleLeft-*` / `sd-Icon-icondoubleRight-*` | 在单年面板逐年切换；每次点击后检查标题 |
| 月份格子 | `sd-basic-year-item-*`、外层 `sd-basic-year-wrapper-*` | 名称含 year，但内容可能是一月到十二月；必须按内容判断 |
| 日期格子 | `sd-basic-date-item-*`，外层 `td` | 从当月可用格子中精确匹配日 |
| 不可选 / 相邻月份 | `sd-basic-disabled-*` / `sd-basic-fade-*` | 检查格子及祖先，排除相邻月份的同号日期 |
| 分离式年月 | `.month-range-select` | 四框通常依次是开始年、开始月、结束年、结束月 |
| 可重复经历 | `apply-fields-*` 且 `multi-*` | JSON 数组记录与页面经历分组对应 |

示例完整类名 `sd-Dropdown-dropdown-GmACl` 中，`GmACl` 是构建后缀；代码只使用有意义的前缀。仅去掉 hash 还不够，仍要保证字段归属和控件类型正确。

## 平台与组件分流

1. 优先识别 `#moka-version`、Moka 域名，或 Moka 字段与 Sugar Dropdown 的组合结构。初次未加载完成而识别为 generic 时，后续可以重新判断。
2. 北森保留 Phoenix 等原有路径，通用框架保留各自逻辑。
3. 同为 Moka 页面也可能嵌入 ATSX 日期组件；`.atsx-date-picker-period-month-label` 继续进入 ATSX 专用路径。
4. Moka 的 Select、只读日期 Dropdown 分别使用不同步骤。未知只读输入框返回人工处理，不移除 readonly 强行写入。

## 字段定位与 JSON 映射

顺序为：区块 → 字段容器 → 原始标题 → JSON 语义路径 / 自定义答案 → 经历记录 → 子控件。

- 例如“个人信息 / 出生日期 (年龄)”匹配 `personal.birth_date`；“教育背景 / 学校名称”匹配 `education[].school`。
- 字段标题用于现有 matcher 的别名匹配，JSON 不需要照抄网页的哈希类名。未知问题沿用 `additional.custom_answers`，没有答案就跳过。
- 定位保存区块导航标识、同区块序号、原始标题、同标题字段序号、子控件序号和类型。每次点击、等待检查、回读都重新解析 DOM。
- 精确匹配原始标题，找不到就报告 `stale-locator`；不把数组下标越界降到最后一项，不在其他区块模糊找同名框。
- 年月子框可用“开始时间 / 结束时间”做语义映射，但定位仍保存原始的“就读时间 / 起止时间”。不能用合成标签去找真实标题。
- 一段经历的年、月共享同一个 JSON 数组下标；不能把开始年计作第 1 段、开始月计作第 2 段。
- 扫描只保留规范化的控件入口，排除内部 input、图标和弹层中的格子，避免重复填写。

## 每个控件的执行顺序

填写按字段串行进行：重新定位 → 检查已有值/禁用状态 → 打开 → 等待所属弹层 → 查找 JSON 目标选项 → 点击 → 等待提交值 → 关闭本字段弹层 → 下一个字段。

等待器使用 `MutationObserver` 加 50ms 轮询，单次默认 2500ms，结束后清理监听器和定时器。DOM 有变化只是重新检查的触发条件；必须找到所需状态，不能把任意变化判为成功。

弹层归属优先级：

1. 当前 `sd-Dropdown-container-*` 内可见的弹层。用户提供的出生日期 HTML 属于这种情况。
2. 控件或内部输入框通过 `aria-controls` / `aria-owns` 指向的可见面板。
3. 点击前不可见、点击后出现且位于入口附近的唯一 Moka 弹层。没有明确关系或有多个候选时不猜测。

弹层可以新增，也可以复用旧节点；等待中每次重新查找，不能固定一个旧 `searchRoot`。不得回退到全页面搜索任意 input 或最后一个 popup。

### 普通 Select

打开后在所属弹层中精确匹配选项。尚未找到时允许给当前控件的可编辑 input 写入搜索词，触发 input 后继续等待新选项；搜索词本身不算提交值。选择后从显示值/选中标签等读取，并与目标比较。

本适配器优先保证 JSON 目标的准确性，找不到不自动选择第一项。级联地区、无法定位的虚拟列表、任意多级自定义控件仍需后续专项适配。

### 出生日期：从 1990 导航到 JSON 年月日

以虚构目标 `1992-02-29` 为例：

1. 校验 JSON 格式和真实日历日期，拒绝 `2001-02-29` 等无效日期。
2. 打开只读输入框，等待当前字段内的日期面板。
3. 读取 `1990年`，点击右双箭头；等待标题变成下一年。继续到 `1992年`。目标更早则使用左双箭头。
4. 每次都重新找按钮和标题，要求年份向目标靠近。禁用、无变化、无法识别或超过 200 次 / 60 秒导航限制则停止并报告失败。
5. 若当前显示日历，先点击月份标题进入月份面板。按中文月份映射精确选“二月”。
6. 等待日历出现，并确认标题仍为目标年、月，再选当月可用的 `29`。跳过淡色相邻月份格子和禁用格子。
7. 等待输入框显示 `1992-02-29`，再报告 `verified-filled`。不会用只有年月的回读结果验证完整生日。

如果页面本身只有月精度，JSON 也只有 `YYYY-MM`，可按年月确认；JSON 有具体日期而页面只接受月份时不报告完整日期成功，不补造某一天。

## 结果与限制

- `verified-filled`：已点击并回读匹配。
- `existing-value`：保留已填内容；显式覆盖才修改。
- `invalid-date`：JSON 日期格式或日历日期不合法。
- `popup-timeout`：未等到能够确认归属的弹层。
- `date-navigation-failed`：无法切换到目标年份。
- `option-not-found`：未找到目标可选项，包括禁用日期。
- `verification-failed`：页面未接受选择，或回读与目标不符。
- `stale-locator`：重绘后无法找到原字段/子控件。

不自动提交申请、不上传文件、不勾选协议。只有日期组件状态和本地字段值被用于确认，未读取或修改 React 内部状态。

## 测试与后续真实页面验收

自动化测试：`tests/moka-form.test.js`。使用虚构值和本地组件夹具，通过实际 click/input 事件驱动状态变化，并独立记录组件提交结果。

覆盖：延迟挂载、整段字段重绘、异步提交、从 1990 前进/后退、闰日、初始日历/月份视图、预先展开、禁用按钮/月份/日期、无效日期、已有值保护与覆盖、中文月份、空 placeholder 的四个年月框、搜索词未选中、关联到 body 的复用弹层、无关弹层隔离。

运行：安装好 Playwright 和浏览器后，在项目根目录执行 `node tests/moka-form.test.js`；完整回归执行 `node --test --test-concurrency=2 tests/*.test.js`。可以通过 `CHROME_PATH` 指定测试用浏览器，不连接用户日常浏览器档案。

待真实页面验收：重新加载此分支扩展并刷新申请页，分别验证生日、学历、学校搜索、就读年月。检查回读值与 JSON 完全一致，并检查未误动其他字段。遇到新组件应补充点击前后 DOM 和回归用例，再扩展适配器。

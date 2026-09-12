# 经历上下文覆盖验证（v0.13.2）

范围：CORE-SCAN、CORE-MATCH、CORE-REPEAT-MAP、CORE-DATE。

`node tests/resume-context.test.js` 使用本地 Playwright / Chrome，通过真实的 SCAN、FILL 消息执行以下 6 组场景：

1. 两个学校、两个实习公司以与档案相反的顺序排列；各卡片日期、职位、描述来自相同身份的记录。正式工作公司单独读取工作数组。
2. 已填名称不在档案中时，保留该卡片内容，不按位置兜底覆盖。
3. 空白卡片使用其他卡片尚未占用的档案记录。
4. 同名学校对应多条档案时，标记歧义并停止覆盖该卡片。
5. 起止时间倒置时仅阻止该记录的日期填写，其余内容仍可填写。
6. 页面限制开始日期不能超过当前结束日期时，先修改结束日期；多段实习描述保留换行。

9 组 ATSX 动态日期模拟场景、原有 DOM 回归、matcher/profile 与 semantic provider 测试同时通过。

数据来源：用户指出的 `resumeEditForm-item resumeEditForm-education` 卡片类名、之前提供的 ATSX 弹层 HTML，以及现有扩展代码。其余控件包装结构在测试中模拟。浏览器连接先多次超时，后续访问被安全策略阻止，因此这些结果不等于已完成真实飞书招聘页面验证。当前网页尚未由本次任务自动覆盖或提交。

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const portalHtml = fs.readFileSync(path.join(__dirname, "fixtures/atsx-work-month-portal.html"), "utf8");

async function setup(browser, kind, distantOnly = false) {
  const page = await browser.newPage();
  await page.setContent(`<style>
    .atsx-date-picker-period-month {display:inline-flex;align-items:center}
    .atsx-date-picker-period-month-label {padding:8px; border:1px solid gray}
    .atsx-date-picker-period-line {width:20px;height:1px;background:gray}
    .atsx-date-picker-period-hidden-input {width:1px;height:1px;opacity:0}
    .atsx-date-picker-period-month-panel {display:flex;background:white}
    .atsx-date-picker-period-month-panel-list {height:333px;overflow:auto;width:100px}
    .atsx-date-picker-period-month-panel-list-item {height:28px}
    </style><div class="resumeEditForm-item resumeEditForm-${kind}">
    <div class="atsx-form-item"><label class="atsx-form-item-label">公司名称</label><input value="测试公司"></div>
    <div class="atsx-form-item"><label class="atsx-form-item-label">起止时间</label>
    <span class="atsx-form-item-children"><div class="atsx-date-picker atsx-date-picker-period-month atsx-date-picker-focus">
      <div class="atsx-date-picker-period-month-label atsx-date-picker-period-month-label-focus"><span class="atsx-date-picker-period-month-label-year" data-cy="year">YYYY</span><span class="atsx-date-picker-period-month-label-separator">-</span><span class="atsx-date-picker-period-month-label-month" data-cy="month">MM</span></div>
      <div class="atsx-date-picker-period-line"></div>
      <div class="atsx-date-picker-period-month-label"><span class="atsx-date-picker-period-month-label-year" data-cy="year">YYYY</span><span class="atsx-date-picker-period-month-label-separator">-</span><span class="atsx-date-picker-period-month-label-month" data-cy="month">MM</span></div>
      <input class="atsx-date-picker-period-hidden-input">
    </div></span></div></div>`);
  await page.evaluate(({ portalHtml, distantOnly }) => {
    window.chrome = { runtime: { onMessage: { addListener(listener) { window.listener = listener; } } } };
    window.commits = [];
    window.unchangedOpenings = 0;
    window.foreignClicks = 0;
    const range = document.querySelector(".atsx-date-picker-period-month");
    const labels = [...range.querySelectorAll(".atsx-date-picker-period-month-label")];
    const portal = document.createElement("div");
    portal.innerHTML = portalHtml;
    document.body.append(portal);
    const panel = portal.querySelector(".atsx-date-picker-dropdown");
    const rect = range.getBoundingClientRect();
    panel.style.position = "fixed";
    panel.style.left = `${distantOnly ? 900 : rect.left}px`;
    panel.style.top = `${rect.bottom}px`;
    const foreign = portal.cloneNode(true);
    const foreignPanel = foreign.querySelector(".atsx-date-picker-dropdown");
    foreignPanel.style.left = "650px";
    foreign.onclick = () => { window.foreignClicks++; };
    document.body.append(foreign);
    let active = 0;
    let year = "";
    const items = [...panel.querySelectorAll(".atsx-date-picker-period-month-panel-list-item")];
    const focus = (index) => labels.forEach((label, i) => label.classList.toggle("atsx-date-picker-period-month-label-focus", i === index));
    labels.forEach((label, index) => {
      label.onclick = () => {
        const previous = panel.innerHTML;
        active = index;
        focus(index);
        panel.style.display = "";
        if (previous === panel.innerHTML) window.unchangedOpenings++;
      };
    });
    range.onkeydown = (event) => { if (event.key === "Escape") panel.style.display = "none"; };
    items.forEach((item) => {
      item.onclick = () => {
        if (distantOnly) { window.foreignClicks++; return; }
        const value = item.dataset.cy;
        if (value.length === 4) {
          setTimeout(() => {
            year = value;
            items.forEach((other) => other.classList.toggle("atsx-date-picker-period-month-panel-list-item-selected", other === item));
          }, 100);
        } else {
          const index = active;
          setTimeout(() => {
            labels[index].querySelector('[data-cy="year"]').textContent = year;
            labels[index].querySelector('[data-cy="month"]').textContent = value;
            window.commits.push({ index, value: `${year}-${value}` });
            if (index === 0) {
              active = 1;
              year = "";
              focus(1);
              items.forEach((other) => other.classList.remove("atsx-date-picker-period-month-panel-list-item-selected"));
            }
          }, 100);
        }
      };
    });
  }, { portalHtml, distantOnly });
  for (const file of ["shared/profile.js", "shared/matcher.js", "content.js"]) {
    await page.addScriptTag({ path: path.join(__dirname, "..", file) });
  }
  return page;
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
  try {
    for (const [kind, distantOnly] of [["work", false], ["internship", false], ["work", true]]) {
      const page = await setup(browser, kind, distantOnly);
      try {
        const key = kind === "work" ? "work_experience" : "internship_experience";
        const profile = { [key]: [{ company: "测试公司", start_date: "2022-08", end_date: "2025-09" }], autofill: { repeat_sections: { [key]: 1 } } };
        const send = (type) => page.evaluate(({ type, profile }) => new Promise(resolve => window.listener({ type, profile, overwrite: true }, null, resolve)), { type, profile });
        const scan = await send("JOB_AUTOFILL_SCAN");
        assert.deepEqual(scan.fields.map(f => f.match.path), [`${key}[].company`, `${key}[].start_date`, `${key}[].end_date`]);
        const fill = await send("JOB_AUTOFILL_FILL");
        const dates = fill.results.filter(f => /date$/.test(f.match.path));
        assert.deepEqual(dates.map(f => f.status), distantOnly ? ["option-not-found", "option-not-found"] : ["verified-filled", "verified-filled"]);
        assert.equal(await page.evaluate(() => window.foreignClicks), 0);
        if (!distantOnly) {
          assert.deepEqual(await page.evaluate(() => window.commits), [{ index: 0, value: "2022-08" }, { index: 1, value: "2025-09" }]);
          assert.equal(await page.evaluate(() => window.unchangedOpenings), 2);
        }
        assert.equal(await page.locator(".atsx-date-picker-period-hidden-input").inputValue(), "");
        console.log(`PASS ${kind}: ${distantOnly ? "reject unrelated floating panel" : "shared unchanged portal, blank placeholders, automatic end focus"}`);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

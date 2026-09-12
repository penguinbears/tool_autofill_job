const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const popupHtml = fs.readFileSync(path.join(__dirname, "fixtures/atsx-month-dropdown.html"), "utf8");
const profile = { education: [{ start_date: "2024-01", end_date: "2025-10" }], autofill: { repeat_sections: { education: 1, work_experience: 0 } } };

async function fixture(browser, config = {}) {
  const page = await browser.newPage();
  await page.setContent(`<style>
    .atsx-date-picker-period-month-label {display:inline-block; padding:10px; border:1px solid #888}
    .atsx-date-picker-dropdown {position:fixed; left:10px!important; top:80px!important; background:white}
    .atsx-date-picker-period-month-panel {display:flex}
    .atsx-date-picker-period-month-panel-list {height:333px; overflow:auto; width:120px}
    .atsx-date-picker-period-month-panel-list-item {height:28px}
    </style><section><h2>教育经历</h2><div class="form-item"><label>在校时间</label><div id="range"></div></div></section>`);
  await page.evaluate(({ popupHtml, config }) => {
    window.clicks = [];
    window.submitCount = 0;
    window.commits = [];
    window.chrome = { runtime: { onMessage: { addListener(listener) { window.listener = listener; } } } };
    window.JobAutofillStorage = { addApplicationRecord: async () => {} };
    if (config.moka) document.body.insertAdjacentHTML("beforeend", '<input type="hidden" id="moka-version">');
    const range = document.querySelector("#range");
    const values = config.initial || ["", ""];
    let active = null;
    function renderLabels() {
      range.innerHTML = values.map((value, index) => {
        const [year, month] = value.split("-");
        return `<div class="atsx-date-picker-period-month-label" data-index="${index}" ${config.disabled ? 'aria-disabled="true"' : ''}>
          <span class="atsx-date-picker-period-month-label-value atsx-date-picker-period-month-label-year" data-cy="year">${year || "年"}</span>
          <span class="atsx-date-picker-period-month-label-separator">-</span>
          <span class="atsx-date-picker-period-month-label-value atsx-date-picker-period-month-label-month" data-cy="month">${month || "月"}</span></div>`;
      }).join("");
      range.querySelectorAll(".atsx-date-picker-period-month-label").forEach((label, index) => {
        label.onclick = () => {
          window.clicks.push(`open:${index}`);
          if (active) { active.remove(); active = null; return; }
          const [year, month] = (values[index] || "2026-05").split("-");
          setTimeout(() => renderPanel(index, year, month), config.openDelay || 120);
        };
        label.onkeydown = (event) => {
          if (event.key === "Escape" && active) { active.remove(); active = null; }
        };
      });
    }
    function renderPanel(index, year, month) {
      const template = document.createElement("template");
      template.innerHTML = popupHtml;
      const panel = template.content.firstElementChild;
      panel.dataset.owner = String(index);
      panel.querySelectorAll(".atsx-date-picker-period-month-panel-list-item").forEach((item) => {
        const value = item.dataset.cy;
        if (config.missing === value) { item.remove(); return; }
        item.classList.toggle("atsx-date-picker-period-month-panel-list-item-selected", value === year || value === month);
        if (config.disabledMonth === value) item.setAttribute("aria-disabled", "true");
        item.onclick = () => {
          window.clicks.push(`${index}:${value}`);
          if (item.getAttribute("aria-disabled") === "true") throw new Error("clicked disabled option");
          if (value.length === 4) {
            setTimeout(() => {
              renderLabels(); // 选年时连同另一个日期入口一起重建。
              renderPanel(index, value, month);
            }, config.yearDelay || 180);
          } else {
            setTimeout(() => {
              if (!config.rejectCommit) {
                values[index] = `${year}-${value}`;
                window.commits.push({ index, value: values[index] });
                renderLabels();
              }
              active?.remove(); active = null;
            }, config.commitDelay || 100);
          }
        };
      });
      active?.remove();
      document.body.append(panel);
      active = panel;
    }
    renderLabels();
    if (config.preopen) renderPanel(0, "2026", "05");
    // 页面上已有另一个可见弹层，且 DOM 顺序靠后，不能误点。
    const unrelated = document.createElement("div");
    unrelated.innerHTML = popupHtml;
    unrelated.id = "unrelated";
    unrelated.onclick = () => { window.clicks.push("WRONG-POPUP"); };
    document.body.append(unrelated);
    const hidden = unrelated.cloneNode(true);
    hidden.id = "hidden-popup";
    hidden.style.display = "none";
    document.body.append(hidden);
  }, { popupHtml, config });
  for (const file of ["shared/profile.js", "shared/matcher.js", "content.js"]) {
    await page.addScriptTag({ path: path.join(__dirname, "..", file) });
  }
  return page;
}

function send(page, type, options = {}) {
  return page.evaluate(({ type, options, profile }) => new Promise((resolve) => {
    window.listener({ type, profile, ...options }, null, resolve);
  }), { type, options, profile });
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
  try {
    const cases = [
      { name: "delayed render and replaced nodes", config: { openDelay: 650, yearDelay: 400, commitDelay: 350 }, expected: "verified-filled" },
      { name: "Moka page routes ATSX first", config: { moka: true }, expected: "verified-filled" },
      { name: "already opened date panel", config: { preopen: true }, expected: "verified-filled" },
      { name: "preserve existing dates", config: { initial: ["2026-05", "2026-05"] }, expected: "existing-value" },
      { name: "overwrite existing dates", config: { initial: ["2026-05", "2026-05"] }, overwrite: true, expected: "verified-filled" },
      { name: "disabled controls", config: { disabled: true }, expected: "disabled" },
      { name: "missing year", config: { missing: "2024" }, expected: "option-not-found", firstOnly: true },
      { name: "disabled month", config: { disabledMonth: "01" }, expected: "option-not-found", firstOnly: true },
      { name: "uncommitted click cannot pass verification", config: { rejectCommit: true }, expected: "verification-failed" }
    ];
    for (const test of cases) {
      const page = await fixture(browser, test.config);
      try {
        const scan = await send(page, "JOB_AUTOFILL_SCAN");
        assert.equal(scan.fields.length, 2, "only date entry points are scanned");
        assert.deepEqual(scan.fields.map((field) => field.match.path), ["education[].start_date", "education[].end_date"]);
        const fill = await send(page, "JOB_AUTOFILL_FILL", { overwrite: Boolean(test.overwrite) });
        const statuses = fill.results.map((field) => field.status);
        assert.deepEqual(statuses, test.firstOnly ? [test.expected, "verified-filled"] : [test.expected, test.expected], test.name);
        const clicks = await page.evaluate(() => window.clicks);
        assert(!clicks.includes("WRONG-POPUP"), "must not click unrelated visible panel");
        if (test.expected === "verified-filled") {
          assert.deepEqual(await page.evaluate(() => window.commits), [{ index: 0, value: "2024-01" }, { index: 1, value: "2025-10" }]);
          assert(!clicks.includes("0:10") && !clicks.includes("1:01"), "months must match exactly");
        }
        if (["existing-value", "disabled"].includes(test.expected)) assert.equal(clicks.length, 0);
        assert.equal(await page.locator(".atsx-date-picker-dropdown[data-owner]").count(), 0, "own popup must close");
        assert.equal((await send(page, "JOB_AUTOFILL_SCAN")).fields.length, 2, "rescanning must not include popup nodes");
        console.log(`PASS ${test.name}`);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

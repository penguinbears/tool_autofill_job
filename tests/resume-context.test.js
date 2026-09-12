const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const profile = {
  education: [
    { school: "甲大学", start_date: "2024-09", end_date: "2027-06", major: "软件工程" },
    { school: "乙大学", start_date: "2017-09", end_date: "2021-09", major: "计算机科学" }
  ],
  work_experience: [{ company: "正式工作公司", position: "正式职位", start_date: "2022-08", end_date: "2025-09", responsibilities: "工作内容" }],
  internship_experience: [
    { company: "甲公司", position: "甲实习职位", start_date: "2026-03", end_date: "2026-07", responsibilities: "甲实习内容" },
    { company: "乙公司", position: "乙实习职位", start_date: "2025-01", end_date: "2025-02", responsibilities: "乙实习内容" }
  ],
  autofill: { repeat_sections: { education: 4, work_experience: 1, internship_experience: 4 } }
};

async function setup(browser, school = "乙大学", company = "乙公司") {
  const page = await browser.newPage();
  const field = (label, name, value, type = "text") => `<div class="atsx-form-item"><label class="atsx-form-item-label">${label}</label><input name="${name}" type="${type}" value="${value}"></div>`;
  const card = (kind, identity, index) => `<div class="resumeEditForm-item resumeEditForm-${kind}" id="${kind}-${index}">
    ${field(kind === "education" ? "学校名称" : "公司名称", "identity", identity)}
    ${field("开始时间", "start", "2026-05", "month")}${field("结束时间", "end", "2026-06", "month")}
    ${field(kind === "education" ? "专业" : "职位", "detail", "旧内容")}
    ${kind === "education" ? "" : '<div class="atsx-form-item"><label class="atsx-form-item-label">工作内容</label><textarea name="description">旧描述</textarea></div>'}
    </div>`;
  await page.setContent(`<main>${card("education", school, 0)}${card("education", "甲大学", 1)}
    ${card("internship", company, 0)}${card("internship", "甲公司", 1)}${card("work", "正式工作公司", 0)}</main>`);
  await page.evaluate(() => {
    window.chrome = { runtime: { onMessage: { addListener(listener) { window.listener = listener; } } } };
  });
  for (const file of ["shared/profile.js", "shared/matcher.js", "content.js"]) {
    await page.addScriptTag({ path: path.join(__dirname, "..", file) });
  }
  return page;
}

async function send(page, type, candidate = profile) {
  return page.evaluate(({ type, profile }) => new Promise((resolve) => {
    window.listener({ type, profile, overwrite: true }, null, resolve);
  }), { type, profile: candidate });
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
  try {
    let page = await setup(browser);
    let scan = await send(page, "JOB_AUTOFILL_SCAN");
    assert.equal(scan.fields.length, 23);
    assert.equal(scan.fields.find((field) => field.match.path === "education[].start_date").arrayIndex, 1);
    assert.equal(scan.fields.find((field) => field.match.path === "internship_experience[].start_date").arrayIndex, 1);
    let fill = await send(page, "JOB_AUTOFILL_FILL");
    assert(fill.results.every((field) => field.status === "verified-filled"), JSON.stringify(fill.results.map(f => [f.match.path, f.status])));
    assert.equal(await page.locator('#education-0 [name="start"]').inputValue(), "2017-09");
    assert.equal(await page.locator('#education-1 [name="end"]').inputValue(), "2027-06");
    assert.equal(await page.locator('#internship-0 [name="detail"]').inputValue(), "乙实习职位");
    assert.equal(await page.locator('#internship-0 [name="description"]').inputValue(), "乙实习内容");
    assert.equal(await page.locator('#internship-1 [name="detail"]').inputValue(), "甲实习职位");
    assert.equal(await page.locator('#work-0 [name="detail"]').inputValue(), "正式职位");
    await page.close();
    console.log("PASS reversed school/company order and separate internship/work data");

    page = await setup(browser, "不在档案的大学", "不在档案的公司");
    fill = await send(page, "JOB_AUTOFILL_FILL");
    assert.equal(fill.results.filter((field) => field.status === "identity-not-found").length, 9);
    assert.equal(await page.locator('#education-0 [name="start"]').inputValue(), "2026-05");
    assert.equal(await page.locator('#internship-0 [name="description"]').inputValue(), "旧描述");
    await page.close();
    console.log("PASS unknown identities never fall back to array position");

    page = await setup(browser, "", "");
    fill = await send(page, "JOB_AUTOFILL_FILL");
    assert.equal(await page.locator('#education-0 [name="identity"]').inputValue(), "乙大学");
    assert.equal(await page.locator('#internship-0 [name="identity"]').inputValue(), "乙公司");
    await page.close();
    console.log("PASS empty cards use unclaimed profile records");

    page = await setup(browser);
    const duplicate = structuredClone(profile);
    duplicate.education.push({ ...duplicate.education[1], start_date: "2013-09" });
    fill = await send(page, "JOB_AUTOFILL_FILL", duplicate);
    assert.equal(fill.results.filter((field) => field.status === "identity-ambiguous").length, 4);
    assert.equal(await page.locator('#education-0 [name="start"]').inputValue(), "2026-05");
    await page.close();
    console.log("PASS ambiguous school match requires resolution");

    page = await setup(browser);
    const invalid = structuredClone(profile);
    invalid.internship_experience[1].start_date = "2025-12";
    fill = await send(page, "JOB_AUTOFILL_FILL", invalid);
    assert.equal(fill.results.filter((field) => field.status === "invalid-date-range").length, 2);
    assert.equal(await page.locator('#internship-0 [name="start"]').inputValue(), "2026-05");
    assert.equal(await page.locator('#internship-0 [name="detail"]').inputValue(), "乙实习职位");
    await page.close();
    console.log("PASS invalid date range is reported while other fields fill");

    page = await setup(browser);
    const later = structuredClone(profile);
    later.education[1].start_date = "2027-01";
    later.education[1].end_date = "2028-06";
    later.internship_experience[1].responsibilities = ["第一段", "第二段"];
    await page.evaluate(() => {
      const card = document.querySelector("#education-0");
      const start = card.querySelector('[name="start"]');
      const end = card.querySelector('[name="end"]');
      start.addEventListener("change", () => { if (start.value > end.value) start.value = "2026-05"; });
    });
    fill = await send(page, "JOB_AUTOFILL_FILL", later);
    assert.equal(await page.locator('#education-0 [name="start"]').inputValue(), "2027-01");
    assert.equal(await page.locator('#education-0 [name="end"]').inputValue(), "2028-06");
    assert.equal(await page.locator('#internship-0 [name="description"]').inputValue(), "第一段\n第二段");
    assert(fill.results.every((field) => field.status === "verified-filled"));
    await page.close();
    console.log("PASS constrained date ranges fill end first when needed; multiline descriptions retain paragraphs");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

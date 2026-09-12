const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const hardTimeout = setTimeout(() => {
    console.error("dom integration test timed out");
    process.exit(1);
  }, 20000);
  console.log("launching browser");
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  });
  console.log("browser launched");
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(__dirname, "fixture.html")).href);
  console.log("fixture loaded");

  await page.evaluate(() => {
    window.__jobAutofillListeners = [];
    window.chrome = {
      runtime: {
        onMessage: {
          addListener(listener) {
            window.__jobAutofillListeners.push(listener);
          }
        }
      }
    };
  });

  for (const file of ["../shared/profile.js", "../shared/matcher.js", "../content.js"]) {
    await page.addScriptTag({ path: path.join(__dirname, file) });
  }

  const profile = {
    personal: {
      full_name: "测试用户",
      phone: "13800138000",
      email: "new@example.com",
      highest_degree: "硕士"
    },
    application: {
      first_choice_location: "北京",
      referral_code: ""
    },
    education: [
      {
        school: "示例大学",
        major: "软件工程",
        start_date: "2024-09",
        end_date: "2027-06"
      },
      {
        school: "第二大学",
        major: "计算机科学",
        start_date: "2020-09",
        end_date: "2024-06"
      }
    ],
    work_experience: [
      {
        company: "示例公司",
        position: "产品经理",
        responsibilities: "负责产品规划"
      },
      {
        company: "第二公司",
        position: "产品实习生",
        responsibilities: "负责需求分析"
      }
    ],
    autofill: {
      repeat_sections: {
        education: 2,
        work_experience: 2
      }
    },
    sensitive: {
      id_number: "SHOULD-NOT-FILL"
    }
  };

  const scan = await page.evaluate((candidateProfile) => new Promise((resolve) => {
    window.__jobAutofillListeners[0](
      { type: "JOB_AUTOFILL_SCAN", profile: candidateProfile },
      null,
      resolve
    );
  }), profile);
  console.log("scan completed");

  assert(scan.ok, "scan failed");
  assert(scan.fields.some((field) => field.match.path === "personal.full_name"), "name was not recognized");
  assert(scan.fields.some((field) => field.match.path === "education[].school"), "school was not recognized");
  assert(scan.fields.some((field) => field.match.sensitive), "sensitive field was not flagged");

  const fill = await page.evaluate((candidateProfile) => new Promise((resolve) => {
    window.__jobAutofillListeners[0](
      { type: "JOB_AUTOFILL_FILL", profile: candidateProfile, overwrite: false },
      null,
      resolve
    );
  }), profile);
  console.log("fill completed");

  assert(fill.ok, "fill failed");
  assert(await page.locator("#name").inputValue() === "测试用户", "name was not filled");
  assert(await page.locator("#phone").inputValue() === "13800138000", "phone was not filled");
  assert(await page.locator("#email").inputValue() === "existing@example.com", "existing email was overwritten");
  assert(await page.locator("#degree").inputValue() === "master", "native select was not filled");
  assert(await page.locator("#location").getAttribute("data-value") === "北京", "custom combobox was not filled");
  assert(await page.locator(".education-item").count() === 2, "second education block was not added");
  assert(await page.locator(".work-item").count() === 2, "second work block was not added");
  assert(await page.locator(".education-item input").nth(0).inputValue() === "示例大学", "education school was not filled");
  assert(await page.locator(".education-item input").nth(4).inputValue() === "第二大学", "second education was not filled");
  assert(await page.locator(".work-item input").nth(0).inputValue() === "示例公司", "work company was not filled");
  assert(await page.locator(".work-item input").nth(2).inputValue() === "第二公司", "second work company was not filled");
  assert(await page.locator("#id-number").inputValue() === "", "sensitive field was filled");
  assert(await page.evaluate(() => window.submitCount) === 0, "form was submitted");

  const preserved = fill.results.filter((item) => item.status === "existing-value");
  assert(preserved.some((item) => item.match.path === "personal.email"), "existing-value status missing");

  await browser.close();
  clearTimeout(hardTimeout);
  console.log("dom integration test passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

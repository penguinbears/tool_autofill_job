const path = require("node:path");
const { chromium } = require("playwright");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sunnyLoggedIn = `
  <div class="navbar-gtb7 navbar-sd">
    <div class="navbar-head-nCSb">
      <div class="logo-m7u"><a href="/" title="首页">首页</a></div>
      <div class="nav-wrapper"><a href="/jobs">校园招聘</a><a href="/about">关于舜宇</a></div>
      <div class="account-q4V"><div class="avatar--10"><div class="avatar--name">许</div></div></div>
    </div>
  </div>`;

const sunnyLoggedOut = `
  <div class="navbar-gtb7 navbar-sd">
    <div class="navbar-head-nCSb">
      <div class="logo-m7u"><a href="/" title="首页">首页</a></div>
      <div class="nav-wrapper"><a href="/jobs">校园招聘</a><a href="/about">关于舜宇</a></div>
      <div class="account-q4V"><button type="button">登录 / 注册</button></div>
    </div>
  </div>`;

async function stateFor(page, markup) {
  await page.setContent(`<!doctype html><style>
    body { margin: 0; }
    [class*="navbar-head"] { width: 100vw; height: 72px; display: flex; align-items: center; }
    [class*="logo"] { width: 180px; }
    .nav-wrapper { display: flex; gap: 20px; flex: 1; }
    [class*="account"] { width: 140px; display: flex; justify-content: flex-end; }
    [class*="avatar"] { width: 36px; height: 36px; }
  </style>${markup}`);
  await page.evaluate(() => {
    window.chrome = { runtime: { onMessage: { addListener() {} } } };
  });
  await page.addScriptTag({ path: path.join(__dirname, "../session-detector.js") });
  return page.evaluate(() => window.JobAutofillSessionDetector.detect());
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  let result = await stateFor(page, sunnyLoggedIn);
  assert(result.state === "logged-in", `logged-in Sunny header was ${result.state}`);
  assert(result.confidence >= 0.9, "logged-in confidence was too low");

  result = await stateFor(page, sunnyLoggedOut);
  assert(result.state === "logged-out", `logged-out Sunny header was ${result.state}`);

  result = await stateFor(page, "<main><h1>公开职位详情</h1><p>请投递简历</p></main>");
  assert(result.state === "unknown", `page without account header was ${result.state}`);

  await browser.close();
  console.log("session detector tests passed: 3");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

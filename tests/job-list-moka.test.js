const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function titleNode(text) {
  return {
    innerText: text,
    textContent: text,
    insertAdjacentElement() {}
  };
}

function mokaCard(title, jobId, degree) {
  const titleElement = titleNode(title);
  const anchor = {
    href: `https://app.mokahr.com/campus-recruitment/sunnyoptical/45602?recommendCode=secret#/job/${jobId}`,
    getAttribute(name) {
      return name === "href" ? `#/job/${jobId}` : null;
    }
  };
  return {
    innerText: `${title} 发布于 2026-08-28 ${degree}`,
    textContent: `${title} 发布于 2026-08-28 ${degree}`,
    getBoundingClientRect() { return { width: 460, height: 120 }; },
    querySelector(selector) {
      if (selector.includes("target-color-container")) return titleElement;
      if (selector === "a[href]") return null;
      return null;
    },
    closest(selector) {
      return selector === "a[href]" ? anchor : null;
    }
  };
}

const cards = [
  mokaCard("市场开发-深圳", "035adb3e-207f-4317-a189-9548ba242b51", "本科"),
  mokaCard("工业设计-深圳", "8df6e40c-f456-4225-acaa-0e6f619a3dca", "本科")
];
let listener;
const context = vm.createContext({
  URL,
  console,
  location: {
    href: "https://app.mokahr.com/campus-recruitment/sunnyoptical/45602?recommendCode=secret#/jobs",
    hostname: "app.mokahr.com",
    hash: "#/jobs"
  },
  getComputedStyle() { return { display: "block", visibility: "visible" }; },
  document: {
    querySelectorAll(selector) {
      if (selector === "[class*='card-content-']") return cards;
      throw new Error(`Moka detection unexpectedly used the generic selector: ${selector}`);
    }
  },
  chrome: {
    runtime: {
      onMessage: {
        addListener(value) { listener = value; }
      }
    }
  }
});

vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../job-list.js"), "utf8"),
  context,
  { filename: "job-list.js" }
);

let response;
listener({ type: "JOB_MATCH_DISCOVER" }, {}, (value) => { response = value; });

assert(response && response.ok, "Moka discovery did not respond successfully");
assert(response.jobs.length === 2, "Moka job cards were not detected exclusively");
assert(response.jobs[0].title === "市场开发-深圳", "Moka title selector returned the wrong text");
assert(response.jobs[0].url.endsWith("#/job/035adb3e-207f-4317-a189-9548ba242b51"), "Moka hash route was removed from the job URL");
assert(response.jobs.every((job) => job.platform === "moka"), "Moka jobs were not tagged with their platform");
assert(response.jobs.every((job) => !Object.hasOwn(job, "anchor") && !Object.hasOwn(job, "target")), "DOM nodes leaked into the runtime message");

console.log("Moka job-list tests passed: 6");

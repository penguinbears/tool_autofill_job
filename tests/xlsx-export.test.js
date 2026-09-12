const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const context = vm.createContext({
  globalThis: {},
  Blob,
  TextEncoder,
  Uint8Array,
  Uint32Array,
  Date,
  Math,
  Map,
  Array,
  Object,
  String,
  Number,
  RegExp
});
const source = fs.readFileSync(
  path.join(__dirname, "../shared/xlsx-export.js"),
  "utf8"
);
vm.runInContext(source, context, { filename: "shared/xlsx-export.js" });

const records = [
  {
    id: "1",
    title: "极氪汽车 - 舱内安全产品经理",
    company: "极氪汽车",
    position: "舱内安全产品经理",
    category: "产品",
    status: "applied",
    date: "2026-07-26T02:30:00.000Z",
    url: "https://jobs.example.com/apply?id=1&source=test"
  },
  {
    id: "2",
    title: "示例科技 - 前端工程师",
    company: "示例科技",
    position: "前端工程师",
    category: "技术研发",
    status: "interviewing",
    date: "2026-07-25T08:00:00.000Z",
    url: "https://jobs.example.com/apply?id=2"
  },
  {
    id: "3",
    title: "示例科技 - 产品实习生",
    company: "示例科技",
    position: "产品实习生",
    category: "产品",
    status: "pending",
    date: "2026-07-24T08:00:00.000Z",
    url: "https://jobs.example.com/apply?id=3"
  }
];

(async () => {
  const api = context.globalThis.JobAutofillXlsx;
  assert(api, "xlsx API was not exposed");
  const blob = api.buildApplicationHistoryWorkbook(records);
  assert(blob.type === api.MIME_TYPE, "unexpected workbook MIME type");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert(bytes[0] === 0x50 && bytes[1] === 0x4B, "xlsx is not a ZIP package");
  assert(bytes.length > 5000, "xlsx package is unexpectedly small");

  const output = process.argv[2];
  if (output) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, bytes);
  }
  console.log(JSON.stringify({
    passed: true,
    records: records.length,
    bytes: bytes.length,
    output: output || ""
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

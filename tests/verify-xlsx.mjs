import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = process.argv[2];
const previewDir = process.argv[3];
if (!inputPath || !previewDir) {
  throw new Error("usage: verify-xlsx.mjs <input.xlsx> <preview-dir>");
}

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const records = await workbook.inspect({
  kind: "table",
  range: "投递记录!A1:H8",
  include: "values,formulas",
  tableMaxRows: 8,
  tableMaxCols: 8
});
const summary = await workbook.inspect({
  kind: "table",
  range: "分类统计!A1:B8",
  include: "values,formulas",
  tableMaxRows: 8,
  tableMaxCols: 2
});
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "投递导出公式错误扫描"
});

await fs.mkdir(previewDir, { recursive: true });
for (const sheetName of ["投递记录", "分类统计"]) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1.5,
    format: "png"
  });
  const fileName = sheetName === "投递记录" ? "records-preview.png" : "summary-preview.png";
  await fs.writeFile(
    path.join(previewDir, fileName),
    new Uint8Array(await preview.arrayBuffer())
  );
}

console.log(JSON.stringify({
  records: records.ndjson,
  summary: summary.ndjson,
  errors: errors.ndjson,
  previews: [
    path.join(previewDir, "records-preview.png"),
    path.join(previewDir, "summary-preview.png")
  ]
}, null, 2));

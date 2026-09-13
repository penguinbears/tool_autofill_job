const fs = require("node:fs");
const path = require("node:path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const projectRoot = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(projectRoot, "popup.html"), "utf8");
const script = fs.readFileSync(path.join(projectRoot, "popup.js"), "utf8");
const styles = fs.readFileSync(path.join(projectRoot, "popup.css"), "utf8");

[
  'id="summary"',
  'id="field-list"',
  'id="missing-editor"',
  'id="attention"',
  'id="bind-json"',
  "需要补填",
  "需要你处理"
].forEach((removedContent) => {
  assert(!html.includes(removedContent), `removed popup content remains: ${removedContent}`);
});

assert(!script.includes("renderMissingEditor"), "missing-data editor logic remains");
assert(!script.includes("renderAttention"), "attention diagnostic logic remains");
assert(!styles.includes(".metrics"), "removed metric styles remain");
assert(!styles.includes(".missing-row"), "removed missing-data styles remain");
assert(!styles.includes(".attention"), "removed attention styles remain");

console.log("Popup UI removal tests passed: 12");

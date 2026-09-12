(function (root) {
  "use strict";

  const MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  function xmlText(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function xmlAttr(value) {
    return xmlText(value)
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function columnName(index) {
    let value = index + 1;
    let result = "";
    while (value > 0) {
      value -= 1;
      result = String.fromCharCode(65 + (value % 26)) + result;
      value = Math.floor(value / 26);
    }
    return result;
  }

  function inlineCell(row, column, value, style) {
    const reference = `${columnName(column)}${row}`;
    const text = String(value == null ? "" : value);
    return `<c r="${reference}" t="inlineStr" s="${style || 0}"><is><t xml:space="preserve">${xmlText(text)}</t></is></c>`;
  }

  function numberCell(row, column, value, style) {
    return `<c r="${columnName(column)}${row}" s="${style || 0}"><v>${Number(value) || 0}</v></c>`;
  }

  function formulaCell(row, column, formula, cachedValue, style) {
    return `<c r="${columnName(column)}${row}" s="${style || 0}"><f>${xmlText(formula)}</f><v>${Number(cachedValue) || 0}</v></c>`;
  }

  function excelDateSerial(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return (date.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
  }

  function statusLabel(status) {
    const labels = {
      filled: "已填充（旧状态）",
      "verified-filled": "验证成功",
      "verification-failed": "验证失败",
      applied: "已投递",
      pending: "待处理",
      interviewing: "面试中",
      rejected: "已结束",
      offer: "已录用"
    };
    return labels[status] || status || "已记录";
  }

  function recordSheetXml(history, now) {
    const rows = [];
    rows.push(`<row r="1" ht="28" customHeight="1">${inlineCell(1, 0, "秋招投递情况", 1)}</row>`);
    rows.push(`<row r="2">${inlineCell(2, 0, `实时导出：${now.toLocaleString("zh-CN")}`, 7)}${inlineCell(2, 1, `共 ${history.length} 条记录`, 7)}</row>`);
    rows.push(`<row r="3"></row>`);
    const headers = ["序号", "公司", "职位", "职位分类", "状态", "投递时间", "URL", "页面标题"];
    rows.push(`<row r="4" ht="24" customHeight="1">${headers.map((value, index) => inlineCell(4, index, value, 2)).join("")}</row>`);

    const hyperlinks = [];
    const relationships = [];
    history.forEach((item, index) => {
      const row = index + 5;
      const dateSerial = excelDateSerial(item.date);
      const cells = [
        numberCell(row, 0, index + 1, 6),
        inlineCell(row, 1, item.company || "", 4),
        inlineCell(row, 2, item.position || "", 4),
        inlineCell(row, 3, item.category || "未分类", 4),
        inlineCell(row, 4, statusLabel(item.status), 4),
        dateSerial == null
          ? inlineCell(row, 5, item.date || "", 4)
          : numberCell(row, 5, dateSerial, 3),
        inlineCell(row, 6, item.url || "", 5),
        inlineCell(row, 7, item.title || "", 4)
      ];
      rows.push(`<row r="${row}">${cells.join("")}</row>`);
      if (/^https?:\/\//i.test(item.url || "")) {
        const relationshipId = `rId${relationships.length + 1}`;
        hyperlinks.push(`<hyperlink ref="G${row}" r:id="${relationshipId}"/>`);
        relationships.push(
          `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlAttr(item.url)}" TargetMode="External"/>`
        );
      }
    });

    const lastRow = Math.max(4, history.length + 4);
    const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:H${lastRow}"/>
  <sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>
    <col min="1" max="1" width="8" customWidth="1"/>
    <col min="2" max="2" width="22" customWidth="1"/>
    <col min="3" max="3" width="28" customWidth="1"/>
    <col min="4" max="4" width="16" customWidth="1"/>
    <col min="5" max="5" width="14" customWidth="1"/>
    <col min="6" max="6" width="21" customWidth="1"/>
    <col min="7" max="7" width="52" customWidth="1"/>
    <col min="8" max="8" width="40" customWidth="1"/>
  </cols>
  <sheetData>${rows.join("")}</sheetData>
  <mergeCells count="1"><mergeCell ref="A1:H1"/></mergeCells>
  <autoFilter ref="A4:H${lastRow}"/>
  ${hyperlinks.length ? `<hyperlinks>${hyperlinks.join("")}</hyperlinks>` : ""}
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
</worksheet>`;

    const relationXml = relationships.length
      ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join("")}</Relationships>`
      : "";
    return { worksheet, relationXml };
  }

  function summarySheetXml(history) {
    const counts = new Map();
    history.forEach((item) => {
      const category = item.category || "未分类";
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    const categories = Array.from(counts.keys()).sort((left, right) => left.localeCompare(right, "zh-CN"));
    const rows = [];
    rows.push(`<row r="1" ht="28" customHeight="1">${inlineCell(1, 0, "职位分类统计", 1)}</row>`);
    rows.push(`<row r="2">${inlineCell(2, 0, "分类", 2)}${inlineCell(2, 1, "投递数量", 2)}</row>`);
    categories.forEach((category, index) => {
      const row = index + 3;
      const formula = `COUNTIF('投递记录'!$D$5:$D$${Math.max(5, history.length + 4)},A${row})`;
      rows.push(`<row r="${row}">${inlineCell(row, 0, category, 4)}${formulaCell(row, 1, formula, counts.get(category), 6)}</row>`);
    });
    const totalRow = categories.length + 3;
    rows.push(`<row r="${totalRow}">${inlineCell(totalRow, 0, "合计", 2)}${formulaCell(totalRow, 1, `SUM(B3:B${Math.max(3, totalRow - 1)})`, history.length, 2)}</row>`);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:B${totalRow}"/>
  <sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  <cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="16" customWidth="1"/></cols>
  <sheetData>${rows.join("")}</sheetData>
  <mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>
  <pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.2" footer="0.2"/>
</worksheet>`;
  }

  function stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/></numFmts>
  <fonts count="4">
    <font><sz val="11"/><name val="Microsoft YaHei"/></font>
    <font><b/><sz val="18"/><color rgb="FF173042"/><name val="Microsoft YaHei"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/></font>
    <font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Microsoft YaHei"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0B7F83"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEAF2F3"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFDDE4EA"/></left><right style="thin"><color rgb="FFDDE4EA"/></right><top style="thin"><color rgb="FFDDE4EA"/></top><bottom style="thin"><color rgb="FFDDE4EA"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  }

  function workbookFiles(history) {
    const now = new Date();
    const recordSheet = recordSheetXml(history, now);
    const files = {
      "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
      "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
      "docProps/core.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>秋招投递情况</dc:title><dc:creator>秋招智能填表助手</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now.toISOString()}</dcterms:created>
</cp:coreProperties>`,
      "docProps/app.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>秋招智能填表助手</Application></Properties>`,
      "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="投递记录" sheetId="1" r:id="rId1"/><sheet name="分类统计" sheetId="2" r:id="rId2"/></sheets>
  <calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/>
</workbook>`,
      "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
      "xl/styles.xml": stylesXml(),
      "xl/worksheets/sheet1.xml": recordSheet.worksheet,
      "xl/worksheets/sheet2.xml": summarySheetXml(history)
    };
    if (recordSheet.relationXml) {
      files["xl/worksheets/_rels/sheet1.xml.rels"] = recordSheet.relationXml;
    }
    return files;
  }

  function uint16(value) {
    return [value & 255, (value >>> 8) & 255];
  }

  function uint32(value) {
    return [
      value & 255,
      (value >>> 8) & 255,
      (value >>> 16) & 255,
      (value >>> 24) & 255
    ];
  }

  let crcTable = null;
  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let index = 0; index < 256; index += 1) {
        let current = index;
        for (let bit = 0; bit < 8; bit += 1) {
          current = (current & 1) ? (0xEDB88320 ^ (current >>> 1)) : (current >>> 1);
        }
        crcTable[index] = current >>> 0;
      }
    }
    let value = 0xFFFFFFFF;
    for (let index = 0; index < bytes.length; index += 1) {
      value = crcTable[(value ^ bytes[index]) & 255] ^ (value >>> 8);
    }
    return (value ^ 0xFFFFFFFF) >>> 0;
  }

  function dosTimeAndDate(date) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  function createZip(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const timestamp = dosTimeAndDate(new Date());

    Object.entries(files).forEach(([name, contents]) => {
      const nameBytes = encoder.encode(name);
      const data = encoder.encode(contents);
      const checksum = crc32(data);
      const localHeader = new Uint8Array([
        ...uint32(0x04034B50),
        ...uint16(20),
        ...uint16(0x0800),
        ...uint16(0),
        ...uint16(timestamp.time),
        ...uint16(timestamp.date),
        ...uint32(checksum),
        ...uint32(data.length),
        ...uint32(data.length),
        ...uint16(nameBytes.length),
        ...uint16(0)
      ]);
      localParts.push(localHeader, nameBytes, data);

      const centralHeader = new Uint8Array([
        ...uint32(0x02014B50),
        ...uint16(20),
        ...uint16(20),
        ...uint16(0x0800),
        ...uint16(0),
        ...uint16(timestamp.time),
        ...uint16(timestamp.date),
        ...uint32(checksum),
        ...uint32(data.length),
        ...uint32(data.length),
        ...uint16(nameBytes.length),
        ...uint16(0),
        ...uint16(0),
        ...uint16(0),
        ...uint16(0),
        ...uint32(0),
        ...uint32(offset)
      ]);
      centralParts.push(centralHeader, nameBytes);
      offset += localHeader.length + nameBytes.length + data.length;
    });

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array([
      ...uint32(0x06054B50),
      ...uint16(0),
      ...uint16(0),
      ...uint16(Object.keys(files).length),
      ...uint16(Object.keys(files).length),
      ...uint32(centralSize),
      ...uint32(offset),
      ...uint16(0)
    ]);
    return new Blob([...localParts, ...centralParts, end], { type: MIME_TYPE });
  }

  function buildApplicationHistoryWorkbook(history) {
    const records = Array.isArray(history) ? history : [];
    return createZip(workbookFiles(records));
  }

  function exportFileName(now) {
    const date = now || new Date();
    const two = (value) => String(value).padStart(2, "0");
    return `秋招投递情况-${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}.xlsx`;
  }

  function downloadApplicationHistory(history) {
    const blob = buildApplicationHistoryWorkbook(history);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportFileName();
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return { blob, fileName: anchor.download };
  }

  root.JobAutofillXlsx = {
    MIME_TYPE,
    buildApplicationHistoryWorkbook,
    downloadApplicationHistory,
    exportFileName
  };
})(globalThis);

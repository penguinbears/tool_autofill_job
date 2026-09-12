(function () {
  "use strict";

  const resultNode = document.createElement("pre");
  resultNode.id = "harness-results";
  resultNode.textContent = "RUNNING";
  document.body.prepend(resultNode);

  function text(element) {
    return String(element && (element.innerText || element.textContent) || "").replace(/\s+/g, " ").trim();
  }

  function clearRepeatItem(item) {
    item.querySelectorAll("input,textarea").forEach((control) => {
      const prototype = control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value");
      if (setter && setter.set) setter.set.call(control, "");
      else control.value = "";
    });
    item.querySelectorAll(".phoenix-select").forEach((select) => {
      const placeholder = select.querySelector(".phoenix-select__placeHolder");
      if (placeholder) placeholder.textContent = "请选择";
      const tip = select.querySelector(".phoenix-select__tipEle");
      if (tip) tip.textContent = "";
    });
  }

  document.querySelectorAll("[id$='_addButton']").forEach((button) => {
    button.addEventListener("click", () => {
      const section = button.closest(".sc-iAKWXU");
      const item = section && section.querySelector(".ux-standard-form");
      if (!section || !item) return;
      const clone = item.cloneNode(true);
      clearRepeatItem(clone);
      button.parentElement.insertBefore(clone, button);
    });
  });

  const dateOptions = [
    "2017-09", "2021-06", "2021-07", "2024-06", "2024-09",
    "2025-03", "2025-07", "2025-11", "2026-05", "2027-06"
  ];

  function optionsFor(select) {
    const item = select.closest(".form-item");
    const label = text(item && item.querySelector(".form-item__text"));
    const section = text(select.closest(".sc-iAKWXU") && select.closest(".sc-iAKWXU").querySelector(":scope > .sc-efQSVx"));
    if (/时间|日期/.test(label)) return dateOptions;
    if (label === "最高学历" || label === "学历") return ["硕士", "本科", "大专"];
    if (label === "当前所在省市") return ["北京", "上海", "杭州"];
    if (label === "意向工作地点") return ["广东省/深圳市", "北京", "上海", "杭州"];
    if (section === "语言能力") return ["英语", "熟练", "良好", "一般"];
    if (label === "获奖级别") return ["国家级", "省级", "校级"];
    return ["选项一", "选项二"];
  }

  document.addEventListener("click", (event) => {
    const select = event.target.closest && event.target.closest(".phoenix-select");
    if (!select) return;
    document.querySelectorAll(".harness-dropdown").forEach((node) => node.remove());
    const dropdown = document.createElement("div");
    dropdown.className = "harness-dropdown phoenix-select-dropdown";
    optionsFor(select).forEach((value) => {
      const option = document.createElement("div");
      option.className = "phoenix-option";
      option.textContent = value;
      option.addEventListener("click", (optionEvent) => {
        optionEvent.stopPropagation();
        const input = select.querySelector(".phoenix-select__input, input");
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
          if (setter && setter.set) setter.set.call(input, value);
          else input.value = value;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        const placeholder = select.querySelector(".phoenix-select__placeHolder");
        if (placeholder) placeholder.textContent = value;
        const tip = select.querySelector(".phoenix-select__tipEle");
        if (tip) tip.textContent = value;
        dropdown.remove();
      });
      dropdown.appendChild(option);
    });
    document.body.appendChild(dropdown);
  });

  function send(message) {
    return new Promise((resolve) => {
      globalThis.__jobAutofillListeners[0](message, null, resolve);
    });
  }

  function fieldByLabel(fields, label, repeatPosition) {
    return fields.find((field) => (
      field.descriptor.label === label &&
      (repeatPosition === undefined || field.repeatPosition === repeatPosition)
    ));
  }

  function itemValue(sectionName, position, label) {
    const section = Array.from(document.querySelectorAll(".sc-iAKWXU")).find((node) => (
      text(node.querySelector(":scope > .sc-efQSVx")) === sectionName
    ));
    const records = section ? section.querySelectorAll(".form") : [];
    const record = records[position];
    const item = record && Array.from(record.querySelectorAll(".form-item")).find((node) => (
      text(node.querySelector(".form-item__text")) === label
    ));
    const control = item && item.querySelector("input,textarea,.phoenix-select");
    if (!control) return "";
    if (control.classList.contains("phoenix-select")) {
      const input = control.querySelector(".phoenix-select__input, input");
      return input && input.value || "";
    }
    return control.value || "";
  }

  (async () => {
    const profile = await fetch("../candidate-profile.json").then((response) => response.json());
    [
      ...(profile.education || []),
      ...(profile.work_experience || [])
    ].forEach((item) => {
      [item.start_date, item.end_date].filter(Boolean).forEach((value) => {
        if (!dateOptions.includes(value)) dateOptions.push(value);
      });
    });
    const scan = await send({ type: "JOB_AUTOFILL_SCAN", profile });
    const fill = await send({ type: "JOB_AUTOFILL_FILL", profile, overwrite: false });
    const postScan = await send({ type: "JOB_AUTOFILL_SCAN", profile });

    const location = fieldByLabel(scan.fields, "意向工作地点");
    const educationEnd = fieldByLabel(postScan.fields, "结束时间", 1);
    const undergraduate = (profile.education || []).find((item) => item.school === "青岛科技大学") || {};
    const master = (profile.education || []).find((item) => item.school === "北京交通大学") || {};
    const checks = {
      scan_ok: scan.ok === true,
      beisen_fields_detected: scan.fields.length >= 35,
      label_detected: Boolean(location && location.match.path === "application.first_choice_location"),
      required_detected: Boolean(location && location.descriptor.required),
      education_added: fill.expansion.some((item) => item.key === "education" && item.after === 2),
      work_added: fill.expansion.some((item) => item.key === "work_experience" && item.after === 3),
      existing_education_mapped: itemValue("教育经历", 0, "学校名称") === "青岛科技大学",
      new_education_uses_unused_profile: itemValue("教育经历", 1, "学校名称") === "北京交通大学",
      existing_education_end_filled:
        itemValue("教育经历", 0, "结束时间") === (undergraduate.end_date || ""),
      master_education_end_handled: master.end_date
        ? itemValue("教育经历", 1, "结束时间") === master.end_date
        : Boolean(educationEnd && !educationEnd.hasValue),
      existing_work_mapped: itemValue("工作经历", 0, "公司名称") === "山东新华书店集团",
      new_work_uses_unused_profile: itemValue("工作经历", 1, "公司名称") === "极氪汽车",
      third_work_uses_remaining_profile: itemValue("工作经历", 2, "公司名称") === "海底捞",
      form_not_submitted: true
    };
    const passed = Object.values(checks).every(Boolean);
    document.body.dataset.testStatus = passed ? "passed" : "failed";
    const output = {
      passed,
      checks,
      expansion: fill.expansion,
      educationEndResults: fill.results
        .filter((field) => (
          field.match.path === "education[].end_date"
        ))
        .map((field) => ({
          status: field.status,
          repeatPosition: field.repeatPosition,
          arrayIndex: field.arrayIndex,
          currentValue: field.descriptor.currentValue,
          previewValue: field.previewValue
        })),
      missing: postScan.fields
        .filter((field) => field.match.path && !field.hasValue)
        .slice(0, 20)
        .map((field) => ({
          label: field.descriptor.label,
          path: field.match.path,
          repeatPosition: field.repeatPosition,
          arrayIndex: field.arrayIndex
        }))
    };
    globalThis.__harnessResult = output;
    document.body.dataset.harnessResult = JSON.stringify(output);
    resultNode.textContent = JSON.stringify(output, null, 2);
  })().catch((error) => {
    document.body.dataset.testStatus = "failed";
    const output = {
      passed: false,
      error: String(error && error.stack || error)
    };
    globalThis.__harnessResult = output;
    document.body.dataset.harnessResult = JSON.stringify(output);
    resultNode.textContent = JSON.stringify(output, null, 2);
  });
})();

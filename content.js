(function () {
  "use strict";

  if (globalThis.__JOB_AUTOFILL_CONTENT_LOADED__) return;
  globalThis.__JOB_AUTOFILL_CONTENT_LOADED__ = true;

  const SKIP_TYPES = new Set(["hidden", "submit", "button", "reset", "image", "password"]);

  // ===== 平台检测 =====
  let _platform = null;
  function detectPlatform() {
    if (_platform) return _platform;
    // Moka: 特征隐藏域 #moka-version
    if (document.querySelector("#moka-version")) { _platform = "moka"; return "moka"; }
    // Beisen: phoenix-select 组件或 sc-iAKWXU 区块
    if (document.querySelector(".phoenix-select, .sc-iAKWXU")) { _platform = "beisen"; return "beisen"; }
    _platform = "generic";
    return "generic";
  }
  function isMoka() { return detectPlatform() === "moka"; }

  // ===== Moka 平台稳定选择器（使用 [class*="..."] 通配，不依赖哈希后缀） =====
  const MOKA_SEL = {
    block: "[class*='apply-block-']",
    field: "[class*='apply-field-']",
    selectContainer: "[class*='sd-Select-container']",
    titleLabel: "[class*='title-']",
    blockTitle: "[class*='blockTitle-']",
    blockTitleText: "[class*='blockTitle-'] [class*='text-']",
    requiredAsterisk: "[class*='required-asterisk-']",
    disabledSelect: "[class*='sd-Select-containerDisabled']",
    disabledInput: "[class*='sd-Input-disabled']",
    displayValue: "[class*='sd-Input-display-value']",
    addon: "[class*='sd-Input-addon'],[class*='sd-Select-addon']",
    multiGroup: "[class*='apply-fields-'][class*='multi-']",
    monthRangeItems: "[class*='item-'],[class*='item-half-']",
    dropdownPortal: "[class*='sd-Dropdown-portal'],.sugar-portal > *"
  };

  const SECTION_SELECTORS = `section,fieldset,.sc-iAKWXU,${MOKA_SEL.block},.form,.ant-form,.el-form,.arco-form,.t-form,[class*='section'],[class*='module'],[class*='block'],[class*='experience'],[class*='education'],[class*='project']`;
  const FORM_ITEM_SELECTORS = [
    ".atsx-form-item",
    ".form-item",
    ".ant-form-item",
    ".el-form-item",
    ".arco-form-item",
    ".t-form__item",
    ".n-form-item",
    ".semi-form-field",
    MOKA_SEL.field
  ].join(",");
  const FRAMEWORK_SELECT_SELECTORS = [
    ".phoenix-select",
    ".ant-select",
    ".el-select",
    ".arco-select",
    ".t-select",
    ".n-select",
    ".semi-select",
    MOKA_SEL.selectContainer
  ].join(",");
  const CUSTOM_SELECT_SELECTORS = `${FRAMEWORK_SELECT_SELECTORS},[role='combobox'],.ant-picker,.el-date-editor,.arco-picker,[class*='datepicker'],[class*='DatePicker'],[class*='month-picker'],[class*='monthpicker'],[class*='picker']`;
  const ATSX_MONTH_LABEL = ".atsx-date-picker-period-month-label";
  const ATSX_MONTH_RANGE = ".atsx-date-picker-period-month";
  const ATSX_MONTH_PANEL = ".atsx-date-picker-dropdown";
  const ATSX_MONTH_ITEM = ".atsx-date-picker-period-month-panel-list-item";
  let lastScan = [];

  function cleanText(value, maxLength) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength || 220);
  }

  function visible(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function formItemFor(element) {
    return element.closest(FORM_ITEM_SELECTORS);
  }

  function customSelectFor(element) {
    const framework = element.closest(FRAMEWORK_SELECT_SELECTORS);
    if (framework) return framework;
    // Moka sd-Select: 内部 input 包裹在 [class*='sd-Select-container'] 中
    const sdSelect = isMoka() ? element.closest(MOKA_SEL.selectContainer) : null;
    if (sdSelect) return sdSelect;
    return element.closest("[role='combobox']");
  }

  function labelFor(element) {
    const pieces = [];
    const formItem = formItemFor(element);
    // Moka title label: [class*='apply-field-'] [class*='title-']
    if (formItem && isMoka()) {
      const mokaTitle = formItem.querySelector(`:scope > ${MOKA_SEL.titleLabel}`);
      if (mokaTitle) pieces.push(mokaTitle.innerText || mokaTitle.textContent || "");
    }
    const frameworkLabel = formItem && formItem.querySelector([
      ".form-item__text",
      ".atsx-form-item-label",
      ".ant-form-item-label label",
      ".el-form-item__label",
      ".arco-form-item-label",
      ".t-form__label",
      ".n-form-item-label",
      ".semi-form-field-label",
      ":scope > label"
    ].join(","));
    if (frameworkLabel) pieces.push(frameworkLabel.innerText || frameworkLabel.textContent || "");
    if (element.labels) {
      Array.from(element.labels).forEach((label) => pieces.push(label.innerText || label.textContent || ""));
    }
    if (element.id) {
      const escaped = CSS.escape(element.id);
      document.querySelectorAll(`label[for="${escaped}"]`).forEach((label) => pieces.push(label.innerText || label.textContent || ""));
    }
    const wrapper = element.closest("label");
    if (wrapper) pieces.push(wrapper.innerText || wrapper.textContent || "");
    const unique = Array.from(new Set(
      pieces
        .map((piece) => cleanText(piece, 160))
        .filter(Boolean)
    ));
    let label = cleanText(unique.join(" "), 160);

    // Moka month-range-select: 根据位置生成 开始时间/结束时间 以区分 start_date / end_date
    if (isMoka()) {
      const monthRange = element.closest(".month-range-select");
      if (monthRange) {
        const allItems = Array.from(monthRange.querySelectorAll(MOKA_SEL.monthRangeItems));
        const itemEl = element.closest(MOKA_SEL.monthRangeItems);
        const idx = itemEl ? allItems.indexOf(itemEl) : -1;
        if (idx >= 0) {
          const isStart = idx < allItems.length / 2;
          label = isStart ? "开始时间" : "结束时间";
        }
      }
    }

    if (element.matches(ATSX_MONTH_LABEL)) {
      // 一个时间段中的两个入口分别对应开始/结束，不能把年月子节点当作字段。
      let group = element.closest(ATSX_MONTH_RANGE) || formItem || element.parentElement;
      for (let depth = 0; group && depth < 4; depth++, group = group.parentElement) {
        const labels = Array.from(group.querySelectorAll(ATSX_MONTH_LABEL));
        if (labels.length === 2) return labels.indexOf(element) === 0 ? "开始时间" : "结束时间";
        if (labels.length > 2 || group === formItem || group.matches("section,fieldset,body")) break;
      }
    }
    return label;
  }

  function nearbyText(element) {
    const formItem = formItemFor(element);
    if (formItem) {
      return cleanText(formItem.innerText || formItem.textContent || "", 260);
    }
    let node = element.parentElement;
    for (let depth = 0; node && depth < 3; depth += 1, node = node.parentElement) {
      const text = cleanText(node.innerText || node.textContent || "", 260);
      if (text && text.length <= 260) return text;
    }
    return "";
  }

  function sectionText(element) {
    const resumeCard = element.closest(".resumeEditForm-item");
    if (resumeCard) {
      const kind = resumeCard.className;
      if (/education/i.test(kind)) return "教育经历";
      if (/intern|practice/i.test(kind)) return "实习经历";
      if (/work|employment/i.test(kind)) return "工作经历";
      if (/project/i.test(kind)) return "项目经历";
    }
    // Moka apply-block title
    if (isMoka()) {
      const mokaBlock = element.closest(MOKA_SEL.block);
      if (mokaBlock) {
        const mokaHeading = mokaBlock.querySelector(MOKA_SEL.blockTitleText);
        if (mokaHeading) return cleanText(mokaHeading.innerText || mokaHeading.textContent, 100);
      }
    }
    const beisenSection = element.closest(".sc-iAKWXU");
    if (beisenSection) {
      const beisenHeading = beisenSection.querySelector(":scope > .sc-efQSVx") ||
        beisenSection.querySelector(".sc-efQSVx");
      return cleanText(beisenHeading && (beisenHeading.innerText || beisenHeading.textContent), 100);
    }
    const container = element.closest(SECTION_SELECTORS);
    if (!container) return "";
    const heading = container.querySelector("h1,h2,h3,h4,h5,h6,legend,[class*='title']");
    return cleanText(heading && (heading.innerText || heading.textContent), 100);
  }

  function descriptorFor(element, domIndex) {
    const isCustomSelect = element.matches(CUSTOM_SELECT_SELECTORS);
    const role = element.getAttribute("role") || (isCustomSelect ? "combobox" : "");
    const formItem = formItemFor(element);
    // Read placeholder from inner input for Moka selects
    let placeholder = element.getAttribute("placeholder") || "";
    if (!placeholder && isCustomSelect) {
      const innerInput = element.querySelector("input[type='text'], input:not([type])");
      if (innerInput) placeholder = innerInput.getAttribute("placeholder") || "";
    }
    return {
      domIndex,
      tag: element.tagName.toLowerCase(),
      type: element.matches(ATSX_MONTH_LABEL) ? "month" : (element.getAttribute("type") || "").toLowerCase(),
      role,
      label: labelFor(element),
      placeholder,
      name: element.getAttribute("name") || "",
      id: element.id || "",
      ariaLabel: element.getAttribute("aria-label") || "",
      nearbyText: nearbyText(element),
      sectionText: sectionText(element),
      required: element.required ||
        element.getAttribute("aria-required") === "true" ||
        Boolean(formItem && (
          formItem.matches(".is-required,[class*='required']") ||
          formItem.querySelector(`.form-item__required,.ant-form-item-required,[class*='required']${isMoka() ? "," + MOKA_SEL.requiredAsterisk : ""}`)
        )),
      disabled: element.disabled ||
        element.getAttribute("aria-disabled") === "true" ||
        Boolean(element.matches(ATSX_MONTH_LABEL) && element.closest("[aria-disabled='true'],[disabled],[class*='disabled']")) ||
        element.matches(`.is-disabled,.ant-select-disabled,.arco-select-disabled,.t-is-disabled${isMoka() ? "," + MOKA_SEL.disabledSelect + "," + MOKA_SEL.disabledInput : ""}`),
      currentValue: readControlValue(element)
    };
  }

  function readControlValue(element) {
    if (element.matches && element.matches(ATSX_MONTH_LABEL)) {
      const year = cleanText(element.querySelector("[data-cy='year']")?.textContent);
      const month = cleanText(element.querySelector("[data-cy='month']")?.textContent);
      if (/^\d{4}$/.test(year) && /^(0?[1-9]|1[0-2])$/.test(month)) {
        return `${year}-${month.padStart(2, "0")}`;
      }
      return "";
    }
    if (element.matches && element.matches(CUSTOM_SELECT_SELECTORS)) {
      // Moka sd-Select: display value in [class*='sd-Input-display-value']
      if (isMoka()) {
        const sdDisplay = element.querySelector(MOKA_SEL.displayValue);
        if (sdDisplay) {
          const text = cleanText(sdDisplay.innerText || sdDisplay.textContent, 160);
          return /^(请选择|select|choose)$/i.test(text) ? "" : text;
        }
      }
      const input = element.querySelector([
        ".phoenix-select__input",
        ".ant-select-selection-search-input",
        ".el-select__input",
        ".arco-select-view-input",
        ".t-input__inner",
        "input"
      ].join(","));
      const selected = element.querySelector([
        ".phoenix-select__tipEle",
        ".ant-select-selection-item",
        ".el-select__selected-item",
        ".el-select__tags-text",
        ".arco-select-view-value",
        ".t-select-input",
        ".n-base-selection-label",
        ".semi-select-selection-text"
      ].join(","));
      const placeholder = element.querySelector([
        ".phoenix-select__placeHolder",
        ".ant-select-selection-placeholder",
        ".el-select__placeholder",
        ".arco-select-view-placeholder",
        "[class*='placeholder']"
      ].join(","));
      const value = cleanText(
        selected && (selected.innerText || selected.textContent) ||
        input && input.value ||
        placeholder && (placeholder.innerText || placeholder.textContent),
        160
      );
      return /^(请选择|select|choose)$/i.test(value) ? "" : value;
    }
    return element.value || (element.isContentEditable ? element.textContent : "") || "";
  }

  function indexWithinSection(records, current) {
    const path = current.match.path;
    if (!path.includes("[]")) return 0;
    const section = path.split("[]")[0];
    const startKey = `${section}[].`;
    const sameField = records.filter((record) => record.match.path === path);
    const position = sameField.indexOf(current);
    if (position >= 0) return position;

    const sameSectionBefore = records.filter((record) => (
      record.descriptor.domIndex < current.descriptor.domIndex &&
      record.match.path.startsWith(startKey)
    ));
    return Math.max(0, sameSectionBefore.length);
  }

  const repeatIdentityDefinitions = {
    education: {
      path: "education[].school",
      property: "school"
    },
    work_experience: {
      path: "work_experience[].company",
      property: "company"
    },
    internship_experience: {
      path: "internship_experience[].company",
      property: "company"
    },
    project_experience: {
      path: "project_experience[].name",
      property: "name"
    },
    awards: {
      path: "awards[].name",
      property: "name"
    },
    language_skills: {
      path: "language_skills[].language",
      property: "language"
    }
  };

  function repeatGroupFor(element) {
    const resumeCard = element.closest(".resumeEditForm-item");
    if (resumeCard) return resumeCard;
    // Moka repeatable fields group
    if (isMoka()) {
      const mokaMulti = element.closest(MOKA_SEL.multiGroup);
      if (mokaMulti) return mokaMulti;
    }
    const beisenForm = element.closest(".sc-iAKWXU .form");
    return beisenForm || element.closest([
      ".education-item",
      ".work-item",
      ".experience-item",
      ".record-item",
      ".form-list-item",
      ".ant-form-list-item",
      "[data-repeat-item]",
      "[data-record-index]",
      ".form-part"
    ].join(","));
  }

  function assignRepeatIndexes(records, profile) {
    Object.entries(repeatIdentityDefinitions).forEach(([arrayName, definition]) => {
      const sectionRecords = records.filter((record) => record.match.path.startsWith(`${arrayName}[].`));
      if (!sectionRecords.length) return;
      const groups = [];
      sectionRecords.forEach((record) => {
        if (record.repeatGroup && !groups.includes(record.repeatGroup)) groups.push(record.repeatGroup);
      });
      if (!groups.length) {
        sectionRecords.forEach((record) => {
          record.repeatPosition = record.arrayIndex;
        });
        return;
      }

      const profileItems = Array.isArray(profile && profile[arrayName]) ? profile[arrayName] : [];
      const usedProfileIndexes = new Set();
      const groupAssignments = new Map();

      groups.forEach((group, position) => {
        const identityRecord = sectionRecords.find((record) => (
          record.repeatGroup === group && record.match.path === definition.path
        ));
        const currentIdentity = identityRecord && (
          readControlValue(identityRecord.element) ||
          identityRecord.descriptor.currentValue
        );
        if (!currentIdentity) return;
        const normalizedIdentity = globalThis.JobAutofillMatcher.normalize(currentIdentity);
        const matchedIndexes = profileItems.map((item, index) => ({ item, index })).filter(({ item, index }) => (
          !usedProfileIndexes.has(index) &&
          globalThis.JobAutofillMatcher.normalize(item && item[definition.property]) === normalizedIdentity
        )).map(({ index }) => index);
        if (matchedIndexes.length === 1) {
          const matchedIndex = matchedIndexes[0];
          groupAssignments.set(group, { profileIndex: matchedIndex, position, identity: currentIdentity, status: "identity-matched" });
          usedProfileIndexes.add(matchedIndex);
        } else {
          groupAssignments.set(group, { profileIndex: -1, position, identity: currentIdentity,
            status: matchedIndexes.length ? "identity-ambiguous" : "identity-not-found" });
        }
      });

      groups.forEach((group, position) => {
        if (groupAssignments.has(group)) return;
        let profileIndex = profileItems.findIndex((item, index) => !usedProfileIndexes.has(index));
        groupAssignments.set(group, { profileIndex, position, status: profileIndex < 0 ? "identity-not-found" : "empty-record" });
        if (profileIndex >= 0) usedProfileIndexes.add(profileIndex);
      });

      sectionRecords.forEach((record) => {
        const assignment = groupAssignments.get(record.repeatGroup);
        if (!assignment) return;
        record.arrayIndex = assignment.profileIndex;
        record.repeatPosition = assignment.position;
        record.recordMatch = assignment;
        const item = profileItems[assignment.profileIndex];
        record.invalidDateRange = Boolean(item && /^\d{4}-\d{2}/.test(item.start_date || "") &&
          /^\d{4}-\d{2}/.test(item.end_date || "") && item.start_date.slice(0, 7) > item.end_date.slice(0, 7));
      });
    });
  }

  function customKeyFor(descriptor) {
    return cleanText(
      descriptor.label ||
      descriptor.ariaLabel ||
      descriptor.placeholder ||
      descriptor.name ||
      descriptor.id,
      120
    );
  }

  function scan(profile) {
    const elements = Array.from(document.querySelectorAll(
      `input,textarea,select,${CUSTOM_SELECT_SELECTORS},[contenteditable='true']`
    ))
      .filter((element) => {
        if (element.matches(".atsx-date-picker-period-hidden-input,.atsx-date-picker-period-line")) return false;
        if (element.closest(ATSX_MONTH_PANEL)) return false;
        if (element.matches(ATSX_MONTH_LABEL)) return true;
        if (element.closest(ATSX_MONTH_LABEL) || element.querySelector(ATSX_MONTH_LABEL)) return false;
        const customSelect = customSelectFor(element);
        return !customSelect || customSelect === element;
      })
      .filter((element) => visible(element) || (element.getAttribute("type") || "").toLowerCase() === "file")
      .filter((element) => !SKIP_TYPES.has((element.getAttribute("type") || "").toLowerCase()));

    const records = elements.map((element, index) => {
      const descriptor = descriptorFor(element, index);
      let match = globalThis.JobAutofillMatcher.matchField(descriptor);
      const customKey = customKeyFor(descriptor);
      const customAnswers = profile && profile.additional && profile.additional.custom_answers || {};
      if (!match.path && customKey && (
        descriptor.required ||
        Object.prototype.hasOwnProperty.call(customAnswers, customKey)
      )) {
        match = {
          path: "additional.custom_answers",
          score: 65,
          sensitive: false,
          reason: "custom-answer"
        };
      }
      return {
        element,
        dateLocator: element.matches(ATSX_MONTH_LABEL) ? {
          scope: formItemFor(element) || element.parentElement,
          index: Array.from((formItemFor(element) || element.parentElement).querySelectorAll(ATSX_MONTH_LABEL)).indexOf(element)
        } : null,
        descriptor,
        match,
        repeatGroup: repeatGroupFor(element),
        customKey: match.reason === "custom-answer" ? customKey : ""
      };
    });

    records.forEach((record) => {
      record.arrayIndex = indexWithinSection(records, record);
      record.repeatPosition = record.arrayIndex;
    });
    assignRepeatIndexes(records, profile);
    lastScan = records;
    return records;
  }

  // Moka 专用定位：不依赖随机 class 后缀；每次填写前重新解析，兼容 React 重渲染。
  const MOKA_BLOCK_BY_SECTION = {
    "申请信息": "block-applyInfo",
    "个人信息": "block-basicInfo",
    "求职意向": "block-jobIntention",
    "教育背景": "block-educationInfo",
    "教育经历": "block-educationInfo",
    "工作经历": "block-experienceInfo",
    "实习经历": "block-practiceInfo",
    "项目经历": "block-projectInfo",
    "项目经验": "block-projectInfo",
    "获奖经历": "block-awardInfo"
  };

  function mokaFieldTitle(field) {
    const titleSpan = field.querySelector(`:scope > ${MOKA_SEL.titleLabel} span`) ||
      field.querySelector(`${MOKA_SEL.titleLabel} span`);
    return cleanText(titleSpan?.innerText || titleSpan?.textContent || "", 160)
      .replace(/[*：:]/g, "").trim();
  }

  function mokaFieldsByTitle(block, label) {
    const normalizedLabel = globalThis.JobAutofillMatcher.normalize(label)
      .replace(/[*：:]/g, "").trim();
    const titleSpans = Array.from(block.querySelectorAll(
      `${MOKA_SEL.field} > ${MOKA_SEL.titleLabel} span, ${MOKA_SEL.field} ${MOKA_SEL.titleLabel} span`
    ));
    return Array.from(new Set(titleSpans.filter((span) => {
      const title = globalThis.JobAutofillMatcher.normalize(span.textContent || "")
        .replace(/[*：:]/g, "").trim();
      return title === normalizedLabel || title.includes(normalizedLabel) || normalizedLabel.includes(title);
    }).map((span) => span.closest(MOKA_SEL.field)).filter(Boolean)));
  }

  function resolveMokaElement(record) {
    if (!isMoka() || !record || !record.descriptor) return record && record.element;
    const sectionId = MOKA_BLOCK_BY_SECTION[record.descriptor.sectionText] || "";
    const blocks = sectionId
      ? Array.from(document.querySelectorAll(`[data-nav-id='${sectionId}']`))
      : Array.from(document.querySelectorAll(MOKA_SEL.block));
    const label = cleanText(record.descriptor.label, 160).replace(/[*：:]/g, "").trim();
    const fields = blocks.flatMap((block) => mokaFieldsByTitle(block, label));
    if (!fields.length) return null;
    const field = fields[Math.min(record.repeatPosition || 0, fields.length - 1)];
    if (record.descriptor.role === "combobox" || field.querySelector(MOKA_SEL.selectContainer)) {
      return field.querySelector(MOKA_SEL.selectContainer) || field;
    }
    return field.querySelector("input,textarea,[contenteditable='true']") || field;
  }

  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value");
    if (setter && setter.set) setter.set.call(element, String(value));
    else element.value = String(value);
    ["input", "change", "blur"].forEach((eventName) => {
      element.dispatchEvent(new Event(eventName, { bubbles: true }));
    });
  }

  function hasMeaningfulValue(record) {
    const element = record.element;
    if (record.dateLocator) return Boolean(readControlValue(element));
    // Moka sd-Select: check display value
    if (isMoka() && element.matches && element.matches(MOKA_SEL.selectContainer)) {
      const value = readControlValue(element);
      return Boolean(value && !/请选择|select|choose/i.test(value));
    }
    if (record.descriptor.role === "combobox" && record.descriptor.tag !== "select") {
      const value = readControlValue(element) || cleanText(
        element.getAttribute("aria-valuetext") ||
        element.getAttribute("data-value") ||
        element.innerText,
        120
      );
      return Boolean(value && !/请选择|select|choose/i.test(value));
    }
    if (record.descriptor.tag === "select") {
      const selected = element.options && element.options[element.selectedIndex];
      const text = cleanText(selected && selected.textContent, 80);
      return Boolean(element.value && !/请选择|select|choose/i.test(text));
    }
    if (record.descriptor.type === "checkbox" || record.descriptor.type === "radio") {
      return Boolean(element.checked);
    }
    const value = cleanText(element.value || element.textContent, 120);
    return Boolean(value && !/请选择|select|choose/i.test(value));
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  // 每次检查重新查找节点，兼容 portal 延迟挂载及选年后整体重绘。
  function waitForDateState(check, timeout = 2500) {
    return new Promise((resolve) => {
      let observer, interval, timer;
      const finish = (result) => {
        observer?.disconnect();
        clearInterval(interval);
        clearTimeout(timer);
        resolve(result);
      };
      const probe = () => {
        const result = check();
        if (result) finish(result);
      };
      observer = new MutationObserver(probe);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      interval = setInterval(probe, 50);
      timer = setTimeout(() => finish(null), timeout);
      probe();
    });
  }

  function resolveAtsxDate(record) {
    const locator = record.dateLocator;
    if (!locator?.scope.isConnected) return null;
    const labels = locator.scope.querySelectorAll(ATSX_MONTH_LABEL);
    const element = labels[locator.index];
    if (element) record.element = element;
    return element || null;
  }

  async function setAtsxMonth(record, value) {
    const fail = (status, message) => {
      record.dateFailure = message;
      return status;
    };
    const parsed = String(value).trim().match(/^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/);
    if (!parsed) return "value-not-matched";
    const [, year, month] = parsed;
    const target = `${year}-${month}`;
    const trigger = resolveAtsxDate(record);
    if (!trigger) return "stale-locator";
    if (readControlValue(trigger) === target) return "filled";

    const panels = () => Array.from(document.querySelectorAll(ATSX_MONTH_PANEL)).filter(visible);
    const before = new Map(panels().map((panel) => [panel, panel.innerHTML]));
    const controlledId = trigger.getAttribute("aria-controls");
    let activePanel;
    const focusedPanel = (candidates) => {
      const label = resolveAtsxDate(record);
      if (!label?.classList.contains("atsx-date-picker-period-month-label-focus")) return null;
      const anchor = (label.closest(ATSX_MONTH_RANGE) || label).getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      // 浮层可能复用，开始/结束为空时 HTML 完全相同。焦点与邻接位置共同确认归属。
      const adjacent = candidates.filter((panel) => {
        const rect = panel.getBoundingClientRect();
        const vertical = Math.min(Math.abs(rect.top - anchor.bottom), Math.abs(rect.bottom - anchor.top)) <= 24;
        const horizontal = Math.min(Math.abs(rect.left - anchor.left), Math.abs(rect.right - anchor.right),
          Math.abs(rect.left - labelRect.left), Math.abs(rect.right - labelRect.right)) <= 24;
        return vertical && horizontal;
      });
      return adjacent.length === 1 ? adjacent[0] : null;
    };
    const ownedPanel = () => {
      const candidates = panels().filter((panel) => panel.querySelector(ATSX_MONTH_ITEM));
      if (activePanel && candidates.includes(activePanel)) return activePanel;
      const controlled = controlledId && candidates.find((panel) => panel.id === controlledId);
      if (controlled) return controlled;
      const focused = focusedPanel(candidates);
      if (focused) return focused;
      const changed = candidates.filter((panel) => !before.has(panel) || before.get(panel) !== panel.innerHTML);
      return changed.length === 1 ? changed[0] : null;
    };
    const enabled = (item) => visible(item) && !item.matches("[disabled],[aria-disabled='true'],[class*='disabled']");
    const findItem = (panel, number) => panel && Array.from(panel.querySelectorAll(ATSX_MONTH_ITEM)).find((item) =>
      enabled(item) && (item.getAttribute("data-cy") || cleanText(item.textContent)) === number
    );
    const selected = (item) => item && (item.classList.contains("atsx-date-picker-period-month-panel-list-item-selected") || item.getAttribute("aria-selected") === "true");
    try {
      trigger.scrollIntoView({ block: "nearest" });
      trigger.click();
      activePanel = await waitForDateState(ownedPanel);
      // 用户可能已展开此日期框；第一次点击将其关闭时，再打开一次。
      if (!activePanel && Array.from(before.keys()).some((panel) => !panel.isConnected || !visible(panel))) {
        const label = resolveAtsxDate(record);
        if (!label) return "stale-locator";
        label.click();
        activePanel = await waitForDateState(ownedPanel);
      }
      if (!activePanel) return fail("option-not-found", "点击日期入口后未检测到对应的年月弹层");
      const yearItem = await waitForDateState(() => findItem(ownedPanel(), year));
      if (!yearItem) return fail("option-not-found", `年月弹层中没有可选的 ${year} 年（可能不存在或被禁用）`);
      if (!selected(yearItem)) {
        yearItem.scrollIntoView({ block: "nearest" });
        yearItem.click();
        const yearReady = await waitForDateState(() => {
          const panel = ownedPanel();
          return panel && selected(findItem(panel, year)) && panel;
        });
        if (!yearReady) return fail("verification-failed", `点击 ${year} 年后，面板未确认选中该年份`);
        activePanel = yearReady;
      }
      // 月份必须从选年后的实时面板获取，禁止复用旧节点或模糊匹配 01/10。
      const monthItem = await waitForDateState(() => findItem(ownedPanel(), month));
      if (!monthItem) return fail("option-not-found", `年月弹层中没有可选的 ${month} 月（可能不存在或被禁用）`);
      monthItem.scrollIntoView({ block: "nearest" });
      monthItem.click();
      const committed = await waitForDateState(() => {
        const label = resolveAtsxDate(record);
        return label && readControlValue(label) === target;
      });
      return committed ? "filled" : fail("verification-failed", `选择 ${target} 后，日期入口未显示该年月`);
    } finally {
      const panel = ownedPanel() || (activePanel?.isConnected && visible(activePanel) ? activePanel : null);
      if (panel) {
        const label = resolveAtsxDate(record);
        const focused = label?.closest(ATSX_MONTH_RANGE)?.querySelector(`${ATSX_MONTH_LABEL}.atsx-date-picker-period-month-label-focus`);
        // 有些区间组件选完开始时间后自动激活结束端，留给下一字段继续使用。
        if (!focused || focused === label) {
          (label || panel).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          await wait(80);
          if (label && panel.isConnected && visible(panel)) label.click();
        }
      }
    }
  }

  function meaningfulOptions(options) {
    return Array.from(options || []).filter((option) => {
      const text = cleanText(option.innerText || option.textContent, 100);
      return !option.disabled && text && !/请选择|select|choose|请选择一个/i.test(text);
    });
  }

  // ----- 弹出层检测: 找到下拉框/日期面板容器 -----
  function findPopupContainer() {
    const popupSelectors = [
      ".common-unmodeled-layer:not(.common-unmodeled-layer-hidden)",
      ".phoenix-unmodeled-layer",
      ".phoenix-select-dropdown",
      ".phoenix-select__dropdown",
      ".ant-select-dropdown",
      ".el-select-dropdown",
      ".arco-select-dropdown",
      ".t-select-dropdown",
      ".n-base-select-menu",
      ".semi-portal",
      ".ant-picker-dropdown",
      ".el-picker-panel",
      ".arco-picker-panel",
      ".rc-picker-dropdown",
      // Moka / Sugar Design dropdowns
      MOKA_SEL.dropdownPortal + "," +
      "[class*='portal'] > [class*='dropdown']",
      "[class*='portal'] > [class*='select']",
      "[class*='popup']",
      "[class*='unmodeled-layer']:not([class*='hidden'])",
      "[class*='dropdown']",
      "[class*='overlay']",
      "[class*='popper']",
      "[class*='layer']"
    ];
    const candidates = Array.from(document.querySelectorAll(popupSelectors.join(",")))
      .filter((el) => visible(el))
      // Element Plus 的选项类名本身含有 "dropdown"。若把最后一个选项误当成
      // 弹出层容器，后续 querySelectorAll 只会搜索其子节点，从而看不到任何选项。
      .filter((el) => !el.matches([
        "[role='option']",
        ".ant-select-item-option",
        ".el-select-dropdown__item",
        ".arco-select-option",
        ".t-select-option",
        ".n-base-select-option",
        ".semi-select-option",
        ".phoenix-option",
        ".phoenix-selectList__listItem"
      ].join(",")));
    // 优先选最近出现的（通常 DOM 顺序靠后）
    return candidates.length ? candidates[candidates.length - 1] : null;
  }

  // ----- 在弹出层内查找所有可见单元格（用于日历网格）-----
  function cellsInPopup(popup, minTextLen) {
    if (!popup) return [];
    const cellSelectors = [
      "td", "li", "a", "[class*='cell']", "[class*='option']",
      "[class*='item']", "span", "div"
    ];
    const all = Array.from(popup.querySelectorAll(cellSelectors.join(",")))
      .filter((el) => {
        if (!visible(el)) return false;
        const text = cleanText(el.innerText || el.textContent, 40);
        return text.length >= (minTextLen || 1) && text.length <= 20
          && !/请选择|select|choose/i.test(text);
      });
    // 去重：如果子元素文本和父元素相同，只保留最深层
    return all.filter((el) => {
      const txt = cleanText(el.innerText || el.textContent, 40);
      return !all.some((other) => (
        other !== el && el.contains(other) &&
        cleanText(other.innerText || other.textContent, 40) === txt
      ));
    });
  }

  // ----- 在候选格子里按年份/月份模式匹配 -----
  function matchDateCell(cells, patterns) {
    for (const pat of patterns) {
      const found = cells.find((cell) => {
        const txt = globalThis.JobAutofillMatcher.normalize(cleanText(cell.innerText || cell.textContent, 40));
        return txt === pat || txt.includes(pat) || pat.includes(txt);
      });
      if (found) return found;
    }
    return null;
  }

  // ----- 生成年份匹配模式列表 -----
  function yearPatterns(yearStr) {
    const y = parseInt(yearStr, 10);
    return [yearStr, `${y}年`, `${y % 100}`, `${y % 100}年`].map((s) =>
      globalThis.JobAutofillMatcher.normalize(String(s))
    );
  }

  // ----- 生成月份匹配模式列表 -----
  function monthPatterns(monthStr) {
    const m = parseInt(monthStr, 10);
    const padded = String(m).padStart(2, "0");
    return [padded, String(m), `${m}月`, `${padded}月`].map((s) =>
      globalThis.JobAutofillMatcher.normalize(s)
    );
  }

  async function setCustomCombobox(record, value, options) {
    const element = record.element;
    const text = Array.isArray(value) ? value[0] : String(value);

    // 检测是否是日期字段
    const isDateField = (
      /(_date|start_date|end_date|\.date)$/.test(record.match.path) &&
      record.match.path !== "application.available_date"
    ) || (
      /时间|日期/.test(record.descriptor.label) &&
      !/到岗时间|可入职时间|available/.test(record.descriptor.label) &&
      !/到岗时间|可入职时间|available/.test(record.descriptor.nearbyText)
    );

    // 日期字段：生成候选值列表（YYYY-MM 和 YYYY-MM-DD）
    let dateCandidates = [];
    if (isDateField) {
      const raw = String(value).trim();
      dateCandidates.push(raw);
      if (/^\d{4}-\d{2}$/.test(raw)) {
        dateCandidates.push(raw + "-01");
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        dateCandidates.push(raw.substring(0, 7));
      }
    }
    const searchTexts = isDateField ? dateCandidates : [text];

    const isLocation = record.match.path === "application.first_choice_location";
    const isMultiple = element.matches([
      ".ant-select-multiple",
      ".el-select--multiple",
      ".arco-select-multiple",
      "[aria-multiselectable='true']",
      "[multiple]"
    ].join(",")) || Boolean(element.querySelector("[aria-multiselectable='true']"));

    // ===== Moka month-range-select：分离式年/月选择器（优先直接输入） =====
    const monthRange = element.closest(".month-range-select");
    if (monthRange && isDateField) {
      const dateMatch = String(value).match(/^(\d{4})-(\d{2})/);
      if (dateMatch) {
        const yyyy = dateMatch[1];
        const mm = String(parseInt(dateMatch[2], 10));
        // 查找内部 input（宽泛匹配，覆盖 Moka sd-Select 的各种变体）
        const innerInput = element.querySelector(
          "input[type='text'], input[type='number'], input:not([type]), input"
        );
        const innerPlaceholder = innerInput ? (innerInput.getAttribute("placeholder") || "") : "";
        const isYear = /年/.test(innerPlaceholder);
        const isMonth = /月/.test(innerPlaceholder);
        if (!isYear && !isMonth) return "option-not-found";
        const fillValue = isYear ? yyyy : mm;

        // 策略 1：直接输入（Moka 日期框支持直接填写）
        if (innerInput && !innerInput.disabled) {
          const wasReadOnly = innerInput.readOnly;
          if (wasReadOnly) innerInput.removeAttribute("readOnly");
          setNativeValue(innerInput, fillValue);
          // setNativeValue 已触发 input/change/blur，只需额外触发 Enter 让 Moka 确认选择
          innerInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
          await wait(250);
          if (wasReadOnly) innerInput.setAttribute("readOnly", "");
          // 优先用 innerInput.value（即时生效），再用 readControlValue（可能滞后）
          const inputVal = cleanText(innerInput.value, 120);
          const displayVal = readControlValue(element);
          const current = (inputVal && !/请选择|select|choose/i.test(inputVal)) ? inputVal : displayVal;
          if (current && !/请选择|select|choose/i.test(current)) {
            return "filled";
          }
        }

        // 策略 2：直接输入失败，回退到点击下拉选择
        const mokaClickable = element.querySelector(`${MOKA_SEL.displayValue},${MOKA_SEL.addon}`) || element;
        mokaClickable.click();
        await wait(350);

        const popup = findPopupContainer();
        const searchRoot = popup || document;
        const mokaOptionSelectors = [
          "[role='option']",
          ".sd-Select-option",
          "[class*='select-option']",
          "[class*='Select-option']",
          "[class*='dropdown'] li",
          "[class*='dropdown'] [class*='item']",
          "[class*='portal'] li",
          "[class*='portal'] [class*='item']",
          "li"
        ];
        let mokaOpts = [];
        let retry = 0;
        while (!mokaOpts.length && retry < 3) {
          mokaOpts = meaningfulOptions(
            Array.from(searchRoot.querySelectorAll(mokaOptionSelectors.join(",")))
              .filter((el) => visible(el))
          );
          if (!mokaOpts.length) { await wait(300); retry += 1; }
        }

        // 匹配年或月
        const pats = isYear ? yearPatterns(fillValue) : monthPatterns(fillValue);
        const matched = matchDateCell(mokaOpts, pats);
        if (matched) {
          matched.click();
          return "filled";
        }
        // 尝试直接点击匹配文本
        const normFill = globalThis.JobAutofillMatcher.normalize(fillValue);
        const direct = mokaOpts.find((opt) =>
          globalThis.JobAutofillMatcher.normalize(opt.innerText || opt.textContent) === normFill
        );
        if (direct) { direct.click(); return "filled"; }

        element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        return "option-not-found";
      }
    }

    // ===== 策略 A：Moka 控件优先尝试直接输入 =====
    // Ant Design / Element 等组件的搜索框即使 value 被写入，也不代表选项已经选中。
    // 这些组件必须继续走下方的“打开下拉并点击选项”逻辑，不能仅凭搜索框有值就返回成功。
    const innerInput = element.querySelector(
      ".phoenix-select__input, input[type='text'], input:not([type]), input[type='month'], input[type='date'], input[type='number']"
    );
    const allowDirectInput = isMoka() &&
      element.matches &&
      element.matches(MOKA_SEL.selectContainer);
    // 若输入框被禁用（如 Phoenix date picker 的 disabled input），跳过输入策略
    if (allowDirectInput && innerInput && !innerInput.disabled && !innerInput.readOnly) {
      for (const candidate of searchTexts) {
        setNativeValue(innerInput, candidate);
        innerInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        await wait(250);
        // 优先用 innerInput.value（即时生效），再用 readControlValue（显示值可能滞后）
        const inputVal = cleanText(innerInput.value, 120);
        const displayVal = readControlValue(element);
        const current = (inputVal && !/请选择|select|choose/i.test(inputVal)) ? inputVal : displayVal;
        if (current && !/请选择|select|choose/i.test(current)) {
          return "filled";
        }
      }
    }

    // ===== 策略 B：点击打开下拉框，查找匹配选项 =====
    const clickable = element.querySelector([
      ".ant-select-selector",
      ".el-select__wrapper",
      ".arco-select-view",
      ".t-input",
      ".n-base-selection",
      ".semi-select-selection",
      ".phoenix-select__placeHolder",
      ".phoenix-select__switchArrow",
      ".phoenix-select__input",
      ".phoenix-select__content",
      // Moka sd-Select click targets
      MOKA_SEL.displayValue + "," +
      MOKA_SEL.addon
    ].join(",")) || element;
    clickable.click();
    await wait(350);

    const popup = findPopupContainer();
    const optionSelectors = [
      "[role='option']",
      ".ant-select-item-option",
      ".el-select-dropdown__item",
      ".arco-select-option",
      ".t-select-option",
      ".n-base-select-option",
      ".semi-select-option",
      ".phoenix-option",
      ".phoenix-selectList__listItem",
      // Moka / Sugar Design options
      ".sd-Select-option",
      "[class*='Select-option']",
      "[class*='select-option']",
      "[class*='select-dropdown'] li",
      "[class*='dropdown'] [class*='option']",
      "[class*='dropdown'] li",
      "[class*='portal'] li",
      "[class*='portal'] [class*='item']",
      ".ant-picker-cell",
      ".ant-picker-cell-inner",
      ".ant-picker-content td",
      ".el-date-table-cell",
      ".el-month-table td",
      ".el-year-table td",
      ".arco-picker-cell",
      ".rc-picker-cell",
      ".rc-picker-cell-inner"
    ];
    // 优先从弹出层内查找，回退全局查找
    const searchRoot = popup || document;
    const visibleCandidates = () => meaningfulOptions(
      Array.from(searchRoot.querySelectorAll(optionSelectors.join(",")))
        .filter((candidate) => visible(candidate))
    );
    let candidates = visibleCandidates();
    let retryCount = 0;
    while (!candidates.length && retryCount < 3) {
      await wait(300);
      candidates = visibleCandidates();
      retryCount += 1;
    }

    // 多选地点特殊处理
    if (isLocation && isMultiple) {
      const preferred = options.desiredLocations.map(globalThis.JobAutofillMatcher.normalize);
      const targets = candidates.filter((candidate) => preferred.includes(
        globalThis.JobAutofillMatcher.normalize(candidate.innerText || candidate.textContent)
      ));
      const selectedTargets = targets.length ? targets : candidates.slice(0, 1);
      if (!selectedTargets.length) {
        element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        return "option-not-found";
      }
      for (let index = 0; index < selectedTargets.length; index += 1) {
        const targetText = globalThis.JobAutofillMatcher.normalize(
          selectedTargets[index].innerText || selectedTargets[index].textContent
        );
        const currentTarget = visibleCandidates().find((candidate) => (
          globalThis.JobAutofillMatcher.normalize(candidate.innerText || candidate.textContent) === targetText
        ));
        if (currentTarget) currentTarget.click();
        await wait(80);
        if (index < selectedTargets.length - 1 && !visibleCandidates().length) {
          clickable.click();
          await wait(100);
        }
      }
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return "filled";
    }

    // 单步匹配：在候选值中尝试匹配合并选项（如 "2024-09"）
    let target = null;
    for (const candidateText of searchTexts) {
      const normalized = globalThis.JobAutofillMatcher.normalize(candidateText);
      target = candidates.find((opt) => (
        globalThis.JobAutofillMatcher.normalize(opt.innerText || opt.textContent) === normalized
      ));
      if (!target) {
        target = candidates.find((opt) => (
          globalThis.JobAutofillMatcher.normalize(opt.innerText || opt.textContent).includes(normalized)
        ));
      }
      if (target) break;
    }
    if (!target && isLocation && options.locationPolicy.single_select === "first_available") {
      target = candidates[0];
    }
    if (target) {
      target.click();
      return "filled";
    }

    // ===== 策略 C：日期字段 — 日历网格多步导航 =====
    if (isDateField && dateCandidates.length) {
      const datePopup = findPopupContainer();
      const dateMatch = String(dateCandidates[0]).match(/^(\d{4})-(\d{2})/);
      if (datePopup && dateMatch) {
        const targetYear = parseInt(dateMatch[1], 10);
        const targetMonth = parseInt(dateMatch[2], 10);
        const monthPats = monthPatterns(dateMatch[2]);

        // ---- Phoenix 日历面板专用路径 ----
        const calendar = datePopup.querySelector(
          ".phoenix-calendar-month-calendar, .phoenix-calendar"
        );
        if (calendar) {
          // 读取当前年份
          const yearEl = calendar.querySelector(
            ".phoenix-calendar-year-select, .phoenix-calendar-month-panel-year-select-content"
          );
          if (yearEl) {
            const yearText = cleanText(yearEl.innerText || yearEl.textContent, 20);
            const yearNum = parseInt(yearText.replace(/[^\d]/g, ""), 10);
            if (yearNum && yearNum !== targetYear) {
              const diff = targetYear - yearNum;
              const btnSelector = diff < 0
                ? ".phoenix-calendar-prev-year-btn"
                : ".phoenix-calendar-next-year-btn";
              const btn = calendar.querySelector(btnSelector);
              for (let i = 0; i < Math.abs(diff) && btn; i += 1) {
                btn.click();
                await wait(250);
              }
            }
          }
          // 点击月份格子
          const monthEls = calendar.querySelectorAll(
            ".phoenix-calendar-month-panel-month, .phoenix-calendar-month-panel-cell"
          );
          const monthEl = matchDateCell(Array.from(monthEls), monthPats);
          if (monthEl) {
            monthEl.click();
            return "filled";
          }
        }

        // ---- 通用日历网格路径（非 Phoenix 框架）----
        const popupCells = cellsInPopup(datePopup, 1);
        if (popupCells.length >= 3) {
          const yearPats = yearPatterns(dateMatch[1]);
          const yearCell = matchDateCell(popupCells, yearPats);
          const monthCell = matchDateCell(popupCells, monthPats);

          if (yearCell && monthCell) {
            yearCell.click();
            await wait(400);
            const monthCells2 = cellsInPopup(findPopupContainer() || datePopup, 1);
            const monthCell2 = matchDateCell(monthCells2, monthPats);
            if (monthCell2) {
              monthCell2.click();
              return "filled";
            }
            monthCell.click();
            return "filled";
          }
          if (yearCell) {
            yearCell.click();
            await wait(400);
            const monthCellsAfter = cellsInPopup(findPopupContainer() || datePopup, 1);
            const mCell = matchDateCell(monthCellsAfter, monthPats);
            if (mCell) {
              mCell.click();
              return "filled";
            }
          }
          if (monthCell) {
            monthCell.click();
            return "filled";
          }
          if (popupCells.length <= 30) {
            console.debug(
              "[JobAutofill] date grid cells:",
              popupCells.map((c) => cleanText(c.innerText || c.textContent, 30)).slice(0, 20)
            );
          }
        }
      }
    }

    // ===== 策略 D：在下拉面板中查找输入框填写 =====
    const popupForInput = findPopupContainer() || popup;
    const popupInput = (popupForInput || document).querySelector([
      ".ant-select-dropdown input",
      ".el-select-dropdown input",
      ".arco-select-dropdown input",
      "[class*='dropdown'] input[class*='search']",
      "[class*='popup'] input",
      "[class*='picker'] input",
      "input"
    ].join(","));
    if (popupInput && visible(popupInput)) {
      for (const candidate of searchTexts) {
        setNativeValue(popupInput, candidate);
        popupInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        await wait(250);
      }
      return "filled";
    }

    // ===== 策略 E：位置字段自由文本后备 =====
    if (isLocation && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
      setNativeValue(element, options.locationText);
      return "filled";
    }
    if (isLocation && element.isContentEditable) {
      element.textContent = options.locationText;
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: options.locationText
      }));
      return "filled";
    }

    // 所有策略都失败，关闭下拉框
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return "option-not-found";
  }

  async function performSetField(record, value, options) {
    if (record.recordMatch?.profileIndex < 0) return record.recordMatch.status;
    if (record.invalidDateRange && /\[\]\.(start_date|end_date)$/.test(record.match.path)) return "invalid-date-range";
    if (record.dateLocator) {
      if (!resolveAtsxDate(record)) return "stale-locator";
      if (record.element.closest("[aria-disabled='true'],[disabled],[class*='disabled']")) return "disabled";
    } else if (isMoka()) {
      const resolved = resolveMokaElement(record);
      if (!resolved) return "stale-locator";
      record.element = resolved;
    }
    const element = record.element;
    if (record.match.sensitive || record.match.score < 60) return "skipped";
    if (value === undefined || value === null || value === "") return "missing-value";
    if (record.descriptor.disabled) return "disabled";
    if (record.descriptor.type === "file") return "manual-required";
    if (!options.overwrite && hasMeaningfulValue(record)) return "existing-value";

    const isLocation = record.match.path === "application.first_choice_location";
    const effectiveValue = isLocation && record.descriptor.role !== "combobox" && record.descriptor.tag !== "select"
      ? options.locationText
      : value;
    const text = Array.isArray(effectiveValue)
      ? effectiveValue.join(record.descriptor.tag === "textarea" || element.isContentEditable ? "\n" : "、")
      : String(effectiveValue);
    const tag = record.descriptor.tag;
    const type = record.descriptor.type;

    if (record.dateLocator) return setAtsxMonth(record, effectiveValue);

    if (record.descriptor.role === "combobox" && tag !== "select") {
      // 点击框（含日期选择器），统一由 setCustomCombobox 处理
      return setCustomCombobox(record, effectiveValue, options);
    }

    if (tag === "select") {
      const available = meaningfulOptions(element.options);
      if (isLocation && element.multiple) {
        const preferred = options.desiredLocations.map(globalThis.JobAutofillMatcher.normalize);
        const selected = available.filter((option) => (
          preferred.includes(globalThis.JobAutofillMatcher.normalize(option.textContent)) ||
          preferred.includes(globalThis.JobAutofillMatcher.normalize(option.value))
        ));
        const targets = selected.length ? selected : available.slice(0, 1);
        if (!targets.length) return "option-not-found";
        Array.from(element.options).forEach((option) => {
          option.selected = targets.includes(option);
        });
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return "filled";
      }
      const target = isLocation && options.locationPolicy.single_select === "first_available"
        ? available[0]
        : available.find((option) => (
        globalThis.JobAutofillMatcher.normalize(option.value) === globalThis.JobAutofillMatcher.normalize(text) ||
        globalThis.JobAutofillMatcher.normalize(option.textContent) === globalThis.JobAutofillMatcher.normalize(text)
        ));
      if (!target) return "option-not-found";
      element.value = target.value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return "filled";
    }

    if (type === "checkbox" || type === "radio") {
      const shouldCheck = typeof value === "boolean"
        ? value
        : [element.value, record.descriptor.label].some((candidate) => (
          globalThis.JobAutofillMatcher.normalize(candidate) === globalThis.JobAutofillMatcher.normalize(text)
        ));
      if (!shouldCheck) return "value-not-matched";
      element.checked = true;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return "filled";
    }

    if (element.isContentEditable) {
      element.textContent = text;
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return "filled";
    }

    setNativeValue(element, text);
    return "filled";
  }

  function readFieldValue(record) {
    const element = record.dateLocator ? resolveAtsxDate(record) : record.element;
    if (!element) return "";
    if (record.dateLocator) return readControlValue(element);
    if (element.tagName === "SELECT") {
      if (element.multiple) return Array.from(element.selectedOptions).map((option) => option.textContent || option.value).join("、");
      return element.selectedOptions[0] ? (element.selectedOptions[0].textContent || element.value) : element.value;
    }
    if (element.isContentEditable) return element.textContent || "";
    if (record.descriptor.role === "combobox") {
      return element.getAttribute("data-value") || element.getAttribute("aria-valuetext") ||
        element.value || element.textContent || "";
    }
    if (element.type === "checkbox" || element.type === "radio") return element.checked ? (element.value || "true") : "";
    return element.value || element.textContent || "";
  }

  function normalizeVerificationValue(value) {
    return globalThis.JobAutofillMatcher.normalize(String(value == null ? "" : value))
      .replace(/[年月日时分秒]/g, "-")
      .replace(/[./]/g, "-")
      .replace(/-+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function verificationMatches(record, expected) {
    if (record.dateLocator) {
      const target = String(expected).match(/^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/);
      return Boolean(target && readFieldValue(record) === `${target[1]}-${target[2]}`);
    }
    const actual = normalizeVerificationValue(readFieldValue(record));
    const target = normalizeVerificationValue(Array.isArray(expected)
      ? expected.join(record.descriptor.tag === "textarea" || record.element.isContentEditable ? "\n" : "、") : expected);
    if (!actual || !target) return false;
    if (actual === target || actual.includes(target) || target.includes(actual)) return true;
    // 日期控件可能只显示年月；允许在目标具有日时按年月确认。
    if (/date|month|time/.test(record.descriptor.type || "") || /日期|时间/.test(record.descriptor.label || "")) {
      return actual.slice(0, 7) === target.slice(0, 7);
    }
    return false;
  }

  async function setField(record, value, options) {
    const status = await performSetField(record, value, options);
    if (status !== "filled") return status;
    await new Promise((resolve) => setTimeout(resolve, 30));
    if (verificationMatches(record, options && record.match.path === "application.first_choice_location"
      ? (record.descriptor.role === "combobox" ? value : options.locationText)
      : value)) return "verified-filled";
    return "verification-failed";
  }

  function recordValue(record, profile) {
    if (record.recordMatch?.profileIndex < 0) return undefined;
    if (record.customKey) {
      return profile.additional &&
        profile.additional.custom_answers &&
        profile.additional.custom_answers[record.customKey];
    }
    return globalThis.JobAutofillMatcher.getValue(profile, record.match.path, record.arrayIndex);
  }

  function publicRecord(record, profile) {
    const value = recordValue(record, profile);
    return {
      descriptor: record.descriptor,
      match: record.match,
      arrayIndex: record.arrayIndex,
      repeatPosition: record.repeatPosition,
      recordMatch: record.recordMatch || null,
      invalidDateRange: Boolean(record.invalidDateRange),
      dateFailure: record.dateFailure || "",
      customKey: record.customKey || "",
      hasValue: !(value === undefined || value === null || value === ""),
      previewValue: value === undefined || value === null ? "" : String(value).slice(0, 80)
    };
  }

  function orderFillRecords(records, profile) {
    const ordered = [...records];
    records.filter((record) => record.repeatGroup && /\[\]\.start_date$/.test(record.match.path)).forEach((start) => {
      const end = records.find((record) => record.repeatGroup === start.repeatGroup &&
        record.match.path === start.match.path.replace(/start_date$/, "end_date"));
      if (!end || start.invalidDateRange) return;
      const targetStart = String(recordValue(start, profile) || "").match(/^\d{4}-\d{2}/)?.[0];
      const currentEnd = String(readFieldValue(end) || "").match(/^\d{4}-\d{2}/)?.[0];
      if (targetStart && currentEnd && targetStart > currentEnd) {
        // 整段经历后移时先改结束日期，避免网站把新的开始日期判为超出区间。
        const startIndex = ordered.indexOf(start);
        const endIndex = ordered.indexOf(end);
        if (endIndex > startIndex) {
          ordered.splice(endIndex, 1);
          ordered.splice(startIndex, 0, end);
        }
      }
    });
    return ordered;
  }

  const repeatableDefinitions = [
    {
      key: "education",
      label: "教育经历",
      recordPath: "education[].school",
      addTexts: ["添加教育经历", "新增教育经历", "添加教育背景", "新增教育背景", "add education"]
    },
    {
      key: "work_experience",
      label: "工作经历",
      recordPath: "work_experience[].company",
      addTexts: ["添加工作经历", "新增工作经历", "add work experience", "add employment"]
    },
    {
      key: "internship_experience",
      label: "实习经历",
      recordPath: "internship_experience[].company",
      addTexts: ["添加实习经历", "新增实习经历", "add internship"]
    },
    {
      key: "project_experience",
      label: "项目经历",
      recordPath: "project_experience[].name",
      addTexts: ["添加项目经历", "新增项目经历", "add project"]
    },
    {
      key: "awards",
      label: "获奖情况",
      recordPath: "awards[].name",
      addTexts: ["添加获奖情况", "新增获奖情况", "添加获奖记录", "add award"]
    },
    {
      key: "language_skills",
      label: "语言能力",
      recordPath: "language_skills[].language",
      addTexts: ["添加语言能力", "新增语言能力", "添加语言", "add language"]
    }
  ];

  function repeatLimit(profile, key) {
    const configured = profile.autofill &&
      profile.autofill.repeat_sections &&
      Number(profile.autofill.repeat_sections[key]);
    if (Number.isFinite(configured) && configured >= 0) return configured;
    // 默认使用实际数据长度，至少为1
    const dataLength = Array.isArray(profile[key]) ? profile[key].length : 0;
    return Math.max(dataLength, 1);
  }

  function countRepeatRecords(records, path) {
    return records.filter((record) => record.match.path === path).length;
  }

  function findAddControl(definition) {
    // Moka sd-Button 渲染为 <span> 不含 [role='button']，需用类名通配
    const baseSelectors = [
      "button", "a", "[role='button']",
      "div[tabindex]", "span[tabindex]",
      "[id$='_addButton']",
      "[class*='add']", "[class*='Add']",
      // Sugar Design / Moka: sd-Button, sd-Button-content 等
      "[class*='Button']", "[class*='button']"
    ].join(",");
    const expected = definition.addTexts.map(globalThis.JobAutofillMatcher.normalize);
    // Moka: 添加按钮文本可能仅为 "添加" 或 "+ 添加"，没有区段名
    const genericAdd = ["添加", "新增", "add"];

    let searchRoot = document;
    if (isMoka()) {
      // 先在对应的 apply-block 中搜索
      const blocks = Array.from(document.querySelectorAll(MOKA_SEL.block));
      for (const block of blocks) {
        const heading = block.querySelector(MOKA_SEL.blockTitleText);
        const headingText = heading ? (heading.innerText || heading.textContent || "") : "";
        const norm = globalThis.JobAutofillMatcher.normalize(headingText);
        const defNorm = globalThis.JobAutofillMatcher.normalize(definition.label);
        if (norm.includes(defNorm) || defNorm.includes(norm)) {
          searchRoot = block;
          break;
        }
      }
    }

    const candidates = Array.from(searchRoot.querySelectorAll(baseSelectors))
      .filter((element) => visible(element))
      .map((element) => ({
        element,
        text: cleanText(element.innerText || element.textContent, 60)
      }))
      .filter((item) => {
        if (!item.text || item.text.length > 40) return false;
        const normalized = globalThis.JobAutofillMatcher.normalize(item.text);
        // 精确匹配定义文本
        if (expected.some((text) => normalized === text || normalized.includes(text))) return true;
        // Moka 宽松匹配：按钮仅有 "添加" 且附近有对应区段
        if (isMoka() && genericAdd.some((g) => normalized.includes(g))) {
          // 确认按钮在当前区段内（通过附近文本验证）
          const nearby = item.element.closest(MOKA_SEL.multiGroup) ||
            item.element.closest(MOKA_SEL.block);
          if (nearby) {
            const nearbyText = cleanText(nearby.innerText || nearby.textContent, 200);
            const nNorm = globalThis.JobAutofillMatcher.normalize(nearbyText);
            const defNorm = globalThis.JobAutofillMatcher.normalize(definition.label);
            if (nNorm.includes(defNorm) || defNorm.includes(nNorm)) return true;
          }
        }
        return false;
      })
      .sort((left, right) => {
        const leftSemantic = /^(BUTTON|A)$/.test(left.element.tagName) || left.element.getAttribute("role") === "button";
        const rightSemantic = /^(BUTTON|A)$/.test(right.element.tagName) || right.element.getAttribute("role") === "button";
        if (leftSemantic !== rightSemantic) return leftSemantic ? -1 : 1;
        return left.text.length - right.text.length;
      });

    const best = candidates[0] && candidates[0].element || null;
    // 回退：全文档搜索
    if (!best && searchRoot !== document) {
      const fallback = Array.from(document.querySelectorAll(baseSelectors))
        .filter((el) => visible(el))
        .map((el) => ({
          element: el,
          text: cleanText(el.innerText || el.textContent, 60)
        }))
        .filter((item) => {
          if (!item.text || item.text.length > 40) return false;
          const normalized = globalThis.JobAutofillMatcher.normalize(item.text);
          return expected.some((text) => normalized === text || normalized.includes(text));
        })
        .sort((a, b) => a.text.length - b.text.length);
      return fallback[0] && fallback[0].element || null;
    }
    return best;
  }

  async function ensureRepeatableSections(profile) {
    const report = [];
    for (const definition of repeatableDefinitions) {
      const availableData = Array.isArray(profile[definition.key]) ? profile[definition.key].length : 0;
      if (availableData === 0) continue; // profile 中无此区段数据，跳过
      const target = Math.min(availableData, repeatLimit(profile, definition.key));
      let records = scan(profile);
      const before = countRepeatRecords(records, definition.recordPath);
      let after = before;
      let status = after >= target ? "complete" : "incomplete";
      let message = "";
  
      while (after < target) {
        const addControl = findAddControl(definition);
        if (!addControl) {
          message = "没有找到\u201c新增/添加经历\u201d按钮，请提供该区域截图。";
          break;
        }
        // React 兼容：分发完整鼠标事件序列
        ["mousedown", "mouseup", "click"].forEach((eventName) => {
          addControl.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true }));
        });
        await wait(400);
        records = scan(profile);
        let nextCount = countRepeatRecords(records, definition.recordPath);
        if (nextCount <= after) {
          await wait(700);
          records = scan(profile);
          nextCount = countRepeatRecords(records, definition.recordPath);
        }
        if (nextCount <= after) {
          message = "已点击新增按钮，但没有检测到新字段；页面可能使用了特殊弹窗或异步组件。";
          break;
        }
        after = nextCount;
      }
  
      if (after >= target) {
        status = "complete";
        message = target > before ? "已自动补足经历区块。" : "区块数量已满足。";
      }
      report.push({
        key: definition.key,
        label: definition.label,
        target,
        before,
        after,
        status,
        message
      });
    }
    return report;
  }

  function withinRepeatLimit(record, profile) {
    if (!record.match.path.includes("[]")) return true;
    const arrayName = record.match.path.split("[]")[0];
    if (!["education", "work_experience", "project_experience", "awards", "language_skills"].includes(arrayName)) return true;
    return record.repeatPosition < repeatLimit(profile, arrayName);
  }

  function detectPageCompany(fields) {
    for (const field of fields) {
      const label = (field.descriptor && field.descriptor.label || "").toLowerCase();
      if (/公司|企业/.test(label) && field.descriptor.currentValue) {
        return cleanText(String(field.descriptor.currentValue), 120);
      }
    }
    const title = document.title || "";
    const sep = /\s*[-|]\s*/.exec(title);
    if (sep) {
      const candidate = cleanText(title.slice(0, sep.index), 120);
      if (candidate && candidate.length >= 2) return candidate;
    }
    try {
      const host = new URL(location.href).hostname;
      return cleanText(host.replace(/^www\./, ""), 120);
    } catch (e) {
      return "";
    }
  }

  function detectPagePosition(fields, profile) {
    for (const field of fields) {
      const label = (field.descriptor && field.descriptor.label || "").toLowerCase();
      if (/岗位|职位|应聘/.test(label) && field.descriptor.currentValue) {
        return cleanText(String(field.descriptor.currentValue), 120);
      }
    }
    try {
      const params = new URLSearchParams(location.search);
      for (const key of ["position", "job", "post", "title", "name", "jobName", "jobTitle", "recruitTitle"]) {
        const val = params.get(key);
        if (val && val.trim()) return cleanText(val, 120);
      }
    } catch (e) { /* ignore */ }
    const desiredRole = profile && profile.application && profile.application.desired_role;
    if (desiredRole && String(desiredRole).trim()) {
      return cleanText(String(desiredRole), 120);
    }
    return "";
  }

  function safeSnapshotUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl, location.href);
      if (!/^https?:$/i.test(parsed.protocol)) return "";
      return `${parsed.origin}${parsed.pathname}`;
    } catch (error) {
      return "";
    }
  }

  function pageHtmlSnapshot() {
    const clone = document.documentElement.cloneNode(true);

    // 快照只用于分析字段结构，不允许保存后重新执行原网页脚本。
    clone.querySelectorAll("script,noscript,iframe,object,embed").forEach((node) => node.remove());
    clone.querySelectorAll("meta[http-equiv='refresh' i]").forEach((node) => node.remove());

    clone.querySelectorAll("input").forEach((input) => {
      const type = String(input.getAttribute("type") || "text").toLowerCase();
      const hadValue = Boolean(input.value || input.getAttribute("value"));
      input.removeAttribute("value");
      input.removeAttribute("checked");
      input.setAttribute("data-job-autofill-value-state", hadValue ? "filled" : "empty");
      if (type === "file") input.setAttribute("data-job-autofill-file-state", "manual");
    });
    clone.querySelectorAll("textarea").forEach((textarea) => {
      const hadValue = Boolean(textarea.value || textarea.textContent);
      textarea.textContent = "";
      textarea.setAttribute("data-job-autofill-value-state", hadValue ? "filled" : "empty");
    });
    clone.querySelectorAll("select").forEach((select) => {
      select.querySelectorAll("option").forEach((option) => option.removeAttribute("selected"));
      select.setAttribute("data-job-autofill-value-state", select.value ? "filled" : "empty");
    });
    clone.querySelectorAll("[contenteditable='true']").forEach((editable) => {
      const hadValue = Boolean(cleanText(editable.textContent, 10));
      editable.textContent = hadValue ? "[已填写内容已移除]" : "";
      editable.setAttribute("data-job-autofill-value-state", hadValue ? "filled" : "empty");
    });

    // 常见自绘下拉框会把选中值直接渲染成文本，统一替换但保留组件结构。
    clone.querySelectorAll([
      ".phoenix-select__tipEle",
      ".ant-select-selection-item",
      ".el-select__selected-item",
      ".el-select__tags-text",
      ".arco-select-view-value",
      ".t-select-input",
      ".n-base-selection-label",
      ".semi-select-selection-text",
      MOKA_SEL.displayValue
    ].join(",")).forEach((node) => {
      if (cleanText(node.textContent, 20)) node.textContent = "[已填写内容已移除]";
    });

    clone.querySelectorAll("*").forEach((element) => {
      Array.from(element.attributes).forEach((attribute) => {
        const name = attribute.name;
        const value = attribute.value;
        if (
          /^on/i.test(name) ||
          /(?:token|secret|password|authorization|cookie|session|csrf|nonce)/i.test(name) ||
          name.toLowerCase() === "srcdoc"
        ) {
          element.removeAttribute(name);
          return;
        }
        if (["href", "src", "action", "formaction", "poster"].includes(name.toLowerCase())) {
          const sanitized = safeSnapshotUrl(value);
          if (sanitized) element.setAttribute(name, sanitized);
          else element.removeAttribute(name);
        }
      });
    });

    const pageUrl = safeSnapshotUrl(location.href);
    const generatedAt = new Date().toISOString();
    const metadata = [
      "<!--",
      "  秋招智能填表助手：未匹配网页诊断 HTML",
      `  generated_at: ${generatedAt}`,
      `  page_url_without_query: ${pageUrl}`,
      "  privacy: scripts and form values removed; review visible page text before sharing",
      "-->"
    ].join("\n");
    return {
      html: `<!doctype html>\n${metadata}\n${clone.outerHTML}`,
      title: document.title || "",
      url: pageUrl,
      generatedAt
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return false;

    if (message.type === "JOB_AUTOFILL_EXPORT_HTML") {
      const snapshot = pageHtmlSnapshot();
      sendResponse({
        ok: true,
        html: snapshot.html,
        title: snapshot.title,
        url: snapshot.url,
        generatedAt: snapshot.generatedAt
      });
      return false;
    }

    if (message.type === "JOB_AUTOFILL_SCAN") {
      const profile = globalThis.JobAutofillProfile.migrateLegacyProfile(message.profile || {});
      const records = scan(profile);
      sendResponse({
        ok: true,
        url: location.href,
        title: document.title,
        pageCompany: detectPageCompany(records),
        pagePosition: detectPagePosition(records, profile),
        fields: records.map((record) => publicRecord(record, profile))
      });
      return false;
    }

    if (message.type === "JOB_AUTOFILL_FILL") {
      const profile = globalThis.JobAutofillProfile.migrateLegacyProfile(message.profile || {});
      const desiredLocations = (profile.application.desired_locations || []).filter(Boolean);
      const locationPolicy = profile.application.location_policy || {
        single_select: "first_available",
        multi_select: "all_preferred_available",
        free_text_separator: "/"
      };
      const options = {
        overwrite: Boolean(message.overwrite),
        desiredLocations,
        locationPolicy,
        locationText: desiredLocations.join(locationPolicy.free_text_separator || "/") ||
          profile.application.first_choice_location ||
          ""
      };
      (async () => {
        const expansion = await ensureRepeatableSections(profile);
        const records = scan(profile);
        const results = [];
        for (const record of orderFillRecords(records, profile)) {
          if (!withinRepeatLimit(record, profile)) {
            results.push(Object.assign(publicRecord(record, profile), { status: "over-limit" }));
            continue;
          }
          const value = recordValue(record, profile);
          const status = await setField(record, value, options);
          results.push(Object.assign(publicRecord(record, profile), { status }));
        }
        sendResponse({
          ok: true,
          url: location.href,
          title: document.title,
          results,
          expansion
        });
        // ---- 投递历史记录（以页面标题为主） ----
        const pageTitle = (document.title || "").trim();
        let company = "";
        let position = "";
        // 尝试从标题拆分 公司-岗位
        const sep = /\s*[-–—|｜]\s*/.exec(pageTitle);
        if (sep) {
          company = cleanText(pageTitle.slice(0, sep.index), 120);
          position = cleanText(pageTitle.slice(sep.index + sep[0].length), 120);
        }
        // 若标题解析失败，回退到字段检测
        if (!company) company = detectPageCompany(records);
        if (!position) position = detectPagePosition(records, profile);
        if (pageTitle || company || position) {
          globalThis.JobAutofillStorage.addApplicationRecord({
            title: pageTitle,
            company,
            position,
            url: location.href
          }).then(() => {
            chrome.runtime.sendMessage({ type: "JOB_AUTOFILL_RECORD" }).catch(() => {});
          }).catch(() => {});
        }
      })();
      return true;
    }

    return false;
  });
})();

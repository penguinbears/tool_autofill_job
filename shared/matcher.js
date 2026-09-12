(function (root) {
  "use strict";

  const aliases = [
    ["personal.full_name", ["姓名", "名字", "真实姓名", "中文姓名", "name", "full name"]],
    ["personal.english_name", ["英文名", "英文姓名", "english name"]],
    ["personal.gender", ["性别", "gender"]],
    ["personal.birth_date", ["出生日期", "生日", "birth date", "date of birth"]],
    ["personal.phone_country_code", ["国家区号", "电话区号", "country code"]],
    ["personal.phone", ["手机号", "手机号码", "联系电话", "移动电话", "phone", "mobile", "telephone"]],
    ["personal.email", ["邮箱", "电子邮箱", "电子邮件", "email", "e-mail"]],
    ["personal.highest_degree", ["最高学历", "最高学位", "学历", "degree"]],
    ["personal.nationality", ["国籍", "nationality"]],
    ["personal.ethnicity", ["民族", "ethnicity"]],
    ["personal.political_status", ["政治面貌", "political status"]],
    ["personal.current_country", ["当前所在国家", "现居国家", "所在国家", "country"]],
    ["personal.current_province", ["当前所在省", "现居省份", "所在省份", "province"]],
    ["personal.current_city", ["当前所在省市", "当前所在城市", "现居城市", "所在城市", "city"]],
    ["personal.hometown_city", ["籍贯", "生源地", "家乡", "hometown"]],
    ["personal.hukou_location", ["户口所在地", "户籍所在地", "hukou"]],
    ["personal.current_address", ["现居地址", "当前地址", "通信地址", "address"]],
    ["application.desired_role", ["意向职位", "期望职位", "应聘岗位", "desired role"]],
    ["application.first_choice_location", ["意向工作地点", "第一意向地点", "期望工作地点", "期望城市", "工作地点", "preferred location"]],
    ["application.available_date", ["到岗时间", "可入职时间", "available date"]],
    ["application.expected_salary", ["期望薪资", "期望月薪", "expected salary"]],
    ["application.referral_code", ["推荐码", "内推码", "referral code"]],
    ["education[].school", ["学校名称", "毕业院校", "学校", "院校", "school", "university"]],
    ["education[].education_level", ["学历", "学历层次", "教育程度", "education level"]],
    ["education[].degree", ["学位", "degree"]],
    ["education[].college", ["学院名称", "院系", "学院", "college", "faculty"]],
    ["education[].major", ["专业名称", "所学专业", "专业", "major"]],
    ["education[].major_category", ["专业大类", "专业类别", "学科门类", "学科类别", "major category", "field of study"]],
    ["education[].start_date", ["教育开始时间", "入学时间", "就读时间", "开始时间", "start date"]],
    ["education[].end_date", ["教育结束时间", "毕业时间", "就读时间", "结束时间", "end date"]],
    ["education[].gpa", ["绩点", "gpa"]],
    ["work_experience[].company", ["公司名称", "单位名称", "公司", "雇主", "company"]],
    ["work_experience[].department", ["部门名称", "所在部门", "department"]],
    ["work_experience[].position", ["职位名称", "工作职位", "岗位名称", "职位", "职务", "position", "job title"]],
    ["work_experience[].start_date", ["工作开始时间", "起止时间", "开始时间", "start date"]],
    ["work_experience[].end_date", ["工作结束时间", "起止时间", "结束时间", "end date"]],
    ["work_experience[].is_current", ["至今", "仍在职", "current"]],
    ["work_experience[].responsibilities", ["工作职责", "工作内容", "职责描述", "工作描述", "responsibilities"]],
    ["project_experience[].name", ["项目名称", "project name"]],
    ["project_experience[].role", ["项目职务", "项目角色", "担任角色", "role"]],
    ["project_experience[].start_date", ["项目开始时间", "开始时间", "start date"]],
    ["project_experience[].end_date", ["项目结束时间", "结束时间", "end date"]],
    ["project_experience[].is_current", ["至今", "进行中", "current"]],
    ["project_experience[].description", ["项目描述", "项目内容", "project description"]],
    ["awards[].name", ["获奖项", "奖项名称", "荣誉名称", "award"]],
    ["awards[].date", ["获奖时间", "award date"]],
    ["awards[].level", ["获奖级别", "奖项级别", "award level"]],
    ["awards[].description", ["获奖描述", "奖项描述", "award description"]],
    ["language_skills[].language", ["语言类型", "语种", "language"]],
    ["language_skills[].proficiency", ["掌握程度", "熟练程度", "proficiency"]],
    ["language_skills[].speaking", ["听说", "口语", "speaking"]],
    ["language_skills[].writing", ["读写", "writing"]],
    ["language_skills[].certificate", ["语言证书及成绩", "证书及成绩", "certificate"]],
    ["skills.self_evaluation", ["自我评价", "个人评价", "self evaluation"]],
    ["links.portfolio", ["作品集", "portfolio"]],
    ["links.github", ["github", "代码仓库"]],
    ["files.resume", ["上传简历", "简历附件", "个人简历", "resume"]],
    ["files.transcript", ["成绩单", "transcript"]],
    ["additional.other_locations", ["其他意向工作地点", "其他工作地点"]],
    ["additional.supplementary", ["补充说明", "其他说明", "备注", "supplementary"]]
  ];

  // 实习资料在档案中是独立数组，不能按工作经历的下标读取。
  aliases.push(...aliases.filter(([path]) => path.startsWith("work_experience[]."))
    .map(([path, words]) => [path.replace("work_experience", "internship_experience"), words]));

  const sectionWords = {
    education: ["教育经历", "教育背景", "education"],
    internship_experience: ["实习经历", "实习经验", "internship", "intern experience"],
    work_experience: ["工作经历", "职业经历", "work experience", "employment"],
    project_experience: ["项目经历", "项目经验", "project experience"],
    awards: ["获奖情况", "奖项荣誉", "荣誉奖励", "awards"],
    language_skills: ["语言能力", "外语能力", "languages"]
  };

  const sensitiveHints = ["身份证", "证件号码", "护照", "银行卡", "银行账号", "id number", "passport", "bank account"];

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[\s\u00a0*：:（）()【】\[\]_\-.\/\\]+/g, "")
      .replace(/[年月日]/g, "");
  }

  function inferSection(context) {
    const text = normalize(context);
    let result = "";
    Object.entries(sectionWords).forEach(([section, words]) => {
      if (!result && words.some((word) => text.includes(normalize(word)))) {
        result = section;
      }
    });
    return result;
  }

  function isSensitive(context) {
    const text = normalize(context);
    return sensitiveHints.some((word) => text.includes(normalize(word)));
  }

  function scoreAlias(fieldText, aliasText) {
    const field = normalize(fieldText);
    const alias = normalize(aliasText);
    if (!field || !alias) return 0;
    if (field === alias) return 100;
    if (field.includes(alias)) return 82;
    if (alias.includes(field) && field.length >= 3) return 62;
    return 0;
  }

  function matchField(descriptor) {
    const directContext = [
      descriptor.label,
      descriptor.placeholder,
      descriptor.name,
      descriptor.id,
      descriptor.ariaLabel
    ].filter(Boolean).join(" ");
    const fallbackContext = descriptor.nearbyText || "";
    const hasDirectSemanticLabel = normalize(
      [
        descriptor.label,
        descriptor.ariaLabel,
        descriptor.placeholder
      ].filter(Boolean).join(" ")
    ).length >= 2;

    if (isSensitive(directContext)) {
      return { path: "", score: 0, sensitive: true, reason: "sensitive-field" };
    }

    const section = inferSection(descriptor.sectionText || descriptor.nearbyText || "");
    let best = { path: "", score: 0, sensitive: false, reason: "no-match" };

    aliases.forEach(([path, words]) => {
      let score = Math.max(...words.map((word) => scoreAlias(directContext, word)));
      if (score < 60 && fallbackContext && !hasDirectSemanticLabel) {
        const fallbackScore = Math.max(...words.map((word) => scoreAlias(fallbackContext, word)));
        score = Math.min(64, fallbackScore);
      }
      const arraySection = path.includes("[]") ? path.split("[]")[0] : "";

      if (arraySection && section) {
        score += arraySection === section ? 28 : -45;
      }
      if (!arraySection && section && score < 90) {
        score -= 12;
      }
      if (score > best.score) {
        best = { path, score, sensitive: false, reason: "alias" };
      }
    });

    if (best.score < 60) {
      return { path: "", score: best.score, sensitive: false, reason: "low-confidence" };
    }
    return best;
  }

  function getValue(profile, path, index) {
    if (!path) return "";
    if (path.includes("[]")) {
      const parts = path.split("[].");
      const items = profile[parts[0]] || [];
      const item = items[index || 0] || {};
      return item[parts[1]];
    }
    return path.split(".").reduce((value, key) => value == null ? undefined : value[key], profile);
  }

  root.JobAutofillMatcher = {
    aliases,
    normalize,
    inferSection,
    isSensitive,
    matchField,
    getValue
  };
})(globalThis);

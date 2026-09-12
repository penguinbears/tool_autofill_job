(function (root) {
  "use strict";

  const PROFILE_VERSION = "2.0";

  // 磁盘 JSON 使用中文 key；插件内部继续使用稳定的英文路径供匹配器读取。
  // 自定义回答的子 key 是网页问题原文，不参与翻译。
  const PROFILE_KEY_ZH = {
    meta: "元数据",
    schema_version: "档案版本",
    updated_at: "更新时间",
    locale: "语言地区",
    personal: "个人信息",
    full_name: "姓名",
    family_name: "姓",
    given_name: "名",
    english_name: "英文名",
    gender: "性别",
    birth_date: "出生日期",
    phone_country_code: "电话国家区号",
    phone: "手机号",
    email: "邮箱",
    alternate_email: "备用邮箱",
    nationality: "国籍",
    ethnicity: "民族",
    political_status: "政治面貌",
    marital_status: "婚姻状况",
    highest_degree: "最高学历",
    current_country: "当前国家",
    current_province: "当前省份",
    current_city: "当前城市",
    hometown_province: "家乡省份",
    hometown_city: "家乡城市",
    hukou_location: "户口所在地",
    current_address: "当前地址",
    application: "求职意向",
    desired_role: "意向职位",
    desired_locations: "意向工作地点",
    first_choice_location: "第一意向地点",
    location_policy: "地点填写策略",
    single_select: "单选策略",
    multi_select: "多选策略",
    free_text_separator: "自由文本分隔符",
    available_date: "可到岗日期",
    employment_type: "招聘类型",
    expected_salary: "期望薪资",
    referral_code: "内推码",
    source_channel: "投递渠道",
    education: "教育经历",
    school: "学校",
    degree: "学位",
    education_level: "学历",
    college: "学院",
    major: "专业",
    major_category: "专业大类",
    start_date: "开始时间",
    end_date: "结束时间",
    gpa: "绩点",
    rank: "排名",
    description: "描述",
    work_experience: "工作经历",
    company: "公司",
    department: "部门",
    position: "职位",
    is_current: "是否在职",
    responsibilities: "工作内容",
    internship_experience: "实习经历",
    project_experience: "项目经历",
    name: "名称",
    role: "担任角色",
    awards: "获奖经历",
    date: "日期",
    language_skills: "语言能力",
    language: "语言",
    proficiency: "熟练程度",
    certificate: "证书",
    skills: "技能",
    technical: "技术技能",
    certificates: "证书列表",
    self_evaluation: "自我评价",
    links: "个人链接",
    portfolio: "作品集",
    github: "代码仓库",
    linkedin: "领英主页",
    personal_site: "个人网站",
    files: "文件",
    resume: "简历",
    transcript: "成绩单",
    other: "其他文件",
    additional: "补充信息",
    other_locations: "其他意向地点",
    supplementary: "补充说明",
    custom_answers: "自定义回答",
    autofill: "自动填写设置",
    repeat_sections: "重复区块数量",
    sensitive: "敏感信息",
    id_type: "证件类型",
    id_number: "证件号码",
    passport_number: "护照号码",
    bank_account: "银行账号"
  };
  const PROFILE_KEY_EN = Object.fromEntries(
    Object.entries(PROFILE_KEY_ZH).map(([english, chinese]) => [chinese, english])
  );

  const DEFAULT_PROFILE = {
    meta: {
      schema_version: PROFILE_VERSION,
      updated_at: "",
      locale: "zh-CN"
    },
    personal: {
      full_name: "",
      family_name: "",
      given_name: "",
      english_name: "",
      gender: "",
      birth_date: "",
      phone_country_code: "+86",
      phone: "",
      email: "",
      alternate_email: "",
      nationality: "",
      ethnicity: "",
      political_status: "",
      marital_status: "",
      highest_degree: "",
      current_country: "",
      current_province: "",
      current_city: "",
      hometown_province: "",
      hometown_city: "",
      hukou_location: "",
      current_address: ""
    },
    application: {
      desired_role: "",
      desired_locations: [],
      first_choice_location: "",
      location_policy: {
        single_select: "first_available",
        multi_select: "all_preferred_available",
        free_text_separator: "/"
      },
      available_date: "",
      employment_type: "",
      expected_salary: "",
      referral_code: "",
      source_channel: ""
    },
    education: [],
    work_experience: [],
    internship_experience: [],
    project_experience: [],
    awards: [],
    language_skills: [],
    skills: {
      technical: [],
      certificates: [],
      self_evaluation: ""
    },
    links: {
      portfolio: "",
      github: "",
      linkedin: "",
      personal_site: ""
    },
    files: {
      resume: "",
      transcript: "",
      portfolio: "",
      other: []
    },
    additional: {
      other_locations: "",
      supplementary: "",
      custom_answers: {}
    },
    autofill: {
      repeat_sections: {
        education: 2,
        work_experience: 2
      }
    },
    sensitive: {
      id_type: "",
      id_number: "",
      passport_number: "",
      bank_account: ""
    }
  };

  const deepClone = (value) => JSON.parse(JSON.stringify(value));

  function translateProfileKeys(value, keyMap, parentKey) {
    if (Array.isArray(value)) {
      return value.map((item) => translateProfileKeys(item, keyMap, parentKey));
    }
    if (!value || typeof value !== "object") return value;
    if (parentKey === "custom_answers") return deepClone(value);

    const output = {};
    Object.entries(value).forEach(([key, child]) => {
      const translatedKey = keyMap[key] || key;
      const internalParent = keyMap === PROFILE_KEY_EN
        ? translatedKey
        : key;
      output[translatedKey] = translateProfileKeys(child, keyMap, internalParent);
    });
    return output;
  }

  function toInternalProfile(input) {
    return translateProfileKeys(input && typeof input === "object" ? input : {}, PROFILE_KEY_EN, "");
  }

  function toExternalProfile(input) {
    return translateProfileKeys(input && typeof input === "object" ? input : {}, PROFILE_KEY_ZH, "");
  }

  function mergeProfile(input) {
    const source = toInternalProfile(input);
    const output = deepClone(DEFAULT_PROFILE);

    function merge(target, value) {
      Object.keys(value || {}).forEach((key) => {
        if (Array.isArray(value[key])) {
          target[key] = deepClone(value[key]);
        } else if (value[key] && typeof value[key] === "object") {
          if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) {
            target[key] = {};
          }
          merge(target[key], value[key]);
        } else {
          target[key] = value[key];
        }
      });
    }

    merge(output, source);
    output.meta.schema_version = PROFILE_VERSION;
    return output;
  }

  function validateProfile(input) {
    const profile = toInternalProfile(input);
    const errors = [];
    const warnings = [];
    const arrayFields = [
      "education",
      "work_experience",
      "internship_experience",
      "project_experience",
      "awards",
      "language_skills"
    ];

    ["meta", "personal", "application", "skills", "links", "files", "additional", "autofill", "sensitive"]
      .forEach((key) => {
        if (profile[key] !== undefined && (
          !profile[key] ||
          typeof profile[key] !== "object" ||
          Array.isArray(profile[key])
        )) {
          errors.push(`${key} 必须是 JSON 对象`);
        }
      });
    arrayFields.forEach((key) => {
      if (profile[key] !== undefined && !Array.isArray(profile[key])) {
        errors.push(`${key} 必须是 JSON 数组`);
      }
    });
    if (
      profile.application &&
      profile.application.desired_locations !== undefined &&
      !Array.isArray(profile.application.desired_locations)
    ) {
      errors.push("application.desired_locations 必须是数组");
    }

    const repeatSections = profile.autofill && profile.autofill.repeat_sections;
    if (repeatSections && typeof repeatSections === "object") {
      ["education", "work_experience", "internship_experience"].forEach((key) => {
        if (repeatSections[key] !== undefined && (
          !Number.isFinite(Number(repeatSections[key])) ||
          Number(repeatSections[key]) < 0
        )) {
          errors.push(`autofill.repeat_sections.${key} 必须是大于等于 0 的数字`);
        }
      });
    }

    const datePattern = /^\d{4}-(0[1-9]|1[0-2])(?:-\d{2})?$/;
    ["education", "work_experience", "internship_experience", "project_experience"].forEach((key) => {
      if (!Array.isArray(profile[key])) return;
      profile[key].forEach((item, index) => {
        ["start_date", "end_date"].forEach((field) => {
          const value = item && item[field];
          if (value && !datePattern.test(String(value))) {
            warnings.push(`${key}[${index}].${field} 建议使用 YYYY-MM 或 YYYY-MM-DD`);
          }
        });
        if (item?.start_date && item?.end_date && datePattern.test(item.start_date) && datePattern.test(item.end_date) &&
          item.start_date.slice(0, 7) > item.end_date.slice(0, 7)) warnings.push(`${key}[${index}] 结束时间早于开始时间`);
      });
    });

    const personal = profile.personal || {};
    [
      ["personal.full_name", personal.full_name],
      ["personal.phone", personal.phone],
      ["personal.email", personal.email]
    ].forEach(([path, value]) => {
      if (!value) warnings.push(`${path} 尚未填写`);
    });
    if (!Array.isArray(profile.education) || !profile.education.length) {
      warnings.push("education 尚无教育经历");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  function migrateLegacyProfile(input) {
    const source = toInternalProfile(input);
    if (!source.personal_info) {
      return mergeProfile(source);
    }

    const output = mergeProfile({});
    const personal = source.personal_info || {};
    const intent = source.application_intent || {};

    output.personal.full_name = personal.name || "";
    output.personal.email = personal.email || "";
    output.personal.phone = personal.phone || "";
    output.personal.highest_degree = personal.highest_education || "";
    output.personal.current_country = personal.current_country || "";
    output.personal.current_city = personal.current_province_city || "";

    if (intent.preferred_location && intent.preferred_location !== "FIRST_OPTION") {
      output.application.first_choice_location = intent.preferred_location;
      output.application.desired_locations = [intent.preferred_location];
    }
    output.application.referral_code = intent.referral_code || "";

    output.education = (source.education || []).map((item) => ({
      school: item.school || "",
      degree: item.degree || "",
      education_level: item.education_level || "",
      college: item.college || "",
      major: item.major || "",
      major_category: item.major_category || "",
      start_date: item.start_date || "",
      end_date: item.end_date || "",
      gpa: item.gpa || "",
      rank: item.rank || "",
      description: item.description || ""
    }));

    output.work_experience = (source.work_experience || []).map((item) => ({
      company: item.company || "",
      department: item.department || "",
      position: item.position || "",
      start_date: item.start_date || "",
      end_date: item.end_date || "",
      is_current: Boolean(item.is_current),
      responsibilities: item.responsibilities || ""
    }));

    output.project_experience = deepClone(source.project_experience || []);
    output.internship_experience = deepClone(source.internship_experience || []);
    output.awards = deepClone(source.awards || []);
    output.language_skills = deepClone(source.language_skills || []);
    output.additional = Object.assign(output.additional, source.additional || {});
    output.files.resume = source.resume_file || "";
    output.files.other = deepClone(source.attachments || []);
    return output;
  }

  function setValue(profile, path, index, value) {
    if (!profile || !path) return profile;
    if (path.includes("[]")) {
      const parts = path.split("[].");
      const arrayName = parts[0];
      const propertyName = parts[1];
      if (!Array.isArray(profile[arrayName])) profile[arrayName] = [];
      const itemIndex = Math.max(0, Number(index) || 0);
      while (profile[arrayName].length <= itemIndex) profile[arrayName].push({});
      profile[arrayName][itemIndex][propertyName] = value;
      return profile;
    }
    const keys = path.split(".");
    let target = profile;
    keys.slice(0, -1).forEach((key) => {
      if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) {
        target[key] = {};
      }
      target = target[key];
    });
    target[keys[keys.length - 1]] = value;
    return profile;
  }

  root.JobAutofillProfile = {
    PROFILE_VERSION,
    DEFAULT_PROFILE,
    mergeProfile,
    migrateLegacyProfile,
    validateProfile,
    setValue,
    deepClone,
    PROFILE_KEY_ZH,
    toInternalProfile,
    toExternalProfile
  };
})(globalThis);

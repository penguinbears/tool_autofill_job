const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ globalThis: {} });
for (const file of ["../shared/profile.js", "../shared/matcher.js"]) {
  const source = fs.readFileSync(path.join(__dirname, file), "utf8");
  vm.runInContext(source, context, { filename: file });
}

const matcher = context.globalThis.JobAutofillMatcher;
const profileApi = context.globalThis.JobAutofillProfile;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const cases = [
  [{ label: "姓名" }, "personal.full_name"],
  [{ label: "手机号码" }, "personal.phone"],
  [{ label: "推荐码" }, "application.referral_code"],
  [{ label: "学校名称", sectionText: "教育经历" }, "education[].school"],
  [{ label: "学历", sectionText: "教育经历" }, "education[].education_level"],
  [{ label: "学位", sectionText: "教育经历" }, "education[].degree"],
  [{ label: "专业大类", sectionText: "教育经历" }, "education[].major_category"],
  [{ label: "公司名称", sectionText: "工作经历" }, "work_experience[].company"],
  [{ label: "项目描述", sectionText: "项目经历" }, "project_experience[].description"],
  [{ label: "语言证书及成绩", sectionText: "语言能力" }, "language_skills[].certificate"]
];

for (const [descriptor, expected] of cases) {
  const actual = matcher.matchField(descriptor).path;
  assert(actual === expected, `${JSON.stringify(descriptor)} expected ${expected}, got ${actual}`);
}

assert(matcher.matchField({ label: "身份证号码" }).sensitive, "ID number should be sensitive");

const migrated = profileApi.migrateLegacyProfile({
  personal_info: { name: "测试用户", email: "test@example.com" },
  education: [{ school: "示例大学" }]
});
assert(migrated.personal.full_name === "测试用户", "legacy name migration failed");
assert(migrated.education[0].school === "示例大学", "legacy education migration failed");

const migratedEducationFields = profileApi.migrateLegacyProfile({
  personal_info: {},
  education: [{ education_level: "硕士", degree: "工学硕士", major_category: "工科" }]
});
assert(migratedEducationFields.education[0].education_level === "硕士", "education level migration failed");
assert(migratedEducationFields.education[0].degree === "工学硕士", "degree migration failed");
assert(migratedEducationFields.education[0].major_category === "工科", "major category migration failed");

profileApi.setValue(migrated, "personal.gender", 0, "男");
profileApi.setValue(migrated, "education[].end_date", 1, "2021-06");
assert(migrated.personal.gender === "男", "scalar path update failed");
assert(migrated.education[1].end_date === "2021-06", "array path update failed");
assert(migrated.autofill.repeat_sections.education === 2, "repeat section default missing");

const validProfile = profileApi.validateProfile(migrated);
assert(validProfile.valid, "valid profile should pass validation");
const invalidProfile = profileApi.validateProfile({ education: "not-an-array" });
assert(!invalidProfile.valid, "invalid array type should fail validation");

const chineseProfile = profileApi.toExternalProfile(migratedEducationFields);
assert(chineseProfile.元数据.档案版本 === "2.0", "Chinese profile version missing");
assert(chineseProfile.教育经历[0].学历 === "硕士", "Chinese education level export failed");
assert(chineseProfile.教育经历[0].专业大类 === "工科", "Chinese major category export failed");
assert(chineseProfile.personal === undefined, "English root key leaked into Chinese profile");

const roundTripProfile = profileApi.migrateLegacyProfile(chineseProfile);
assert(roundTripProfile.education[0].education_level === "硕士", "Chinese profile import failed");
assert(roundTripProfile.education[0].major_category === "工科", "Chinese major category import failed");
assert(profileApi.validateProfile(chineseProfile).valid, "Chinese profile should pass validation");

roundTripProfile.additional.custom_answers = { "姓名": "自定义问题答案" };
const customAnswerRoundTrip = profileApi.migrateLegacyProfile(
  profileApi.toExternalProfile(roundTripProfile)
);
assert(customAnswerRoundTrip.additional.custom_answers.姓名 === "自定义问题答案", "custom answer key was translated");

console.log(`matcher/profile tests passed: ${cases.length + 16}`);

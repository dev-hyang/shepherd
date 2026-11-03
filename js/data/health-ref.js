/* ============ 家人健康 · 参考数据 ============
   就诊类型、在家测量的种类、常见化验项目（默认单位和参考范围）、体征的提示阈值。
   参考范围是常见成人范围（美国常用单位），各家化验室不完全一样：表单里预填，可以按化验单改；判断偏高 / 偏低按每一行自己存的范围。
   阈值来自公开指南（ACC/AHA 2017 血压、ADA A1c / 空腹血糖、WHO BMI），只用来提示「复诊时问医生」，不下结论。
   文字是简体键，显示时经过 t()。 */

const VISIT_KINDS = {
  annual:     { label: "年度体检", icon: "🩺" },
  regular:    { label: "普通门诊", icon: "🏥" },
  urgent:     { label: "Urgent care", icon: "⚡" },
  er:         { label: "急诊", icon: "🚑" },
  specialist: { label: "专科", icon: "🔬" },
  dental:     { label: "牙科", icon: "🦷" },
  vision:     { label: "眼科", icon: "👁" },
  tele:       { label: "线上问诊", icon: "💻" },
  other:      { label: "其他", icon: "📋" }
};

/* 就诊地点的类型（迁移 028 的 hl_visits.place）；地点名字 / 地址另存 location */
const PLACES = {
  clinic:   { label: "诊所", icon: "🏥" },
  hospital: { label: "医院", icon: "🏨" },
  urgent:   { label: "急诊中心（Urgent care）", icon: "⚡" },
  er:       { label: "医院急诊", icon: "🚑" },
  lab:      { label: "化验站", icon: "🧪" },
  home:     { label: "上门", icon: "🏠" },
  online:   { label: "线上", icon: "💻" },
  other:    { label: "其他", icon: "📍" }
};

/* 在家测量：dim = 显示时要换算的量纲（见 health-lib.js 的 toShow / fromShow） */
const MEASURE_KINDS = {
  weight:  { label: "体重", icon: "⚖", dim: "weight" },
  bp:      { label: "血压", icon: "❤", dim: "mmhg", two: true },
  hr:      { label: "心率", icon: "💓", dim: "bpm" },
  glucose: { label: "血糖", icon: "🩸", dim: "glucose" },
  temp:    { label: "体温", icon: "🌡", dim: "temp" },
  waist:   { label: "腰围", icon: "📏", dim: "length" },
  height:  { label: "身高", icon: "📐", dim: "length" }
};

/* 化验项目，按化验单上常见的「套餐」分组（2026-11-02 按真实的 MyChart / Epic 结果页调整）：血脂 Lipid panel、代谢综合 CMP、血常规 CBC，再加糖化、甲状腺、维生素与铁、其他。
   code → { name, en, unit, low, high, group, alias }。low / high 是常见成人参考范围（美国常用单位），null = 那一侧没有界限；各家化验室不完全一样——
   读化验单时以单子上的范围为准（AI 读图、手填都能改），偏高 / 偏低按每一行存的范围判断。alias：化验单上常见的写法（不分大小写，读图对项目用）。
   旧数据里已有的 code（ldl、hdl、trig、total_chol、a1c、glucose、creatinine、egfr、bun、alt、ast、tsh、vit_d、b12、ferritin、hgb、wbc、plt、uric、psa）保持不变。 */
const LAB_GROUPS = { lipid: "血脂", cmp: "代谢综合（CMP）", cbc: "血常规（CBC）", sugar: "糖化 / 血糖", thyroid: "甲状腺", vitamin: "维生素与铁", other: "其他" };
const LABS = {
  // 血脂 Lipid panel
  total_chol: { name: "总胆固醇", en: "Total cholesterol", unit: "mg/dL", low: null, high: 200, group: "lipid", alias: ["cholesterol", "cholesterol, total", "chol"] },
  trig:       { name: "甘油三酯", en: "Triglycerides", unit: "mg/dL", low: null, high: 150, group: "lipid", alias: ["triglyceride", "tg"] },
  hdl:        { name: "高密度脂蛋白 HDL", en: "HDL", unit: "mg/dL", low: 40, high: null, group: "lipid", alias: ["direct hdl", "hdl cholesterol", "hdl-c"] },
  ldl:        { name: "低密度脂蛋白 LDL", en: "LDL", unit: "mg/dL", low: null, high: 100, group: "lipid", alias: ["calculated ldl", "ldl cholesterol", "ldl-c", "ldl calc", "direct ldl"] },
  vldl:       { name: "极低密度脂蛋白 VLDL", en: "VLDL", unit: "mg/dL", low: null, high: 30, group: "lipid", alias: ["calculated vldl", "vldl cholesterol"] },
  chol_hdl:   { name: "胆固醇 / HDL 比值", en: "Cholesterol/HDL ratio", unit: "", low: null, high: 5, group: "lipid", alias: ["risk factor", "chol/hdl ratio", "total cholesterol/hdl ratio", "cholesterol/hdl"] },
  non_hdl:    { name: "非 HDL 胆固醇", en: "Non-HDL cholesterol", unit: "mg/dL", low: null, high: 130, group: "lipid", alias: ["non hdl cholesterol", "non-hdl"] },
  // 代谢综合 CMP（含基础代谢 BMP）
  glucose:    { name: "血糖（空腹）", en: "Glucose", unit: "mg/dL", low: 70, high: 99, group: "cmp", alias: ["fasting glucose", "glucose, fasting", "glucose level"] },
  bun:        { name: "尿素氮 BUN", en: "BUN", unit: "mg/dL", low: 6, high: 20, group: "cmp", alias: ["blood urea nitrogen", "urea nitrogen"] },
  creatinine: { name: "肌酐", en: "Creatinine", unit: "mg/dL", low: 0.7, high: 1.2, group: "cmp", alias: ["creat"] },
  egfr:       { name: "肾小球滤过率 eGFR", en: "eGFR", unit: "mL/min/1.73m²", low: 60, high: null, group: "cmp", alias: ["gfr", "gfr ckd-epi", "gfr ckd-epi no race", "egfr ckd-epi", "estimated gfr"] },
  sodium:     { name: "钠", en: "Sodium", unit: "mmol/L", low: 136, high: 145, group: "cmp", alias: ["na"] },
  potassium:  { name: "钾", en: "Potassium", unit: "mmol/L", low: 3.5, high: 5.2, group: "cmp", alias: ["k"] },
  chloride:   { name: "氯", en: "Chloride", unit: "mmol/L", low: 98, high: 107, group: "cmp", alias: ["cl"] },
  co2:        { name: "二氧化碳（碳酸氢根）", en: "Carbon dioxide", unit: "mmol/L", low: 22, high: 29, group: "cmp", alias: ["co2", "bicarbonate", "carbon dioxide, total", "total co2"] },
  calcium:    { name: "钙", en: "Calcium", unit: "mg/dL", low: 8.6, high: 10.3, group: "cmp", alias: ["ca"] },
  protein:    { name: "总蛋白", en: "Total protein", unit: "g/dL", low: 6.4, high: 8.3, group: "cmp", alias: ["protein, total"] },
  albumin:    { name: "白蛋白", en: "Albumin", unit: "g/dL", low: 3.5, high: 5.2, group: "cmp", alias: ["alb"] },
  bilirubin:  { name: "总胆红素", en: "Bilirubin, total", unit: "mg/dL", low: 0, high: 1.2, group: "cmp", alias: ["total bilirubin", "bilirubin"] },
  alp:        { name: "碱性磷酸酶 ALP", en: "Alkaline phosphatase", unit: "U/L", low: 45, high: 117, group: "cmp", alias: ["alk phos", "alkaline phosphatase, total"] },
  ast:        { name: "谷草转氨酶 AST", en: "AST", unit: "U/L", low: 0, high: 40, group: "cmp", alias: ["sgot", "ast (sgot)"] },
  alt:        { name: "谷丙转氨酶 ALT", en: "ALT", unit: "U/L", low: 0, high: 41, group: "cmp", alias: ["sgpt", "alt (sgpt)"] },
  // 血常规 CBC
  wbc:        { name: "白细胞 WBC", en: "WBC", unit: "10³/µL", low: 4, high: 11, group: "cbc", alias: ["white blood cell count", "white blood cells", "leukocytes"] },
  rbc:        { name: "红细胞 RBC", en: "RBC", unit: "10⁶/µL", low: 4.3, high: 5.7, group: "cbc", alias: ["red blood cell count", "red blood cells", "erythrocytes"] },
  hgb:        { name: "血红蛋白", en: "Hemoglobin", unit: "g/dL", low: 13, high: 17, group: "cbc", alias: ["hgb", "hb"] },
  hct:        { name: "红细胞压积", en: "Hematocrit", unit: "%", low: 37, high: 53, group: "cbc", alias: ["hct"] },
  mcv:        { name: "平均红细胞体积 MCV", en: "MCV", unit: "fL", low: 80, high: 99, group: "cbc", alias: ["mean corpuscular volume"] },
  mch:        { name: "平均血红蛋白量 MCH", en: "MCH", unit: "pg", low: 27, high: 33.2, group: "cbc", alias: ["mean corpuscular hemoglobin"] },
  mchc:       { name: "平均血红蛋白浓度 MCHC", en: "MCHC", unit: "g/dL", low: 31, high: 37, group: "cbc", alias: [] },
  plt:        { name: "血小板", en: "Platelets", unit: "10³/µL", low: 150, high: 450, group: "cbc", alias: ["platelet count", "plt"] },
  rdw:        { name: "红细胞分布宽度 RDW", en: "RDW", unit: "%", low: 11.5, high: 16, group: "cbc", alias: ["rdw-cv"] },
  mpv:        { name: "平均血小板体积 MPV", en: "MPV", unit: "fL", low: 7, high: 11.5, group: "cbc", alias: ["mean platelet volume"] },
  // 其他套餐
  a1c:        { name: "糖化血红蛋白 A1c", en: "Hemoglobin A1c", unit: "%", low: null, high: 5.7, group: "sugar", alias: ["hba1c", "a1c", "glycated hemoglobin", "hemoglobin a1c"] },
  tsh:        { name: "促甲状腺激素 TSH", en: "TSH", unit: "mIU/L", low: 0.4, high: 4.0, group: "thyroid", alias: ["thyroid stimulating hormone"] },
  ft4:        { name: "游离 T4", en: "Free T4", unit: "ng/dL", low: 0.8, high: 1.8, group: "thyroid", alias: ["t4, free", "free thyroxine"] },
  vit_d:      { name: "维生素 D（25-OH）", en: "Vitamin D (25-OH)", unit: "ng/mL", low: 30, high: 100, group: "vitamin", alias: ["vitamin d", "25-hydroxy vitamin d", "vitamin d, 25-hydroxy", "25-oh vitamin d"] },
  b12:        { name: "维生素 B12", en: "Vitamin B12", unit: "pg/mL", low: 200, high: 900, group: "vitamin", alias: ["vitamin b12", "cobalamin"] },
  ferritin:   { name: "铁蛋白", en: "Ferritin", unit: "ng/mL", low: 30, high: 400, group: "vitamin", alias: [] },
  iron:       { name: "血清铁", en: "Iron", unit: "µg/dL", low: 60, high: 170, group: "vitamin", alias: ["iron, total", "serum iron"] },
  uric:       { name: "尿酸", en: "Uric acid", unit: "mg/dL", low: 3.5, high: 7.2, group: "other", alias: ["urate"] },
  psa:        { name: "前列腺特异抗原 PSA", en: "PSA", unit: "ng/mL", low: null, high: 4, group: "other", alias: ["prostate specific antigen", "psa, total"] },
  crp:        { name: "C 反应蛋白", en: "CRP", unit: "mg/L", low: null, high: 3, group: "other", alias: ["c-reactive protein", "hs-crp", "hscrp"] }
};
/* 这几项正常时也建议每年查一次（成人）：用于「该复查」 */
const YEARLY_LABS = ["ldl", "a1c", "glucose", "total_chol"];

/* 体征提示（成人）：返回 null = 没事；{ level: "high" | "low", text } */
const VITAL_RULES = {
  bp: (sys, dia) => (sys >= 140 || dia >= 90) ? { level: "high", text: "血压偏高（2 级）" } : (sys >= 130 || dia >= 80) ? { level: "high", text: "血压偏高（1 级）" } : (sys && sys < 90) || (dia && dia < 60) ? { level: "low", text: "血压偏低" } : null,
  hr: v => v > 100 ? { level: "high", text: "心率偏快" } : v && v < 50 ? { level: "low", text: "心率偏慢" } : null,
  spo2: v => v && v < 95 ? { level: "low", text: "血氧偏低" } : null,
  temp_c: v => v >= 38 ? { level: "high", text: "发烧" } : null,
  bmi: v => v >= 30 ? { level: "high", text: "BMI 偏高（肥胖）" } : v >= 25 ? { level: "high", text: "BMI 偏高（超重）" } : v && v < 18.5 ? { level: "low", text: "BMI 偏低" } : null
};

export { VISIT_KINDS, PLACES, MEASURE_KINDS, LAB_GROUPS, LABS, YEARLY_LABS, VITAL_RULES };

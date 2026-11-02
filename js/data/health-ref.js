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

/* 常见化验项目：code → { name, unit, low, high, group }。low / high 为 null = 那一侧没有界限 */
const LAB_GROUPS = { lipid: "血脂", sugar: "血糖", kidney: "肾功能", liver: "肝功能", thyroid: "甲状腺", vitamin: "维生素与铁", cbc: "血常规", other: "其他" };
const LABS = {
  total_chol: { name: "总胆固醇", en: "Total cholesterol", unit: "mg/dL", low: null, high: 200, group: "lipid" },
  ldl:        { name: "低密度脂蛋白 LDL", en: "LDL", unit: "mg/dL", low: null, high: 100, group: "lipid" },
  hdl:        { name: "高密度脂蛋白 HDL", en: "HDL", unit: "mg/dL", low: 40, high: null, group: "lipid" },
  trig:       { name: "甘油三酯", en: "Triglycerides", unit: "mg/dL", low: null, high: 150, group: "lipid" },
  a1c:        { name: "糖化血红蛋白 A1c", en: "Hemoglobin A1c", unit: "%", low: null, high: 5.7, group: "sugar" },
  glucose:    { name: "空腹血糖", en: "Fasting glucose", unit: "mg/dL", low: 70, high: 99, group: "sugar" },
  creatinine: { name: "肌酐", en: "Creatinine", unit: "mg/dL", low: 0.6, high: 1.3, group: "kidney" },
  egfr:       { name: "eGFR", en: "eGFR", unit: "mL/min/1.73m²", low: 60, high: null, group: "kidney" },
  bun:        { name: "尿素氮 BUN", en: "BUN", unit: "mg/dL", low: 7, high: 20, group: "kidney" },
  alt:        { name: "谷丙转氨酶 ALT", en: "ALT", unit: "U/L", low: 7, high: 56, group: "liver" },
  ast:        { name: "谷草转氨酶 AST", en: "AST", unit: "U/L", low: 10, high: 40, group: "liver" },
  tsh:        { name: "促甲状腺激素 TSH", en: "TSH", unit: "mIU/L", low: 0.4, high: 4.0, group: "thyroid" },
  vit_d:      { name: "维生素 D（25-OH）", en: "Vitamin D (25-OH)", unit: "ng/mL", low: 30, high: 100, group: "vitamin" },
  b12:        { name: "维生素 B12", en: "Vitamin B12", unit: "pg/mL", low: 200, high: 900, group: "vitamin" },
  ferritin:   { name: "铁蛋白", en: "Ferritin", unit: "ng/mL", low: 30, high: 400, group: "vitamin" },
  hgb:        { name: "血红蛋白", en: "Hemoglobin", unit: "g/dL", low: 12, high: 17.5, group: "cbc" },
  wbc:        { name: "白细胞", en: "WBC", unit: "K/µL", low: 4.5, high: 11, group: "cbc" },
  plt:        { name: "血小板", en: "Platelets", unit: "K/µL", low: 150, high: 450, group: "cbc" },
  uric:       { name: "尿酸", en: "Uric acid", unit: "mg/dL", low: 3.5, high: 7.2, group: "other" },
  psa:        { name: "PSA", en: "PSA", unit: "ng/mL", low: null, high: 4, group: "other" }
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

export { VISIT_KINDS, MEASURE_KINDS, LAB_GROUPS, LABS, YEARLY_LABS, VITAL_RULES };

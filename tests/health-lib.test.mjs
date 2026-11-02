import test from "node:test";
import assert from "node:assert/strict";
import { ageYears, bmiOf, dueItems, fromShow, labFlag, latest, metricFlag, metricsOf, parseExtract, series, toShow } from "../js/health-lib.js";

test("unit conversion round-trips", () => {
  assert.equal(toShow("weight", 72.5, "us"), 159.8);
  assert.equal(fromShow("weight", 159.8, "us"), 72.48);
  assert.equal(toShow("temp", 37, "us"), 98.6);
  assert.equal(toShow("glucose", 108, "metric"), 6);
  assert.equal(fromShow("length", 70, "us"), 177.8);
});

test("age, bmi, lab flags", () => {
  assert.equal(ageYears("1990-11-03", "2026-11-02"), 35);
  assert.equal(ageYears("1990-11-02", "2026-11-02"), 36);
  assert.equal(bmiOf(72, 175), 23.5);
  assert.equal(labFlag({ value: 162, ref_high: 100 }), "high");
  assert.equal(labFlag({ value: 35, ref_low: 40, ref_high: null }), "low");
  assert.equal(labFlag({ value: 50, ref_low: 40 }), null);
});

const data = {
  visits: [
    { id: "v1", day: "2025-10-01", kind: "annual", vitals: { weight_kg: 74, height_cm: 175, sys: 132, dia: 84 }, follow_up: null },
    { id: "v2", day: "2026-06-10", kind: "regular", provider: "Dr. Lee", vitals: { sys: 128, dia: 82 }, follow_up: "2026-11-10" }
  ],
  labs: [{ day: "2025-10-01", code: "ldl", value: 162, ref_high: 100 }, { day: "2025-10-01", code: "a1c", value: 5.4, ref_high: 5.7 }],
  measures: [{ day: "2026-09-01", kind: "weight", value: 72 }, { day: "2026-10-01", kind: "bp", value: 126, value2: 79 }],
  growth: []
};

test("series merges home, visit and lab sources", () => {
  assert.deepEqual(series("weight", data).map(p => [p.day, p.v, p.src]), [["2025-10-01", 74, "visit"], ["2026-09-01", 72, "home"]]);
  assert.equal(series("bp", data).length, 3);
  assert.deepEqual(series("bmi", data).map(p => p.v), [24.2, 23.5]);
  assert.deepEqual(series("lab:ldl", data).map(p => p.v), [162]);
  const l = latest(series("weight", data)); assert.equal(l.delta, -2);
  assert.deepEqual(metricsOf(data), ["weight", "bmi", "bp", "lab:ldl", "lab:a1c"]);
});

test("flags for adults only, kids get none for bp", () => {
  assert.equal(metricFlag("bp", { v: 132, v2: 84 }, data).text, "血压偏高（1 级）");
  assert.equal(metricFlag("bp", { v: 132, v2: 84 }, data, { kid: true }), null);
  assert.equal(metricFlag("lab:ldl", { day: "2025-10-01", v: 162 }, data).level, "high");
});

test("due items: follow-up, annual, lab recheck", () => {
  const due = dueItems({ data, today: "2026-11-02" });
  const kinds = due.map(x => x.kind + ":" + x.level);
  assert.ok(kinds.includes("followup:soon"));
  assert.ok(kinds.includes("annual:due"));
  assert.ok(kinds.includes("lab:due"), kinds.join());   // LDL high, > 180 days ago
  assert.equal(due.find(x => x.ref === "a1c").level, "soon");   // normal but > 365 days: yearly recheck
  assert.ok(!dueItems({ data, today: "2026-09-01" }).some(x => x.ref === "a1c"));   // normal, < 365 days
  // a later visit closes the follow-up
  const done = dueItems({ data: { ...data, visits: [...data.visits, { id: "v3", day: "2026-11-09", kind: "regular", vitals: {} }] }, today: "2026-11-12" });
  assert.ok(!done.some(x => x.kind === "followup"));
  // kids: no annual / lab nags
  assert.ok(!dueItems({ data, today: "2026-11-02", kid: true }).some(x => x.kind !== "followup"));
});

test("parseExtract normalizes units and lab codes", () => {
  const r = parseExtract('```json\n{"day":"2026-10-02","kind":"annual","vitals":{"weight_lb":160,"temp_f":98.6,"sys":"128"},"advice":"Lose 5%","labs":[{"name":"LDL","value":"150","unit":"mg/dL"},{"name":"Weird","value":"x"}]}\n```');
  assert.equal(r.day, "2026-10-02");
  assert.equal(r.vitals.weight_kg, 72.57);
  assert.equal(r.vitals.temp_c, 37);
  assert.equal(r.vitals.sys, 128);
  assert.equal(r.labs.length, 1);
  assert.equal(r.labs[0].code, "ldl");
  assert.equal(r.labs[0].ref_high, 100);
  assert.equal(parseExtract("not json"), null);
});

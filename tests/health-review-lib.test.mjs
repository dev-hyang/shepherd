import test from "node:test";
import assert from "node:assert/strict";
import { borderline, hasInput, parseReview, recentEvent, reviewInput, REVIEW_SYSTEM, stampOf } from "../js/health-review-lib.js";

const data = {
  visits: [
    { id: "v1", day: "2025-10-01", kind: "annual", vitals: { weight_kg: 86, height_cm: 175, sys: 138, dia: 88 }, advice: "Cut salt.", diagnosis: "" },
    { id: "v2", day: "2026-10-01", kind: "annual", vitals: { weight_kg: 84, height_cm: 175, sys: 132, dia: 84 }, advice: "Lose weight. Recheck cholesterol in 3 months.", diagnosis: "", follow_up: "2027-01-05" }
  ],
  labs: [
    { day: "2025-10-01", code: "ldl", value: 170, unit: "mg/dL", ref_high: 100, visit_id: "v1" },
    { day: "2026-10-01", code: "ldl", value: 162, unit: "mg/dL", ref_high: 100, visit_id: "v2" },
    { day: "2026-10-01", code: "glucose", value: 97, unit: "mg/dL", ref_low: 70, ref_high: 99, visit_id: "v2" },
    { day: "2026-11-05", code: "a1c", value: 5.9, unit: "%", ref_high: 5.7 }
  ],
  measures: [{ day: "2026-11-01", kind: "weight", value: 83 }],
  activity: [{ kind: "workout", day: "2026-11-08", minutes: 40 }, { kind: "meal", day: "2026-11-09", data: { followed: "yes" } }],
  growth: []
};
const opts = { data, profile: { birth: "1980-05-01", sex: "male", conditions: "high blood pressure" }, today: "2026-11-11" };

test("whole: all visits, lab history per test, vitals and activity; no names", () => {
  const x = reviewInput("whole", opts);
  assert.equal(x.age, 46); assert.equal(x.visits.length, 2);
  const ldl = x.labs.find(l => l.test === "LDL cholesterol" || /ldl/i.test(l.test));
  assert.ok(ldl && ldl.results.length === 2 && ldl.results[1].flag === "high");
  assert.ok(x.vitals.bp.length === 2 && x.vitals.weight.length === 3);
  assert.equal(x.activity.last_7_days.workout_minutes, 40);
  assert.ok(!JSON.stringify(x).includes("name\""));
  assert.ok(hasInput("whole", x));
});

test("recent: latest visit with its labs, plus a later lab-only day, each with the previous value", () => {
  const e = recentEvent(data);
  assert.equal(e.visit.id, "v2"); assert.equal(e.laterDay, "2026-11-05"); assert.equal(e.day, "2026-11-05");
  const x = reviewInput("recent", opts);
  const ldl = x.visit_labs.find(l => /ldl/i.test(l.test));
  assert.equal(ldl.value, 162); assert.equal(ldl.previous.value, 170);
  assert.equal(x.later_labs.results.length, 1); assert.equal(x.later_labs.results[0].previous, null);
  assert.equal(hasInput("recent", reviewInput("recent", { ...opts, data: { visits: [], labs: [], measures: [] } })), false);
});

test("watch: out-of-range, near-limit, flagged vitals, due items", () => {
  const x = reviewInput("watch", opts);
  assert.deepEqual(x.out_of_range_labs.map(l => l.results.at(-1).value).sort(), [162, 5.9]);
  assert.equal(x.near_limit_labs.length, 1); assert.equal(x.near_limit_labs[0].position, "near_high");
  assert.ok(x.flagged_vitals.some(v => v.vital === "bp"));
  assert.ok(x.due.some(d => d.kind === "followup"));
  assert.equal(borderline({ value: 85, ref_low: 70, ref_high: 99 }), null);
  assert.equal(borderline({ value: 72, ref_low: 70, ref_high: 99 }), "near_low");
  assert.equal(borderline({ value: 120, ref_low: 70, ref_high: 99 }), null);   // out of range: flagged, not borderline
});

test("kids: growth vitals only, and the prompt avoids diet talk", () => {
  const x = reviewInput("whole", { data: { visits: [], labs: [], measures: [], growth: [{ day: "2026-10-01", weight_kg: 20, height_cm: 110 }] }, kid: true, today: "2026-11-11" });
  assert.deepEqual(Object.keys(x.vitals).sort(), ["height", "weight"]);
  assert.match(REVIEW_SYSTEM("zh", "whole", true), /never mention calories/);
  assert.doesNotMatch(REVIEW_SYSTEM("en", "watch", false), /This is a child/);
});

test("parseReview keeps the shape and drops junk", () => {
  const o = parseReview("```json\n" + JSON.stringify({ summary: "ok", good: ["a", 3, ""], focus: [{ area: "diet", title: "Salt", why: "BP 132/84", action: "< 2 g sodium" }, { area: "bogus", title: "X" }, null],
    eat_less: ["processed meat"], ask: ["1", "2", "3", "4", "5"] }) + "\n```");
  assert.equal(o.summary, "ok"); assert.deepEqual(o.good, ["a"]);
  assert.equal(o.focus.length, 2); assert.equal(o.focus[1].area, "other");
  assert.deepEqual(o.eat_less, ["processed meat"]); assert.equal(o.ask.length, 4); assert.deepEqual(o.sleep, []);
  assert.equal(parseReview("not json"), null); assert.equal(parseReview("{}"), null);
  assert.equal(stampOf(data), 7);
});

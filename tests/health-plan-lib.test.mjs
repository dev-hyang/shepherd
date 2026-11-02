import test from "node:test";
import assert from "node:assert/strict";
import { healthTags, pantryLink, parsePlanAI, recommend, tplOf, weekStats, workoutOn } from "../js/health-plan-lib.js";

const data = {
  visits: [{ id: "v1", day: "2026-10-01", kind: "annual", vitals: { weight_kg: 84, height_cm: 175, sys: 136, dia: 86 }, advice: "Lose weight and cut salt. Recheck cholesterol.", diagnosis: "" }],
  labs: [{ day: "2026-10-01", code: "ldl", value: 162, unit: "mg/dL", ref_high: 100 }, { day: "2026-10-01", code: "a1c", value: 5.9, unit: "%", ref_high: 5.7 }],
  measures: [], growth: []
};

test("tags carry their basis", () => {
  const tags = healthTags({ data });
  for (const k of ["lipid", "sugar", "bp", "weight"]) assert.ok(tags[k], k);
  assert.ok(tags.lipid.some(r => r.vars.name === "ldl" && r.vars.v === 162));
  assert.ok(tags.bp.some(r => /医生提到/.test(r.k)));
  assert.deepEqual(Object.keys(healthTags({ data, kid: true })), ["kid"]);
});

test("recommend ranks matching templates and stays gentle for older adults", () => {
  const r = recommend({ data, today: "2026-11-02" });
  assert.ok(["dash", "med", "lowgi"].includes(r.diets[0].id), r.diets[0].id);
  assert.ok(r.workouts.length >= 1);
  const old = recommend({ data, profile: { birth: "1950-01-01" }, today: "2026-11-02" });
  assert.ok(old.workouts.every(w => !["hiit20", "push", "pull", "legs"].includes(w.id)));
  const empty = recommend({ data: { visits: [], labs: [], measures: [] }, today: "2026-11-02" });
  assert.equal(empty.diets[0].id, "home_light");
  assert.equal(recommend({ data, kid: true }).diets[0].id, "kid_plate");
});

test("week stats and schedule", () => {
  const act = [{ kind: "workout", day: "2026-11-01", minutes: 30 }, { kind: "workout", day: "2026-10-20", minutes: 60 },
    { kind: "meal", day: "2026-11-02", data: { followed: "yes" } }, { kind: "meal", day: "2026-11-02", data: { followed: "partly" } }];
  const w = weekStats({ activity: act, today: "2026-11-02" });
  assert.equal(w.minutes, 30); assert.equal(w.pct, 20); assert.equal(w.mealPct, 75);
  assert.equal(weekStats({ activity: [], today: "2026-11-02", kid: true }).goal, 420);
  assert.equal(workoutOn({ workout: { tpl: "b:starter_a", days: [1, 4] } }, "2026-11-02"), true);   // Monday
  assert.equal(workoutOn({ workout: { tpl: "b:starter_a" } }, "2026-11-03"), false);                  // default days Mon / Thu
});

test("template refs, AI parsing, pantry link", () => {
  assert.equal(tplOf("b:dash", "diet").x.en, "DASH (low sodium)");
  assert.equal(tplOf("c:x1", "workout", [{ id: "x1", kind: "workout", name: "Mine", data: { minutes: 25 } }]).x.minutes, 25);
  assert.equal(tplOf("b:nope", "diet"), null);
  const p = parsePlanAI('{"summary":"ok","diet":"dash","workout":"zzz","tips":["a","b"]}', { diets: ["dash"], workouts: ["walk30"] });
  assert.equal(p.diet, "dash"); assert.equal(p.workout, null); assert.deepEqual(p.tips, ["a", "b"]);
  const u = new URL(pantryLink(["燕麦", "a|b"], "DASH").replace("#/shopping?", "?"));
  assert.equal(u.searchParams.get("add"), "燕麦|a b");
});

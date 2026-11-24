// node --test tests/med-hero-lib.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { moveId, orderBy, medCandidates, howText, heroOn, heroMeds, lastTaken, nextDose } from "../js/med-hero-lib.js";

const med = (o = {}) => ({ id: "m1", kind: "med", active: true, schedule: { days: [0, 1, 2, 3, 4, 5, 6], times: ["08:00", "20:00"] }, meta: {}, ...o });
const NOW = new Date(2026, 10, 24, 12, 0);   // 周二 12:00
const day = "2026-11-24";

test("hero default: meds on, supplements off, explicit flag wins", () => {
  assert.equal(heroOn(med()), true);
  assert.equal(heroOn(med({ kind: "supplement" })), false);
  assert.equal(heroOn(med({ kind: "supplement", meta: { hero: true } })), true);
  assert.equal(heroOn(med({ meta: { hero: false } })), false);
  assert.equal(heroOn({ kind: "prayer" }), false);
});

test("heroMeds skips archived, inactive and switched-off ones", () => {
  const list = [med({ id: "a" }), med({ id: "b", archived: true }), med({ id: "c", active: false }), med({ id: "d", meta: { hero: false } })];
  assert.deepEqual(heroMeds(list).map(p => p.id), ["a"]);
});

test("lastTaken ignores skips and other medicines", () => {
  const logs = [
    { practice_id: "m1", ts: 100, day, data: { slot: "08:00", taken: true } },
    { practice_id: "m1", ts: 300, day, data: { slot: "20:00", taken: false } },
    { practice_id: "m2", ts: 500, day, data: { slot: "08:00", taken: true } }];
  assert.equal(lastTaken(logs, "m1").ts, 100);
  assert.equal(lastTaken([], "m1"), null);
});

test("nextDose: earliest unlogged slot today, overdue when past", () => {
  const n = nextDose(med(), [], NOW);
  assert.equal(n.time, "08:00"); assert.equal(n.overdue, true); assert.equal(n.off, 0);
  const done = [{ practice_id: "m1", day, data: { slot: "08:00", taken: true } }];
  const n2 = nextDose(med(), done, NOW);
  assert.equal(n2.time, "20:00"); assert.equal(n2.overdue, false);
});

test("nextDose rolls to tomorrow once today is done; null without times", () => {
  const done = ["08:00", "20:00"].map(s => ({ practice_id: "m1", day, data: { slot: s, taken: true } }));
  const n = nextDose(med(), done, NOW);
  assert.equal(n.off, 1); assert.equal(n.time, "08:00");
  assert.equal(nextDose(med({ schedule: { times: [] } }), [], NOW), null);
});

test("howText joins timing and note; minutes only for before / after meals", () => {
  const t = (k, v) => k.replace(/\{(\w+)\}/g, (_, n) => v[n]);
  assert.equal(howText({ timing: "饭后", mins: 30, note: "胃不舒服就停" }, t), "饭后 30 分钟 · 胃不舒服就停");
  assert.equal(howText({ timing: "空腹", mins: 30 }, t), "空腹");
  assert.equal(howText({ note: "吃完这盒" }, t), "吃完这盒");
  assert.equal(howText({}, t), "");
  assert.equal(howText(null, t), "");
});

test("orderBy / moveId arrange the cards", () => {
  const a = med({ id: "a" }), b = med({ id: "b" }), c = med({ id: "c" });
  assert.deepEqual(orderBy([a, b, c], ["c", "a"]).map(p => p.id), ["c", "a", "b"]);
  assert.deepEqual(orderBy([a, b, c], undefined).map(p => p.id), ["a", "b", "c"]);
  assert.deepEqual(moveId(["a", "b", "c"], "b", -1), ["b", "a", "c"]);
  assert.deepEqual(moveId(["a", "b", "c"], "a", -1), ["a", "b", "c"]);
  assert.deepEqual(moveId(["a", "b", "c"], "c", 1), ["a", "b", "c"]);
  assert.deepEqual(heroMeds([a, c], ["c"]).map(p => p.id), ["c", "a"]);
  assert.equal(medCandidates([med({ id: "x", meta: { hero: false } }), { id: "y", kind: "prayer" }]).length, 1);
});

test("nextDose respects the weekdays", () => {
  const onlyThu = med({ schedule: { days: [4], times: ["09:00"] } });
  const n = nextDose(onlyThu, [], NOW);   // 周二 → 周四
  assert.equal(n.off, 2); assert.equal(n.day, "2026-11-26");
});

// node --test tests/records-lib.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { nameFor, toTs, dayOfTs, timeOfTs, logLine, filterLogs, groupByDay, recFields, logToDraft, draftToLog, recProblem } from "../js/records-lib.js";

const t = (k, v) => (v ? k.replace(/\{(\w+)\}/g, (_, n) => v[n]) : k);
const exercise = { id: "e", kind: "exercise", name: "" };
const med = { id: "m", kind: "med", name: "阿莫西林" };
const L = (o) => ({ id: "x", practice_id: "e", kind: "exercise", day: "2026-11-24", ts: toTs("2026-11-24", "08:00"), data: {}, ...o });

test("toTs / dayOfTs / timeOfTs round-trip; missing time = noon", () => {
  const ts = toTs("2026-11-24", "07:05");
  assert.equal(dayOfTs(ts), "2026-11-24"); assert.equal(timeOfTs(ts), "07:05");
  assert.equal(timeOfTs(toTs("2026-11-24", "")), "12:00");
});

test("logLine by mode", () => {
  assert.equal(logLine(L({ data: { minutes: 30, type: "走路", note: "公园" } }), exercise, t), "30 分钟 · 走路 · 公园");
  assert.equal(logLine(L({ practice_id: "m", kind: "med", data: { slot: "08:00", taken: true } }), med, t), "服了 08:00");
  assert.equal(logLine(L({ practice_id: "m", kind: "med", data: { slot: "20:00", taken: false } }), med, t), "跳过 20:00");
  assert.equal(logLine(L({ practice_id: null, kind: "scripture", data: { ref: "约 3:16" } }), null, t), "读经 约 3:16");
  assert.equal(logLine(L({ practice_id: null, kind: "prayer", data: {} }), null, t), "做到了");
});

test("filterLogs: practice, window, search, newest first", () => {
  const a = L({ id: "a", ts: toTs("2026-11-24", "08:00"), data: { minutes: 20, note: "晨跑" } });
  const b = L({ id: "b", practice_id: "m", kind: "med", day: "2026-11-20", ts: toTs("2026-11-20", "09:00"), data: { taken: true } });
  const c = L({ id: "c", day: "2026-11-24", ts: toTs("2026-11-24", "18:00"), data: { minutes: 40 } });
  const line = l => logLine(l, l.practice_id === "m" ? med : exercise, t);
  const base = { today: "2026-11-24", line };
  assert.deepEqual(filterLogs([a, b, c], base).map(x => x.id), ["c", "a", "b"]);
  assert.deepEqual(filterLogs([a, b, c], { ...base, pid: "m" }).map(x => x.id), ["b"]);
  assert.deepEqual(filterLogs([a, b, c], { ...base, days: 3 }).map(x => x.id), ["c", "a"]);
  assert.deepEqual(filterLogs([a, b, c], { ...base, q: "晨跑" }).map(x => x.id), ["a"]);
});

test("groupByDay keeps order", () => {
  const g = groupByDay([L({ id: "1" }), L({ id: "2" }), L({ id: "3", day: "2026-11-23" })]);
  assert.deepEqual(g.map(x => [x.day, x.items.length]), [["2026-11-24", 2], ["2026-11-23", 1]]);
});

test("form: draft round-trip keeps untouched data (reading ref)", () => {
  const log = L({ practice_id: null, kind: "scripture", data: { ref: "约 3:16", plan: "p", index: 3, note: "好" } });
  const d = logToDraft(log); d.note = "";
  const out = draftToLog(d, "check", log.data);
  assert.equal(out.data.ref, "约 3:16"); assert.equal(out.data.note, undefined); assert.equal(out.day, "2026-11-24");
});

test("form: slots taken flag and minutes", () => {
  const d = logToDraft(L({ data: { taken: true, slot: "08:00" } }));
  assert.equal(draftToLog({ ...d, taken: "0" }, "slots", {}).data.taken, false);
  assert.equal(draftToLog({ day: "2026-11-24", time: "07:00", minutes: 25, type: "", note: "" }, "minutes", { minutes: 10, type: "跑步" }).data.type, undefined);
  assert.equal(recFields("slots").some(f => f.k === "taken"), true);
});

test("recProblem asks for what the mode needs", () => {
  assert.equal(recProblem({ day: "2026-11-24", minutes: 0 }, "minutes"), "请填分钟数");
  assert.equal(recProblem({ day: "2026-11-24", minutes: 5 }, "minutes"), "");
  assert.equal(recProblem({ day: "" }, "check"), "请选日期");
  assert.equal(recProblem({ day: "d", rating: "" }, "rating"), "请选一个评价");
});

test("count mode (companion / rest presets): what, minutes, fallback", () => {
  const p = { id: "r", kind: "custom", meta: { preset: "rest" } };
  assert.equal(logLine(L({ practice_id: "r", kind: "custom", data: { what: "water" } }), p, t), "喝水");
  assert.equal(logLine(L({ practice_id: "r", kind: "custom", data: { minutes: 20 } }), { id: "k", kind: "custom", meta: { preset: "kid" } }, t), "20 分钟");
  assert.equal(logLine(L({ practice_id: "r", kind: "custom", data: {} }), p, t), "做到了");
  assert.equal(recFields("count", { rest: true }).some(f => f.k === "what"), true);
  assert.equal(recFields("count").some(f => f.k === "what"), false);
  const out = draftToLog({ day: "2026-11-24", time: "09:00", what: "eyes", minutes: null, note: "" }, "count", {});
  assert.equal(out.data.what, "eyes");
});

test("nameFor keeps the name saved at log time even after the practice is renamed", () => {
  const renamed = { ...med, name: "布洛芬" };
  assert.equal(nameFor(L({ practice_id: "m", kind: "med", data: { pname: "泰罗" } }), renamed, t), "泰罗");
  assert.equal(nameFor(L({ practice_id: "m", kind: "med", data: {} }), renamed, t), "布洛芬");
});

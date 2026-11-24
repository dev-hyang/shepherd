// node --test tests/hero-presets-lib.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { cardId, keyOf, practiceOf, practiceFor, presetOn, lastTs, logData, whatLabel, shownCards, allCards, presetPractice, PRESETS } from "../js/hero-presets-lib.js";

const custom = (key, id = key) => ({ id, kind: "custom", name: key, meta: { preset: key } });
const med = (id, o = {}) => ({ id, kind: "med", active: true, meta: {}, ...o });

test("card ids", () => { assert.equal(cardId("rest"), "preset:rest"); assert.equal(keyOf("preset:rest"), "rest"); assert.equal(keyOf("abc"), ""); });

test("practiceOf / practiceFor", () => {
  const ps = [custom("spouse"), { id: "s", kind: "scripture" }, { id: "x", kind: "exercise", archived: true }];
  assert.equal(practiceOf(ps, "spouse").id, "spouse");
  assert.equal(practiceOf(ps, "kid"), null);
  assert.equal(practiceFor(ps, "faith", { k: "scripture" }).id, "s");
  assert.equal(practiceFor(ps, "faith", { k: "prayer" }), null);
  assert.equal(practiceFor(ps, "exercise"), null);   // archived
});

test("presetOn: explicit setting wins; faith / exercise default on when the habit exists; others default off", () => {
  const ps = [{ id: "s", kind: "scripture" }, custom("rest")];
  assert.equal(presetOn("faith", {}, ps), true);
  assert.equal(presetOn("faith", { heroPresets: { faith: false } }, ps), false);
  assert.equal(presetOn("exercise", {}, ps), false);
  assert.equal(presetOn("rest", {}, ps), false);
  assert.equal(presetOn("rest", { heroPresets: { rest: true } }, ps), true);
});

test("lastTs: by kind for faith, by practice (and item) for rest", () => {
  const ps = [custom("rest", "r"), custom("kid", "k")];
  const logs = [{ kind: "scripture", ts: 5 }, { kind: "scripture", ts: 9 }, { kind: "prayer", ts: 3 },
    { practice_id: "r", kind: "custom", ts: 20, data: { what: "water" } }, { practice_id: "r", kind: "custom", ts: 30, data: { what: "eyes" } }, { practice_id: "k", kind: "custom", ts: 7, data: {} }];
  assert.equal(lastTs(logs, ps, "faith", { k: "scripture" }), 9);
  assert.equal(lastTs(logs, ps, "faith", { k: "prayer" }), 3);
  assert.equal(lastTs(logs, ps, "rest", { k: "water" }), 20);
  assert.equal(lastTs(logs, ps, "rest", { k: "wc" }), null);
  assert.equal(lastTs(logs, ps, "kid", { k: "kid" }), 7);
  assert.equal(lastTs(logs, [], "kid", { k: "kid" }), null);
});

test("logData and whatLabel", () => {
  assert.deepEqual(logData("rest", { k: "eyes" }), { what: "eyes" });
  assert.deepEqual(logData("kid", { k: "kid" }), {});
  assert.equal(whatLabel("wc"), "上厕所"); assert.equal(whatLabel("zzz"), "");
});

test("shownCards: meds first then presets; saved order wins; hidden ones drop out", () => {
  const ps = [med("m1"), med("m2", { meta: { hero: false } }), { id: "s", kind: "scripture" }];
  assert.deepEqual(shownCards(ps, {}).map(c => c.id), ["m1", "preset:faith"]);
  assert.deepEqual(shownCards(ps, { heroOrder: ["preset:faith", "m1"] }).map(c => c.id), ["preset:faith", "m1"]);
  assert.deepEqual(shownCards(ps, { heroPresets: { faith: false } }).map(c => c.id), ["m1"]);
});

test("allCards lists everything with on flags", () => {
  const all = allCards([med("m1", { meta: { hero: false } })], {});
  assert.equal(all.length, 1 + Object.keys(PRESETS).length);
  assert.equal(all.find(c => c.id === "m1").on, false);
  assert.equal(all.every(c => c.type === "med" || c.on === false), true);
});

test("presetPractice is a custom habit tagged with its preset", () => {
  const p = presetPractice("spouse");
  assert.equal(p.kind, "custom"); assert.equal(p.meta.preset, "spouse"); assert.equal(p.name, "陪伴妻子");
});

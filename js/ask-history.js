import { LS_PREFIX } from "./core/config.js";
import { t } from "./core/i18n.js";
import { esc } from "./core/util.js";
import { mdToHtml } from "./markdown.js";
import { chipBtn, secHead } from "./ui.js";

/* ============ 咩咩咩的历史问答（只存在这台设备的 localStorage，最多 30 条）============
   今天页上默认全部折叠（刚问完的那条展开）；每条可以追问（下一次发送带上这一轮的问和答）、复制、删除。 */
const KEY = LS_PREFIX + ".askhist", MAX = 30;
const loadHist = () => { try { const a = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const saveHist = list => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch (e) {} };
const dayOf = ts => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; };
function histHTML(list, freshId){
  if (!list.length) return "";
  const btn = (tone, act, id, label) => `<button type="button" class="ui-btn" data-size="sm" data-tone="${tone}" data-act="${act}" data-id="${esc(id)}">${label}</button>`;
  const row = h => `<details class="ask-h" ${h.id === freshId ? "open" : ""}><summary><span class="aq">${esc(h.q)}</span><small>${dayOf(h.ts)}</small></summary>
    <div class="md">${mdToHtml(h.a)}</div>
    <div class="ui-acts btns">${btn("primary", "ask-follow", h.id, t("追问"))}${btn("ghost", "ask-copy-answer", h.id, t("复制"))}${btn("ghost", "ask-hdel", h.id, t("删除"))}</div></details>`;
  return `${secHead(t("问过的"), chipBtn(t("清空"), 'data-act="ask-hclear"'))}<div class="panel ask-hist">${list.map(row).join("")}</div>`;
}
export { loadHist, saveHist, histHTML, MAX };

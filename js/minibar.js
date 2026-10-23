/* ============ 滚动后固定在顶部的窄条：标题 + 路径 ============
   顶栏（标题、切换按钮、同步状态）只在页面最上面；往下滚出屏幕后，这条窄条固定在屏幕顶端：
   子页面先放「‹ 返回」路径，再放标题；点标题回到顶部。
   它是单独的一层（position: fixed），不占页面位置，出现和消失都不会让内容跳动。
   四个姐妹应用各放一份同样的文件；每次 render 之后调一次 updateMiniBar(标题, 路径 HTML)。 */
let bar = null;

function ensureBar() {
  if (bar) return bar;
  bar = document.createElement("div");
  bar.id = "minibar"; bar.className = "minibar";
  bar.setAttribute("aria-hidden", "true");   // 顶栏不在屏幕上时才显示；平时屏幕阅读器读顶栏本身，不重复读
  document.body.appendChild(bar);
  bar.addEventListener("click", (e) => {
    if (!e.target.closest(".mb-title")) return;
    const calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" });
  });
  // 顶栏完全滚出屏幕才显示窄条（用滚动事件算，不依赖 IntersectionObserver：它在后台标签页、部分内嵌环境里回调会延迟）
  const header = document.querySelector("header.top");
  if (header) {
    const sync = () => {
      const show = header.getBoundingClientRect().bottom <= 0;
      bar.classList.toggle("show", show); bar.setAttribute("aria-hidden", String(!show));
    };
    window.addEventListener("scroll", sync, { passive: true }); window.addEventListener("resize", sync); sync();   // 滚动事件本来就按帧节流，这里只读一次位置、切一个 class
  }
  return bar;
}

/** title：纯文本；pathHTML：已经转义好的路径按钮 HTML（没有就留空）；tip：标题按钮的提示文字 */
export function updateMiniBar(title, pathHTML = "", tip = "回到顶部") {
  const b = ensureBar();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  b.innerHTML = `<div class="in">${pathHTML}<button type="button" class="mb-title" title="${esc(tip)}">${esc(title)}</button></div>`;
}

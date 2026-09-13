// common.js — 公共工具
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch (e) { /* 非JSON */ }
  if (!res.ok) throw new Error((data && data.error) || ('请求失败 ' + res.status));
  return data;
}
function post(url, body) {
  return api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function qs(name) { return new URLSearchParams(location.search).get(name); }

// ---- 字号调节（长辈友好）----
function applyFontSize() {
  const v = localStorage.getItem('ms-fontsize') || '';
  document.body.classList.remove('fs-large', 'fs-xlarge');
  if (v) document.body.classList.add(v);
}
function setFontSize(v) {
  localStorage.setItem('ms-fontsize', v);
  applyFontSize();
}
applyFontSize();

// ---- 站点骨架 ----
function renderShell(active) {
  const navItems = [
    ['/', '首页', 'home'],
    ['/map.html', '迁徙地图', 'map'],
    ['/timeline.html', '岁月时间线', 'timeline'],
    ['/submit.html', '补充资料', 'submit'],
  ];
  document.body.insertAdjacentHTML('afterbegin', `
    <div class="topbar"><div class="topbar-inner">
      <div class="site-title">🏡 <a href="/">乡村迁徙记忆站</a></div>
      <nav class="nav">
        ${navItems.map(([href, label, key]) =>
          `<a href="${href}" class="${active === key ? 'active' : ''}">${label}</a>`).join('')}
        <span class="font-ctrl" title="调整字号">
          <button onclick="setFontSize('')" aria-label="标准字号">A</button>
          <button onclick="setFontSize('fs-large')" aria-label="大字号">A+</button>
          <button onclick="setFontSize('fs-xlarge')" aria-label="特大字号">A++</button>
        </span>
      </nav>
    </div></div>`);
  document.body.insertAdjacentHTML('beforeend', `
    <div class="footer">
      本站由家族后人共同维护 · 资料持续征集中 ·
      <a href="/submit.html">我要补充资料</a> ·
      <a href="/admin">管理员入口</a>
    </div>
    <div class="lightbox" id="lightbox" onclick="this.classList.remove('show')">
      <img id="lightbox-img" alt="照片放大查看"><div class="cap" id="lightbox-cap"></div>
    </div>`);
}
function showPhoto(src, cap) {
  $('#lightbox-img').src = src;
  $('#lightbox-cap').textContent = cap || '';
  $('#lightbox').classList.add('show');
}
function toast(msg, ok = true) {
  const el = document.createElement('div');
  el.className = 'notice ' + (ok ? 'ok' : 'err');
  el.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:2000;box-shadow:0 4px 16px rgba(0,0,0,.2);max-width:90vw';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

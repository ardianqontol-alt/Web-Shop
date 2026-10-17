'use strict';
/* ============ Helpers ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const fdate = (t) => new Date(t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

const TIERS = {
  mythic: { name: 'Mythic', icon: '🔥', color: '#ff2d6f', desc: 'ID paling langka & elit' },
  legendary: { name: 'Legendary', icon: '👑', color: '#ffb800', desc: 'ID sultan, angka sakral' },
  epic: { name: 'Epic', icon: '💜', color: '#a855f7', desc: 'ID cantik pilihan' },
  rare: { name: 'Rare', icon: '💎', color: '#3b82f6', desc: 'ID unik harga bersahabat' },
  unik: { name: 'Unik', icon: '✨', color: '#10d9a0', desc: 'ID berbeda, harga hemat' },
};
const TIER_KEYS = Object.keys(TIERS);
const tierTag = (k) => { const t = TIERS[k] || TIERS.unik; return `<span class="tag" style="--c:${t.color}">${t.icon} ${t.name}</span>`; };

let token = localStorage.getItem('ys_token') || '';
let me = null;
let config = { contact: 'https://t.me/yanzstoru', deposit_info: '' };
let broadcasts = [];
let knownMax = 0;
const productCache = {};

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  const r = await fetch('/api/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && token && !path.startsWith('auth/')) { logoutLocal(); }
    throw Object.assign(new Error(d.error || 'Terjadi kesalahan'), { status: r.status });
  }
  return d;
}
async function downloadFile(path, fallback) {
  const r = await fetch('/api/' + path, { headers: { authorization: 'Bearer ' + token } });
  if (!r.ok) { const d = await r.json().catch(() => ({})); return toast(d.error || 'Gagal mengunduh file', 'err'); }
  const cd = r.headers.get('content-disposition') || '';
  const name = (cd.match(/filename="([^"]+)"/) || [])[1] || fallback || 'akun.txt';
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  toast('File akun diunduh ✔');
}

function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 450); }, 3600);
}

/* ============ Modal ============ */
function openM(id) { $('#' + id).classList.add('open'); document.body.classList.add('noscroll'); }
function closeM(id) {
  const m = $('#' + id);
  m.classList.remove('open');
  if (id === 'm-tutorial') { const v = $('#tutVideo'); v.pause(); }
  if (!$('.modal.open')) document.body.classList.remove('noscroll');
}
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-close]');
  if (c) { const m = c.closest('.modal'); if (m) closeM(m.id); return; }
  if (e.target.classList.contains('modal')) closeM(e.target.id);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = $$('.modal.open'); if (open.length) closeM(open[open.length - 1].id);
  closeDrawer();
});

/* ============ Animasi: reveal, ripple, scroll ============ */
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.1 });
function reveal(root = document) {
  $$('.reveal:not(.in)', root).forEach((el, i) => { if (!el.style.getPropertyValue('--d')) el.style.setProperty('--d', (i % 9) * 55 + 'ms'); io.observe(el); });
}
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.btn,.tier-card,.chip-b,.icon-btn');
  if (!b) return;
  const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height);
  const s = document.createElement('span');
  s.className = 'ripple';
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
  b.appendChild(s); setTimeout(() => s.remove(), 700);
});
window.addEventListener('scroll', () => {
  const h = document.documentElement;
  $('#progress').style.width = (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)) * 100 + '%';
  $('#top').classList.toggle('solid', h.scrollTop > 8);
}, { passive: true });
function countUp(el, to) {
  const t0 = performance.now(), dur = 900;
  const step = (t) => { const p = Math.min(1, (t - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString('id-ID'); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* ============ Auth ============ */
let authMode = 'login';
function setAuthMode(m) {
  authMode = m;
  $$('#m-auth [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === m));
  $('#phoneRow').hidden = m !== 'register';
  $('#authSubmit').textContent = m === 'login' ? 'Masuk' : 'Buat Akun';
  $('#authForm [name=password]').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('#authErr').textContent = '';
}
function openAuth(m = 'login') { setAuthMode(m); openM('m-auth'); setTimeout(() => $('#authForm [name=username]').focus(), 150); }
$('#loginBtn').onclick = () => openAuth('login');
$('#regBtn').onclick = () => openAuth('register');
$$('#m-auth [data-tab]').forEach((b) => (b.onclick = () => setAuthMode(b.dataset.tab)));
$('#authForm').onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), btn = $('#authSubmit');
  btn.disabled = true; btn.classList.add('loading'); $('#authErr').textContent = '';
  try {
    const r = await api('auth/' + authMode, { method: 'POST', body: { username: f.get('username'), password: f.get('password'), phone: f.get('phone') } });
    token = r.token; me = r.user; localStorage.setItem('ys_token', token);
    closeM('m-auth'); e.target.reset(); updateHeader();
    toast(authMode === 'login' ? `Selamat datang, ${me.username}! 👋` : 'Akun berhasil dibuat 🎉');
    route();
  } catch (er) { $('#authErr').textContent = er.message; }
  btn.disabled = false; btn.classList.remove('loading');
};
function logoutLocal() { token = ''; me = null; localStorage.removeItem('ys_token'); updateHeader(); }
async function logout() { try { await api('auth/logout', { method: 'POST' }); } catch {} logoutLocal(); toast('Kamu sudah keluar'); location.hash = '#/home'; route(); }
function updateHeader() {
  $('#loginBtn').hidden = $('#regBtn').hidden = !!me;
  $('#balChip').hidden = !me;
  $('#navAdmin').hidden = !(me && me.role === 'admin');
  if (me) $('#balVal').textContent = rp(me.balance);
}
async function refreshMe() { try { me = (await api('me')).user; updateHeader(); } catch {} }

/* ============ Notifikasi ============ */
function unreadCount() { const seen = +localStorage.getItem('ys_seen') || 0; return broadcasts.filter((b) => b.id > seen).length; }
function updateBell() { const n = unreadCount(); $('#bellBadge').hidden = !n; $('#bellBadge').textContent = n > 9 ? '9+' : n; }
async function loadBroadcasts() {
  try {
    const r = await api('broadcasts');
    broadcasts = r.broadcasts;
    const max = broadcasts.length ? broadcasts[0].id : 0;
    if (knownMax && max > knownMax) { toast('📣 ' + broadcasts[0].title, 'warn'); $('#bellBtn').classList.remove('ring'); void $('#bellBtn').offsetWidth; $('#bellBtn').classList.add('ring'); }
    knownMax = max; updateBell();
    if ($('#drawer').classList.contains('open')) renderNotifs();
  } catch {}
}
function renderNotifs() {
  const seen = +localStorage.getItem('ys_seen') || 0;
  $('#notifList').innerHTML = broadcasts.length
    ? broadcasts.map((b, i) => `<div class="notif ${b.id > seen ? 'new' : ''}" style="animation-delay:${i * 50}ms"><b>${esc(b.title)}</b><p>${esc(b.message)}</p><small>${fdate(b.created_at)}</small></div>`).join('')
    : '<div class="empty">Belum ada pengumuman.</div>';
}
function openDrawer() { renderNotifs(); $('#drawer').classList.add('open'); $('#drawerBg').classList.add('open'); if (broadcasts.length) localStorage.setItem('ys_seen', broadcasts[0].id); updateBell(); }
function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawerBg').classList.remove('open'); }
$('#bellBtn').onclick = openDrawer; $('#drawerClose').onclick = closeDrawer; $('#drawerBg').onclick = closeDrawer;

/* ============ Router ============ */
const PAGES = ['home', 'shop', 'history', 'deposit', 'contact', 'profile', 'admin'];
const NEED_LOGIN = ['history', 'deposit', 'profile', 'admin'];
function parseHash() {
  const [p, qs] = location.hash.replace(/^#\/?/, '').split('?');
  return { page: PAGES.includes(p) ? p : 'home', params: new URLSearchParams(qs || '') };
}
function route() {
  const { page, params } = parseHash();
  if (NEED_LOGIN.includes(page) && !me) { openAuth('login'); toast('Masuk dulu ya 🙂', 'warn'); if (location.hash !== '#/home') location.hash = '#/home'; return; }
  if (page === 'admin' && me.role !== 'admin') { location.hash = '#/home'; return; }
  $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'p-' + page));
  $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === page));
  window.scrollTo({ top: 0 });
  ({ home: renderHome, shop: () => renderShop(params), history: renderHistory, deposit: renderDeposit, contact: renderContact, profile: renderProfile, admin: renderAdmin })[page]();
  reveal();
}
window.addEventListener('hashchange', route);

/* ============ Kartu produk ============ */
function accCard(p) {
  productCache[p.id] = p;
  const t = TIERS[p.tier] || TIERS.unik;
  return `<article class="acc reveal" style="--c:${t.color}">
    <div class="acc-top"><span class="tag" style="--c:${t.color}">${t.icon} ${t.name}</span><span class="id-no">#${p.id}</span></div>
    <div class="acc-id">${esc(p.game_id)}</div>
    <div class="acc-title">${esc(p.title || 'ID Cantik ' + t.name)}</div>
    <p class="acc-desc">${esc(p.description || 'Akun siap pakai. File akun bisa langsung diunduh setelah pembelian.')}</p>
    <div class="acc-bot"><b class="price">${rp(p.price)}</b><button class="btn primary sm" data-buy="${p.id}">🛒 Beli</button></div>
  </article>`;
}
const emptyBox = (t) => `<div class="empty"><span class="big-ico">🔍</span>${t}</div>`;
document.addEventListener('click', (e) => { const b = e.target.closest('[data-buy]'); if (b) startBuy(+b.dataset.buy); });

/* ============ Beranda ============ */
async function renderHome() {
  const grid = $('#tierGrid');
  try {
    const s = await api('stats');
    const by = {}; s.tiers.forEach((t) => (by[t.tier] = t));
    const stock = s.tiers.reduce((a, t) => a + t.c, 0);
    $('#homeStats').innerHTML = `<div class="stat"><b data-n="${stock}">0</b><span>Stok ID</span></div><div class="stat"><b data-n="${s.sold}">0</b><span>Terjual</span></div><div class="stat"><b data-n="${s.users}">0</b><span>Member</span></div>`;
    $$('#homeStats [data-n]').forEach((el) => countUp(el, +el.dataset.n));
    grid.innerHTML = TIER_KEYS.map((k) => {
      const t = TIERS[k], d = by[k];
      return `<a class="tier-card reveal" style="--c:${t.color}" href="#/shop?tier=${k}"><span class="ico">${t.icon}</span><h3>${t.name}</h3><p>${t.desc}</p><div class="cnt"><span><b>${d ? d.c : 0}</b> tersedia</span><span>${d ? 'mulai ' + rp(d.minp) : 'kosong'}</span></div></a>`;
    }).join('');
  } catch { grid.innerHTML = emptyBox('Gagal memuat data.'); }
  try {
    const r = await api('products?sort=new');
    $('#homeLatest').innerHTML = r.products.length ? r.products.slice(0, 6).map(accCard).join('') : emptyBox('Belum ada stok ID. Cek lagi nanti ya!');
  } catch {}
  reveal();
}
$('#homeSearch').onsubmit = (e) => { e.preventDefault(); location.hash = '#/shop?q=' + encodeURIComponent($('#homeQ').value.trim()); };

/* ============ Katalog ============ */
const shopHash = (o) => '#/shop?' + new URLSearchParams(Object.fromEntries(Object.entries(o).filter(([, v]) => v))).toString();
let shopState = { tier: '', q: '', sort: 'low' };
function renderShop(params) {
  shopState = { tier: params.get('tier') || '', q: params.get('q') || '', sort: params.get('sort') || 'low' };
  $('#shopQ').value = shopState.q; $('#shopSort').value = shopState.sort;
  $('#tierChips').innerHTML = `<button class="chip-b ${!shopState.tier ? 'on' : ''}" data-tier="">Semua</button>` +
    TIER_KEYS.map((k) => `<button class="chip-b ${shopState.tier === k ? 'on' : ''}" style="--c:${TIERS[k].color}" data-tier="${k}">${TIERS[k].icon} ${TIERS[k].name}</button>`).join('');
  loadShop();
}
async function loadShop() {
  const g = $('#shopGrid');
  g.innerHTML = '<div class="skeleton"></div>'.repeat(4);
  try {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(shopState).filter(([, v]) => v))).toString();
    const r = await api('products?' + qs);
    g.innerHTML = r.products.length ? r.products.map(accCard).join('') : emptyBox(shopState.q ? `ID “${esc(shopState.q)}” tidak ditemukan.` : 'Belum ada stok di tingkat ini.');
  } catch (e) { g.innerHTML = emptyBox(esc(e.message)); }
  reveal(g);
}
$('#tierChips').onclick = (e) => { const b = e.target.closest('[data-tier]'); if (b) location.hash = shopHash({ ...shopState, tier: b.dataset.tier }); };
$('#shopSearch').onsubmit = (e) => { e.preventDefault(); location.hash = shopHash({ ...shopState, q: $('#shopQ').value.trim() }); };
$('#shopSort').onchange = (e) => { location.hash = shopHash({ ...shopState, sort: e.target.value === 'low' ? '' : e.target.value }); };

/* ============ Alur pembelian ============ */
let pending = null;
async function startBuy(id) {
  if (!me) { openAuth('login'); toast('Masuk dulu untuk membeli', 'warn'); return; }
  const p = productCache[id]; if (!p) return;
  pending = { p, v: null, vtext: localStorage.getItem('ys_voucher') || '' };
  renderConfirm(); openM('m-confirm');
  if (pending.vtext) applyVoucher(pending.vtext, true);
}
async function applyVoucher(code, silent) {
  if (!pending) return;
  code = String(code || '').trim();
  if (!code) { pending.v = null; renderConfirm(); return; }
  try {
    const r = await api('voucher/check', { method: 'POST', body: { code, price: pending.p.price } });
    pending.v = r; pending.vtext = r.code; renderConfirm();
    if (!silent) toast('Voucher berhasil dipakai 🎁');
  } catch (e) {
    pending.v = null; pending.vtext = code; renderConfirm();
    $('#vMsg').style.color = 'var(--bad)'; $('#vMsg').textContent = '⚠️ ' + e.message;
  }
}
function renderConfirm() {
  const { p, v } = pending, t = TIERS[p.tier] || TIERS.unik;
  const disc = v ? v.discount : 0, total = Math.max(0, p.price - disc), enough = me.balance >= total;
  $('#confirmBox').innerHTML = `
    <button class="mx" data-close aria-label="Tutup">✕</button>
    <div style="text-align:center"><div class="qmark">❓</div><h3>Apakah Anda yakin ingin membeli?</h3></div>
    <div class="acc mini" style="--c:${t.color}"><div class="acc-top">${tierTag(p.tier)}<span class="id-no">#${p.id}</span></div><div class="acc-id">${esc(p.game_id)}</div><div class="acc-title">${esc(p.title || 'ID Cantik ' + t.name)}</div></div>
    <label>Kode voucher (opsional)<div class="vrow"><input id="vInput" value="${esc(pending.vtext)}" placeholder="Masukkan kode voucher" autocomplete="off"><button class="btn sm" id="vApply" type="button">Pakai</button></div></label>
    <p class="vmsg" id="vMsg">${v ? `✅ Voucher ${esc(v.code)} aktif: -${rp(v.discount)}` : ''}</p>
    <div class="sum"><div><span>Harga</span><span>${rp(p.price)}</span></div><div><span>Diskon</span><span>- ${rp(disc)}</span></div><div class="t"><span>Total bayar</span><span>${rp(total)}</span></div><div><span>Saldo kamu</span><span>${rp(me.balance)}</span></div></div>
    ${enough ? '' : `<p class="err">Saldo kurang ${rp(total - me.balance)}. Isi saldo dulu ya.</p>`}
    <div class="btn-row"><button class="btn" data-close>Batal</button>${enough ? '<button class="btn primary" id="buyYes">Ya, Beli Sekarang</button>' : '<a class="btn primary" href="#/deposit" data-close>Isi Saldo</a>'}</div>`;
}
$('#confirmBox').addEventListener('click', (e) => {
  if (e.target.closest('#vApply')) applyVoucher($('#vInput').value);
  if (e.target.closest('#buyYes')) doBuy();
});
$('#confirmBox').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'vInput') { e.preventDefault(); applyVoucher(e.target.value); } });
async function doBuy() {
  const btn = $('#buyYes'); btn.disabled = true; btn.classList.add('loading'); btn.firstChild.textContent = 'Memproses pembayaran… ';
  try {
    const [r] = await Promise.all([api('buy', { method: 'POST', body: { product_id: pending.p.id, voucher: pending.v ? pending.v.code : undefined } }), new Promise((ok) => setTimeout(ok, 900))]);
    me.balance = r.balance; updateHeader();
    if (pending.v) localStorage.removeItem('ys_voucher');
    closeM('m-confirm'); showSuccess(r.order);
    if (parseHash().page === 'shop') loadShop();
  } catch (e) {
    toast(e.message, 'err');
    if (e.status === 409) { closeM('m-confirm'); const pg = parseHash().page; if (pg === 'shop') loadShop(); if (pg === 'home') renderHome(); }
    else { renderConfirm(); }
  }
}
function showSuccess(o) {
  const cols = ['#7c5cff', '#00d4ff', '#22e3a1', '#ffb800', '#ff2d6f'];
  const conf = Array.from({ length: 26 }, () => `<i style="left:${Math.random() * 100}%;background:${cols[(Math.random() * 5) | 0]};animation-delay:${Math.random() * 0.6}s;animation-duration:${1.6 + Math.random()}s"></i>`).join('');
  $('#successBox').innerHTML = `<div class="confetti">${conf}</div>
    <svg class="check" viewBox="0 0 100 100"><circle cx="50" cy="50" r="41"/><path d="M31 52l14 14 25-29"/></svg>
    <h3>Akun Berhasil Dibeli! 🎉</h3>
    <p style="color:var(--mut);font-size:.9rem">Pembayaran sukses. Simpan file akun kamu dengan baik.</p>
    <div class="acc mini" style="--c:${(TIERS[o.tier] || TIERS.unik).color}"><div class="acc-top">${tierTag(o.tier)}<span class="id-no">Order #${o.id}</span></div><div class="acc-id">${esc(o.game_id)}</div><div class="acc-title">Total dibayar ${rp(o.total)}</div></div>
    <div class="stack"><button class="btn primary block" data-dl="${o.id}">⬇️ Download File Akun</button><button class="btn block" data-tut>▶️ Tutorial Login ke FF</button><button class="btn block" data-close>Tutup</button></div>`;
  openM('m-success');
}
document.addEventListener('click', (e) => {
  const d = e.target.closest('[data-dl]'); if (d) downloadFile(`orders/${d.dataset.dl}/download`, 'akun.txt');
  if (e.target.closest('[data-tut]')) openTutorial();
});

/* ============ Tutorial video ============ */
function openTutorial() {
  const v = $('#tutVideo'), box = $('#tutBox .vid');
  if (!v.getAttribute('src')) { v.src = 'media/tutorial.mp4'; v.addEventListener('error', () => box.classList.add('novideo')); }
  else box.classList.remove('novideo');
  v.currentTime = 0; openM('m-tutorial'); v.play().catch(() => {});
}
$('#tutClose').onclick = () => closeM('m-tutorial');

/* ============ Riwayat ============ */
async function renderHistory() {
  const box = $('#v-history');
  box.innerHTML = '<h1 class="ptitle">Riwayat Pembelian</h1><div class="card"><div class="skeleton"></div></div>';
  try {
    const { orders } = await api('orders');
    box.innerHTML = '<h1 class="ptitle">Riwayat Pembelian</h1>' + (orders.length
      ? `<div class="card">${orders.map((o) => `<div class="li reveal"><div><div>${tierTag(o.tier)} <b style="margin-left:6px">${esc(o.game_id)}</b></div><div class="meta">Order #${o.id} · ${fdate(o.created_at)} · Dibayar ${rp(o.total)}${o.voucher ? ' · Voucher ' + esc(o.voucher) : ''}</div></div><div class="acts"><button class="btn sm primary" data-dl="${o.id}">⬇️ File Akun</button><button class="btn sm" data-tut>▶️ Tutorial</button></div></div>`).join('')}</div>`
      : `<div class="card">${emptyBox('Belum ada pembelian. <br><a class="btn primary sm" style="margin-top:12px" href="#/shop">Belanja sekarang</a>')}</div>`);
  } catch (e) { box.innerHTML += `<p class="err">${esc(e.message)}</p>`; }
  reveal(box);
}

/* ============ Deposit ============ */
async function renderDeposit() {
  const box = $('#v-deposit');
  const saved = localStorage.getItem('ys_voucher') || '';
  box.innerHTML = `<h1 class="ptitle">Deposit / Isi Saldo</h1>
  <div class="two">
    <div class="card reveal"><h3>💰 Isi Saldo</h3>
      <p style="color:var(--mut);font-size:.88rem;margin-bottom:10px">Saldo kamu saat ini: <b style="color:#fff">${rp(me.balance)}</b></p>
      <div class="info-box">${esc(config.deposit_info || 'Hubungi admin untuk info pembayaran.')}</div>
      <form id="depForm">
        <label>Nominal (Rp)<input name="amount" id="depAmount" type="number" min="10000" step="1000" required placeholder="min. 10.000"></label>
        <div class="quick">${[10000, 25000, 50000, 100000, 250000].map((n) => `<button type="button" class="chip-b" data-amt="${n}">${rp(n)}</button>`).join('')}</div>
        <label>Metode<select name="method" style="width:100%"><option>DANA</option><option>OVO</option><option>GoPay</option><option>ShopeePay</option><option>QRIS</option><option>Transfer Bank</option></select></label>
        <label>Catatan / nama pengirim<input name="note" maxlength="200" placeholder="contoh: a.n Budi, jam 14.20"></label>
        <button class="btn primary block">Kirim Permintaan Deposit</button>
      </form>
      <a class="btn block" style="margin-top:10px" href="${esc(config.contact)}" target="_blank" rel="noopener">💬 Konfirmasi ke Admin (Telegram)</a>
    </div>
    <div>
      <div class="card reveal"><h3>🎟️ Kode Voucher</h3>
        <p style="color:var(--mut);font-size:.86rem;margin-bottom:10px">Simpan kode voucher, otomatis dipakai saat checkout untuk potongan harga.</p>
        <form id="vForm" class="vrow"><input id="vSave" value="${esc(saved)}" placeholder="Masukkan kode voucher" autocomplete="off"><button class="btn sm primary">Simpan</button></form>
        <p class="vmsg" id="vSaveMsg">${saved ? '✅ Tersimpan: ' + esc(saved) : ''}</p>
      </div>
      <div class="card reveal"><h3>📜 Riwayat Deposit</h3><div id="depList"><div class="skeleton" style="height:90px"></div></div></div>
    </div>
  </div>`;
  $('#depForm').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target), b = e.target.querySelector('.btn.primary');
    b.disabled = true; b.classList.add('loading');
    try { await api('deposits', { method: 'POST', body: { amount: f.get('amount'), method: f.get('method'), note: f.get('note') } }); toast('Permintaan deposit terkirim. Tunggu konfirmasi admin ✔'); e.target.reset(); loadDeposits(); }
    catch (er) { toast(er.message, 'err'); }
    b.disabled = false; b.classList.remove('loading');
  };
  $('.quick', box).onclick = (e) => { const b = e.target.closest('[data-amt]'); if (b) $('#depAmount').value = b.dataset.amt; };
  $('#vForm').onsubmit = async (e) => {
    e.preventDefault(); const code = $('#vSave').value.trim();
    if (!code) { localStorage.removeItem('ys_voucher'); $('#vSaveMsg').textContent = 'Voucher dihapus.'; return; }
    try { const r = await api('voucher/check', { method: 'POST', body: { code, price: 0 } }); localStorage.setItem('ys_voucher', r.code); $('#vSaveMsg').style.color = 'var(--ok)'; $('#vSaveMsg').textContent = `✅ Voucher ${r.code} tersimpan (${r.type === 'percent' ? r.value + '%' : rp(r.value)}). Dipakai otomatis saat membeli.`; }
    catch (er) { $('#vSaveMsg').style.color = 'var(--bad)'; $('#vSaveMsg').textContent = '⚠️ ' + er.message; }
  };
  loadDeposits(); reveal(box);
}
const stLabel = { pending: 'Menunggu', approved: 'Berhasil', rejected: 'Ditolak', available: 'Tersedia', sold: 'Terjual' };
async function loadDeposits() {
  try {
    const { deposits } = await api('deposits');
    $('#depList').innerHTML = deposits.length ? deposits.map((d) => `<div class="li"><div><b>${rp(d.amount)}</b> <span class="meta">· ${esc(d.method)}</span><div class="meta">${fdate(d.created_at)}${d.note ? ' · ' + esc(d.note) : ''}</div></div><span class="st ${d.status}">${stLabel[d.status]}</span></div>`).join('') : '<p class="meta" style="color:var(--mut)">Belum ada deposit.</p>';
  } catch {}
}

/* ============ Kontak ============ */
function renderContact() {
  $('#v-contact').innerHTML = `<h1 class="ptitle">Kontak Admin</h1>
  <div class="card tg-card reveal"><div class="big-ico">✈️</div><h3>Hubungi Admin via Telegram</h3><p style="color:var(--mut);margin:6px 0 18px">Tanya stok, konfirmasi deposit, atau lapor kendala akun.</p><a class="btn primary" href="${esc(config.contact)}" target="_blank" rel="noopener">Chat @yanzstoru</a></div>
  <div class="card reveal"><h3>❓ Pertanyaan Umum</h3>
    <details><summary>Bagaimana cara membeli ID?</summary><p>Daftar/masuk, isi saldo lewat menu Deposit, pilih ID di Katalog, lalu klik Beli dan konfirmasi.</p></details>
    <details><summary>Berapa lama saldo masuk?</summary><p>Setelah kamu kirim permintaan deposit dan admin mengonfirmasi, saldo langsung bertambah.</p></details>
    <details><summary>Di mana file akun saya?</summary><p>Setelah pembelian sukses, klik Download File Akun. File juga selalu tersedia di menu Riwayat.</p></details>
    <details><summary>Bagaimana login ke Free Fire?</summary><p>Klik tombol Tutorial Login ke FF setelah pembelian atau di Riwayat untuk menonton videonya.</p></details>
  </div>`;
}

/* ============ Profil ============ */
async function renderProfile() {
  await refreshMe();
  let n = 0; try { n = (await api('orders')).orders.length; } catch {}
  $('#v-profile').innerHTML = `<h1 class="ptitle">Profil</h1>
  <div class="card reveal"><div class="prof-head"><div class="avatar">${esc(me.username[0].toUpperCase())}</div><div><h3 style="margin:0">${esc(me.username)} ${me.role === 'admin' ? '<span class="st approved">ADMIN</span>' : ''}</h3><div class="meta" style="color:var(--mut)">Bergabung ${fdate(me.created_at)}</div></div></div>
    <div class="kpis" style="margin:18px 0 0"><div class="kpi"><b>${rp(me.balance)}</b><span>Saldo</span></div><div class="kpi"><b>${n}</b><span>Total pembelian</span></div></div></div>
  <div class="two"><div class="card reveal"><h3>📱 Kontak</h3><form id="phForm"><label>No. WhatsApp/Telegram<input name="phone" value="${esc(me.phone || '')}" inputmode="tel" placeholder="08xxxxxxxxxx"></label><button class="btn primary block">Simpan</button></form></div>
  <div class="card reveal"><h3>🔑 Ganti Password</h3><form id="pwForm"><label>Password lama<input type="password" name="old_password" required autocomplete="current-password"></label><label>Password baru<input type="password" name="new_password" required minlength="6" autocomplete="new-password"></label><button class="btn primary block">Ganti Password</button></form></div></div>
  <button class="btn danger block" id="logoutBtn">Keluar</button>`;
  $('#phForm').onsubmit = async (e) => { e.preventDefault(); try { me = (await api('profile', { method: 'PUT', body: { phone: new FormData(e.target).get('phone') } })).user; toast('Profil disimpan'); } catch (er) { toast(er.message, 'err'); } };
  $('#pwForm').onsubmit = async (e) => { e.preventDefault(); const f = new FormData(e.target); try { await api('profile', { method: 'PUT', body: { old_password: f.get('old_password'), new_password: f.get('new_password') } }); toast('Password diganti'); e.target.reset(); } catch (er) { toast(er.message, 'err'); } };
  $('#logoutBtn').onclick = logout;
  reveal($('#v-profile'));
}

/* ============ ADMIN ============ */
const ADMIN_TABS = [['overview', '📊 Ringkasan'], ['stock', '📦 Stok'], ['add', '➕ Tambah Stok'], ['users', '👥 User & Saldo'], ['deposits', '💳 Deposit'], ['vouchers', '🎟️ Voucher'], ['broadcast', '📣 Broadcast'], ['orders', '🧾 Pesanan'], ['settings', '⚙️ Pengaturan']];
let adminTab = 'overview';
let stockFilter = { tier: '', status: '', q: '' };
const panel = () => $('#apanel');
const tableWrap = (head, rows) => `<div class="tbl"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${head.length}" style="text-align:center;color:var(--mut)">Tidak ada data</td></tr>`}</tbody></table></div>`;
async function adm(fn, ok, after) { try { const r = await fn(); if (ok) toast(ok); if (after) await after(r); return r; } catch (e) { toast(e.message, 'err'); } }
function readFile(f) {
  return new Promise((res, rej) => {
    if (f.size > 1000000) return rej(new Error('File maksimal 1 MB'));
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(new Error('Gagal membaca file'));
    r.readAsDataURL(f);
  });
}
function renderAdmin() {
  $('#v-admin').innerHTML = `<h1 class="ptitle">Panel Admin</h1><div class="atabs" id="atabs">${ADMIN_TABS.map(([k, l]) => `<button class="chip-b ${k === adminTab ? 'on' : ''}" data-atab="${k}">${l}</button>`).join('')}</div><div class="card" id="apanel"></div>`;
  $('#atabs').onclick = (e) => { const b = e.target.closest('[data-atab]'); if (!b) return; adminTab = b.dataset.atab; $$('#atabs .chip-b').forEach((x) => x.classList.toggle('on', x === b)); loadAdminTab(); };
  loadAdminTab();
}
function loadAdminTab() {
  const p = panel(); p.onclick = null; p.onsubmit = null; p.onchange = null;
  p.innerHTML = '<div class="skeleton" style="height:120px"></div>';
  ({ overview: tabOverview, stock: tabStock, add: tabAdd, users: tabUsers, deposits: tabDeposits, vouchers: tabVouchers, broadcast: tabBroadcast, orders: tabOrders, settings: tabSettings })[adminTab]();
}
function bind(actions, forms = {}, change) {
  const p = panel();
  p.onclick = (e) => { const t = e.target.closest('[data-a]'); if (t && actions[t.dataset.a]) actions[t.dataset.a](t, e); };
  p.onsubmit = (e) => { const n = e.target.dataset.form; if (n && forms[n]) { e.preventDefault(); forms[n](e.target); } };
  if (change) p.onchange = change;
}

async function tabOverview() {
  const o = await adm(() => api('admin/overview')); if (!o) return;
  panel().innerHTML = `<div class="kpis"><div class="kpi"><b>${o.users}</b><span>User</span></div><div class="kpi"><b>${o.stock}</b><span>Stok tersedia</span></div><div class="kpi"><b>${o.sold}</b><span>Terjual</span></div><div class="kpi"><b>${rp(o.revenue)}</b><span>Pendapatan</span></div><div class="kpi"><b>${o.pending_deposits}</b><span>Deposit pending</span></div></div>
  <h3>Stok per Tingkat</h3><div class="chips" style="flex-wrap:wrap">${TIER_KEYS.map((k) => `<span class="chip-b on" style="--c:${TIERS[k].color}">${TIERS[k].icon} ${TIERS[k].name}: <b>&nbsp;${(o.tiers.find((t) => t.tier === k) || { c: 0 }).c}</b></span>`).join('')}</div>`;
}

async function tabStock() {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(stockFilter).filter(([, v]) => v))).toString();
  const r = await adm(() => api('admin/products?' + qs)); if (!r) return;
  panel().innerHTML = `<div class="filters"><div class="row"><select data-f="tier"><option value="">Semua tingkat</option>${TIER_KEYS.map((k) => `<option value="${k}" ${stockFilter.tier === k ? 'selected' : ''}>${TIERS[k].name}</option>`).join('')}</select><select data-f="status"><option value="">Semua status</option><option value="available" ${stockFilter.status === 'available' ? 'selected' : ''}>Tersedia</option><option value="sold" ${stockFilter.status === 'sold' ? 'selected' : ''}>Terjual</option></select><input data-f="q" value="${esc(stockFilter.q)}" placeholder="Cari ID…" style="flex:1;min-width:150px"></div></div>` +
    tableWrap(['#', 'ID Game', 'Tingkat', 'Harga', 'Status', 'Aksi'], r.products.map((p) => `<tr><td>${p.id}</td><td><b>${esc(p.game_id)}</b></td><td>${tierTag(p.tier)}</td><td>${rp(p.price)}</td><td><span class="st ${p.status}">${stLabel[p.status]}</span></td><td class="acts"><button class="btn xs" data-a="price" data-id="${p.id}" data-v="${p.price}">Harga</button><button class="btn xs" data-a="tier" data-id="${p.id}" data-v="${p.tier}">Tingkat</button><button class="btn xs" data-a="file" data-id="${p.id}">File</button>${p.status === 'available' ? `<button class="btn xs danger" data-a="del" data-id="${p.id}">Hapus</button>` : ''}</td></tr>`).join(''));
  bind({
    price: (t) => { const v = prompt('Harga baru (Rp):', t.dataset.v); if (v === null) return; adm(() => api('admin/products/' + t.dataset.id, { method: 'PUT', body: { price: +v } }), 'Harga diubah', tabStock); },
    tier: (t) => { const v = prompt('Tingkat baru (' + TIER_KEYS.join(', ') + '):', t.dataset.v); if (v === null) return; adm(() => api('admin/products/' + t.dataset.id, { method: 'PUT', body: { tier: v.trim().toLowerCase() } }), 'Tingkat diubah', tabStock); },
    file: (t) => downloadFile(`admin/products/${t.dataset.id}/file`, 'akun.txt'),
    del: (t) => { if (confirm('Hapus stok ini?')) adm(() => api('admin/products/' + t.dataset.id, { method: 'DELETE' }), 'Stok dihapus', tabStock); },
  }, {}, (e) => { const f = e.target.dataset.f; if (f) { stockFilter[f] = e.target.value.trim(); tabStock(); } });
}

function tabAdd() {
  panel().innerHTML = `<h3>➕ Tambah Stok ID</h3><form data-form="add">
    <label>Pilih tingkatan</label>
    <div class="tier-radio">${TIER_KEYS.map((k, i) => `<label class="tr" style="--c:${TIERS[k].color}"><input type="radio" name="tier" value="${k}" ${i === 0 ? 'checked' : ''}><span>${TIERS[k].icon} ${TIERS[k].name}</span></label>`).join('')}</div>
    <div class="fg"><label>ID Free Fire (ID cantik)<input name="game_id" required maxlength="30" placeholder="contoh: 7777777"></label><label>Harga (Rp)<input name="price" type="number" min="1" required placeholder="50000"></label><label class="full">Judul (opsional)<input name="title" maxlength="80" placeholder="contoh: ID Sakral 7 Angka"></label><label class="full">Deskripsi (opsional)<textarea name="description" maxlength="300" placeholder="Keterangan akun…"></textarea></label><label class="full">Upload file akun (maks 1 MB)<input name="file" type="file" required></label></div>
    <button class="btn primary">Tambah Stok</button></form>`;
  bind({}, {
    add: async (form) => {
      const f = new FormData(form), file = f.get('file'), btn = form.querySelector('.btn.primary');
      btn.disabled = true; btn.classList.add('loading');
      try {
        const data = await readFile(file);
        await api('admin/products', { method: 'POST', body: { tier: f.get('tier'), game_id: f.get('game_id'), price: f.get('price'), title: f.get('title'), description: f.get('description'), file_name: file.name, file_mime: file.type, file_data: data } });
        toast('Stok berhasil ditambahkan ✔'); form.reset();
      } catch (e) { toast(e.message, 'err'); }
      btn.disabled = false; btn.classList.remove('loading');
    },
  });
}

async function tabUsers(q = '') {
  const r = await adm(() => api('admin/users?q=' + encodeURIComponent(q))); if (!r) return;
  panel().innerHTML = `<div class="card" style="background:var(--card2)"><h3>💰 Tambah / Kurangi Saldo</h3><form data-form="bal" class="fg"><label>Username<input name="username" required></label><label>Nominal (negatif = kurangi)<input name="amount" type="number" required placeholder="50000"></label><label style="align-self:end"><button class="btn primary block">Proses</button></label></form></div>
    <form data-form="usearch" class="search" style="margin-bottom:12px"><input name="q" value="${esc(q)}" placeholder="Cari username…"><button class="btn">Cari</button></form>` +
    tableWrap(['#', 'Username', 'Role', 'Saldo', 'Status', 'Aksi'], r.users.map((u) => `<tr><td>${u.id}</td><td><b>${esc(u.username)}</b></td><td>${u.role}</td><td>${rp(u.balance)}</td><td><span class="st ${u.banned ? 'rejected' : 'approved'}">${u.banned ? 'Diblokir' : 'Aktif'}</span></td><td class="acts"><button class="btn xs ok" data-a="addbal" data-u="${esc(u.username)}">+ Saldo</button><button class="btn xs ${u.banned ? '' : 'danger'}" data-a="ban" data-id="${u.id}" data-b="${u.banned ? 0 : 1}">${u.banned ? 'Buka blokir' : 'Blokir'}</button><button class="btn xs" data-a="role" data-id="${u.id}" data-r="${u.role === 'admin' ? 'user' : 'admin'}">${u.role === 'admin' ? 'Jadikan user' : 'Jadikan admin'}</button></td></tr>`).join(''));
  bind({
    addbal: (t) => { const v = prompt('Nominal saldo untuk ' + t.dataset.u + ' (negatif = kurangi):', '10000'); if (v === null) return; adm(() => api('admin/balance', { method: 'POST', body: { username: t.dataset.u, amount: +v } }), 'Saldo diperbarui', () => tabUsers(q)); },
    ban: (t) => adm(() => api('admin/users/' + t.dataset.id, { method: 'PUT', body: { banned: t.dataset.b === '1' } }), 'Status user diubah', () => tabUsers(q)),
    role: (t) => { if (confirm('Ubah role user ini?')) adm(() => api('admin/users/' + t.dataset.id, { method: 'PUT', body: { role: t.dataset.r } }), 'Role diubah', () => tabUsers(q)); },
  }, {
    bal: async (f) => { const d = new FormData(f); await adm(() => api('admin/balance', { method: 'POST', body: { username: d.get('username'), amount: +d.get('amount') } }), 'Saldo berhasil diproses', () => tabUsers(q)); },
    usearch: (f) => tabUsers(new FormData(f).get('q')),
  });
}

async function tabDeposits() {
  const r = await adm(() => api('admin/deposits')); if (!r) return;
  panel().innerHTML = tableWrap(['#', 'User', 'Nominal', 'Metode', 'Catatan', 'Waktu', 'Status', 'Aksi'], r.deposits.map((d) => `<tr><td>${d.id}</td><td><b>${esc(d.username)}</b></td><td>${rp(d.amount)}</td><td>${esc(d.method)}</td><td>${esc(d.note)}</td><td>${fdate(d.created_at)}</td><td><span class="st ${d.status}">${stLabel[d.status]}</span></td><td class="acts">${d.status === 'pending' ? `<button class="btn xs ok" data-a="dep" data-id="${d.id}" data-x="approve">Setujui</button><button class="btn xs danger" data-a="dep" data-id="${d.id}" data-x="reject">Tolak</button>` : '—'}</td></tr>`).join(''));
  bind({ dep: (t) => { if (confirm(t.dataset.x === 'approve' ? 'Setujui deposit dan tambah saldo user?' : 'Tolak deposit ini?')) adm(() => api('admin/deposits/' + t.dataset.id, { method: 'POST', body: { action: t.dataset.x } }), 'Deposit diproses', tabDeposits); } });
}

async function tabVouchers() {
  const r = await adm(() => api('admin/vouchers')); if (!r) return;
  panel().innerHTML = `<h3>🎟️ Buat Voucher</h3><form data-form="v" class="fg"><label>Kode<input name="code" required maxlength="24" placeholder="HEMAT10" style="text-transform:uppercase"></label><label>Tipe<select name="type" style="width:100%"><option value="percent">Persen (%)</option><option value="fixed">Nominal (Rp)</option></select></label><label>Nilai<input name="value" type="number" min="1" required placeholder="10"></label><label>Maks. pemakaian (0 = tanpa batas)<input name="max_uses" type="number" min="0" value="0"></label><label>Min. pembelian (Rp)<input name="min_price" type="number" min="0" value="0"></label><label>Berlaku (hari, 0 = selamanya)<input name="days" type="number" min="0" value="0"></label></div><button class="btn primary">Buat Voucher</button></form><div style="height:16px"></div>` +
    tableWrap(['Kode', 'Potongan', 'Terpakai', 'Min. beli', 'Kedaluwarsa', 'Status', 'Aksi'], r.vouchers.map((v) => `<tr><td><b>${esc(v.code)}</b></td><td>${v.type === 'percent' ? v.value + '%' : rp(v.value)}</td><td>${v.used}${v.max_uses ? ' / ' + v.max_uses : ''}</td><td>${rp(v.min_price)}</td><td>${v.expires_at ? fdate(v.expires_at) : '—'}</td><td><span class="st ${v.active ? 'approved' : 'rejected'}">${v.active ? 'Aktif' : 'Nonaktif'}</span></td><td class="acts"><button class="btn xs" data-a="vt" data-c="${esc(v.code)}" data-v="${v.active ? 0 : 1}">${v.active ? 'Nonaktifkan' : 'Aktifkan'}</button><button class="btn xs danger" data-a="vd" data-c="${esc(v.code)}">Hapus</button></td></tr>`).join(''));
  bind({
    vt: (t) => adm(() => api('admin/vouchers/' + encodeURIComponent(t.dataset.c), { method: 'PUT', body: { active: t.dataset.v === '1' } }), 'Voucher diperbarui', tabVouchers),
    vd: (t) => { if (confirm('Hapus voucher?')) adm(() => api('admin/vouchers/' + encodeURIComponent(t.dataset.c), { method: 'DELETE' }), 'Voucher dihapus', tabVouchers); },
  }, { v: async (f) => { const d = Object.fromEntries(new FormData(f)); await adm(() => api('admin/vouchers', { method: 'POST', body: d }), 'Voucher dibuat ✔', tabVouchers); } });
}

async function tabBroadcast() {
  const r = await adm(() => api('broadcasts')); if (!r) return;
  panel().innerHTML = `<h3>📣 Kirim Broadcast</h3><form data-form="b"><label>Judul<input name="title" required maxlength="80" placeholder="Stok baru masuk!"></label><label>Pesan<textarea name="message" required maxlength="500" placeholder="Isi pengumuman…"></textarea></label><button class="btn primary">Kirim ke Semua User</button></form><h3 style="margin-top:22px">Riwayat Broadcast</h3>` +
    (r.broadcasts.length ? r.broadcasts.map((b) => `<div class="li"><div><b>${esc(b.title)}</b><div class="meta">${esc(b.message)}</div><div class="meta">${fdate(b.created_at)}</div></div><button class="btn xs danger" data-a="bd" data-id="${b.id}">Hapus</button></div>`).join('') : '<p style="color:var(--mut)">Belum ada broadcast.</p>');
  bind({ bd: (t) => adm(() => api('admin/broadcasts/' + t.dataset.id, { method: 'DELETE' }), 'Broadcast dihapus', tabBroadcast) },
    { b: async (f) => { const d = Object.fromEntries(new FormData(f)); await adm(() => api('admin/broadcasts', { method: 'POST', body: d }), 'Broadcast terkirim 📣', async () => { await loadBroadcasts(); tabBroadcast(); }); } });
}

async function tabOrders() {
  const r = await adm(() => api('admin/orders')); if (!r) return;
  panel().innerHTML = tableWrap(['#', 'User', 'ID Game', 'Tingkat', 'Harga', 'Diskon', 'Total', 'Voucher', 'Waktu'], r.orders.map((o) => `<tr><td>${o.id}</td><td><b>${esc(o.username)}</b></td><td>${esc(o.game_id)}</td><td>${tierTag(o.tier)}</td><td>${rp(o.price)}</td><td>${rp(o.discount)}</td><td>${rp(o.total)}</td><td>${esc(o.voucher || '—')}</td><td>${fdate(o.created_at)}</td></tr>`).join(''));
}

async function tabSettings() {
  const s = await adm(() => api('admin/settings')); if (!s) return;
  panel().innerHTML = `<h3>⚙️ Pengaturan Toko</h3><form data-form="s"><label>Link kontak admin<input name="contact" value="${esc(s.contact || '')}" placeholder="https://t.me/yanzstoru"></label><label>Info pembayaran deposit (tampil di halaman Deposit)<textarea name="deposit_info" rows="5">${esc(s.deposit_info || '')}</textarea></label><button class="btn primary">Simpan</button></form>`;
  bind({}, { s: async (f) => { const d = Object.fromEntries(new FormData(f)); await adm(() => api('admin/settings', { method: 'PUT', body: d }), 'Pengaturan disimpan ✔', async () => { config = await api('config'); }); } });
}

/* ============ Init ============ */
(async function init() {
  $('#yr').textContent = new Date().getFullYear();
  const v = $('#introVideo'), hv = $('#heroVideo');
  v.addEventListener('error', () => hv.classList.add('novideo'));
  v.play().catch(() => {});
  hv.onclick = () => { v.muted = !v.muted; v.play().catch(() => {}); toast(v.muted ? '🔇 Suara dimatikan' : '🔊 Suara dinyalakan'); };
  try { config = await api('config'); } catch {}
  if (token) { try { me = (await api('me')).user; } catch { token = ''; localStorage.removeItem('ys_token'); } }
  updateHeader();
  loadBroadcasts(); setInterval(loadBroadcasts, 45000);
  setInterval(() => { if (me) refreshMe(); }, 60000);
  route();
})();

// Yanz Shop API — Cloudflare Pages Functions + D1
const TIERS = ['mythic', 'legendary', 'epic', 'rare', 'unik'];
const MAX_FILE_B64 = 1400000; // ~1MB file (batas baris D1 = 2MB)
const enc = new TextEncoder();

const json = (d, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
const err = (m, s = 400) => json({ error: m }, s);
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
const rand = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const int = (v) => Math.floor(Number(v));

async function hashPw(pw, salt) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unhex(salt), iterations: 100000, hash: 'SHA-256' }, k, 256));
}
function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const USER_COLS = 'id,username,role,balance,phone,banned,created_at';

async function authUser(request, db) {
  const t = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!t) return null;
  const u = await db
    .prepare(`SELECT u.id,u.username,u.role,u.balance,u.phone,u.banned,u.created_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.created_at>?`)
    .bind(t, Date.now() - 30 * 864e5)
    .first();
  if (!u || u.banned) return null;
  return u;
}

async function newSession(db, uid) {
  const token = rand(32);
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE user_id=? AND created_at<?').bind(uid, Date.now() - 30 * 864e5),
    db.prepare('INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)').bind(token, uid, Date.now()),
  ]);
  const user = await db.prepare(`SELECT ${USER_COLS} FROM users WHERE id=?`).bind(uid).first();
  return { token, user };
}

async function getSettings(db) {
  const r = await db.prepare('SELECT key,value FROM settings').all();
  const o = {};
  for (const x of r.results) o[x.key] = x.value;
  return o;
}

async function checkVoucher(db, uid, code, price) {
  code = String(code || '').trim().toUpperCase();
  if (!code) return { ok: false, error: 'Kode voucher kosong' };
  const v = await db.prepare('SELECT * FROM vouchers WHERE code=?').bind(code).first();
  if (!v || !v.active) return { ok: false, error: 'Voucher tidak valid' };
  if (v.expires_at && v.expires_at < Date.now()) return { ok: false, error: 'Voucher sudah kedaluwarsa' };
  if (v.max_uses > 0 && v.used >= v.max_uses) return { ok: false, error: 'Kuota voucher sudah habis' };
  if (uid) {
    const used = await db.prepare('SELECT 1 FROM orders WHERE user_id=? AND voucher=?').bind(uid, code).first();
    if (used) return { ok: false, error: 'Voucher ini sudah pernah kamu pakai' };
  }
  if (price > 0 && price < v.min_price) return { ok: false, error: 'Minimal pembelian Rp ' + v.min_price.toLocaleString('id-ID') };
  let d = v.type === 'percent' ? Math.floor((price * v.value) / 100) : v.value;
  d = Math.min(d, price);
  return { ok: true, code, discount: d, type: v.type, value: v.value, min_price: v.min_price };
}

export async function onRequest({ request, env }) {
  try {
    return await handle(request, env);
  } catch (e) {
    return err('Server error: ' + ((e && e.message) || e), 500);
  }
}

async function handle(request, env) {
  const db = env.DB;
  if (!db) return err('Database D1 belum terhubung (binding DB di wrangler.toml).', 500);
  const url = new URL(request.url);
  const seg = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const M = request.method;
  let body = {};
  if (M !== 'GET' && M !== 'HEAD') {
    try { body = await request.json(); } catch { body = {}; }
  }
  const q = url.searchParams;
  const [a, b, c] = seg;
  const now = Date.now();

  // ---------- PUBLIK ----------
  if (a === 'config' && M === 'GET') {
    const s = await getSettings(db);
    return json({ contact: s.contact || 'https://t.me/yanzstoru', deposit_info: s.deposit_info || '' });
  }
  if (a === 'stats' && M === 'GET') {
    const r = await db.prepare("SELECT tier,COUNT(*) c,MIN(price) minp FROM products WHERE status='available' GROUP BY tier").all();
    const sold = await db.prepare("SELECT COUNT(*) c FROM products WHERE status='sold'").first();
    const users = await db.prepare('SELECT COUNT(*) c FROM users').first();
    return json({ tiers: r.results, sold: sold.c, users: users.c });
  }
  if (a === 'products' && M === 'GET') {
    let sql = "SELECT id,tier,game_id,title,description,price,created_at FROM products WHERE status='available'";
    const args = [];
    const tier = q.get('tier');
    if (tier && TIERS.includes(tier)) { sql += ' AND tier=?'; args.push(tier); }
    const s = (q.get('q') || '').trim().slice(0, 30).replace(/[%_]/g, '');
    if (s) { sql += ' AND (game_id LIKE ? OR title LIKE ?)'; args.push('%' + s + '%', '%' + s + '%'); }
    const sort = q.get('sort');
    sql += sort === 'high' ? ' ORDER BY price DESC' : sort === 'new' ? ' ORDER BY id DESC' : ' ORDER BY price ASC';
    sql += ' LIMIT 200';
    const r = await db.prepare(sql).bind(...args).all();
    return json({ products: r.results });
  }
  if (a === 'broadcasts' && M === 'GET') {
    const r = await db.prepare('SELECT id,title,message,created_at FROM broadcasts ORDER BY id DESC LIMIT 30').all();
    return json({ broadcasts: r.results });
  }
  if (a === 'auth' && b === 'register' && M === 'POST') {
    const username = String(body.username || '').trim();
    const pw = String(body.password || '');
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return err('Username 3-20 karakter (huruf, angka, underscore)');
    if (pw.length < 6 || pw.length > 100) return err('Password minimal 6 karakter');
    const ex = await db.prepare('SELECT 1 FROM users WHERE username=?').bind(username).first();
    if (ex) return err('Username sudah dipakai', 409);
    let role = 'user';
    if (env.ADMIN_USERNAME && username.toLowerCase() === String(env.ADMIN_USERNAME).toLowerCase()) {
      const adm = await db.prepare("SELECT 1 FROM users WHERE role='admin'").first();
      if (!adm) role = 'admin';
    }
    const salt = rand(16);
    const ph = await hashPw(pw, salt);
    const r = await db
      .prepare('INSERT INTO users(username,salt,password_hash,role,balance,phone,created_at) VALUES(?,?,?,?,0,?,?)')
      .bind(username, salt, ph, role, String(body.phone || '').replace(/[^0-9+]/g, '').slice(0, 20), now)
      .run();
    return json(await newSession(db, r.meta.last_row_id));
  }
  if (a === 'auth' && b === 'login' && M === 'POST') {
    const u = await db.prepare('SELECT * FROM users WHERE username=?').bind(String(body.username || '').trim()).first();
    const ph = u ? await hashPw(String(body.password || ''), u.salt) : '';
    if (!u || !safeEq(ph, u.password_hash)) return err('Username atau password salah', 401);
    if (u.banned) return err('Akun kamu diblokir. Hubungi admin.', 403);
    return json(await newSession(db, u.id));
  }

  // ---------- WAJIB LOGIN ----------
  const user = await authUser(request, db);
  if (!user) return err('Silakan login terlebih dahulu', 401);

  if (a === 'auth' && b === 'logout' && M === 'POST') {
    const t = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    await db.prepare('DELETE FROM sessions WHERE token=?').bind(t).run();
    return json({ ok: true });
  }
  if (a === 'me' && M === 'GET') return json({ user });

  if (a === 'profile' && M === 'PUT') {
    if (body.phone !== undefined) {
      await db.prepare('UPDATE users SET phone=? WHERE id=?').bind(String(body.phone).replace(/[^0-9+]/g, '').slice(0, 20), user.id).run();
    }
    if (body.new_password) {
      const full = await db.prepare('SELECT salt,password_hash FROM users WHERE id=?').bind(user.id).first();
      const old = await hashPw(String(body.old_password || ''), full.salt);
      if (!safeEq(old, full.password_hash)) return err('Password lama salah');
      if (String(body.new_password).length < 6) return err('Password baru minimal 6 karakter');
      const salt = rand(16);
      await db.prepare('UPDATE users SET salt=?,password_hash=? WHERE id=?').bind(salt, await hashPw(String(body.new_password), salt), user.id).run();
    }
    const u = await db.prepare(`SELECT ${USER_COLS} FROM users WHERE id=?`).bind(user.id).first();
    return json({ user: u });
  }

  if (a === 'voucher' && b === 'check' && M === 'POST') {
    const r = await checkVoucher(db, user.id, body.code, int(body.price) || 0);
    return r.ok ? json(r) : err(r.error);
  }

  if (a === 'buy' && M === 'POST') {
    const p = await db.prepare("SELECT id,tier,game_id,title,price FROM products WHERE id=? AND status='available'").bind(int(body.product_id)).first();
    if (!p) return err('Akun sudah terjual atau tidak ditemukan', 409);
    let discount = 0, vcode = null;
    if (body.voucher) {
      const v = await checkVoucher(db, user.id, body.voucher, p.price);
      if (!v.ok) return err(v.error);
      discount = v.discount;
      vcode = v.code;
    }
    const total = Math.max(0, p.price - discount);
    const r1 = await db.prepare('UPDATE users SET balance=balance-? WHERE id=? AND balance>=?').bind(total, user.id, total).run();
    if (!r1.meta.changes) return err('Saldo tidak cukup. Silakan isi saldo dulu.', 402);
    const refund = () => db.prepare('UPDATE users SET balance=balance+? WHERE id=?').bind(total, user.id).run();
    const r2 = await db.prepare("UPDATE products SET status='sold',sold_at=? WHERE id=? AND status='available'").bind(now, p.id).run();
    if (!r2.meta.changes) { await refund(); return err('Akun baru saja terjual ke orang lain', 409); }
    if (vcode) {
      const r3 = await db.prepare('UPDATE vouchers SET used=used+1 WHERE code=? AND (max_uses=0 OR used<max_uses)').bind(vcode).run();
      if (!r3.meta.changes) {
        await refund();
        await db.prepare("UPDATE products SET status='available',sold_at=NULL WHERE id=?").bind(p.id).run();
        return err('Kuota voucher baru saja habis');
      }
    }
    const o = await db
      .prepare('INSERT INTO orders(user_id,product_id,price,discount,total,voucher,created_at) VALUES(?,?,?,?,?,?,?)')
      .bind(user.id, p.id, p.price, discount, total, vcode, now)
      .run();
    const nb = await db.prepare('SELECT balance FROM users WHERE id=?').bind(user.id).first();
    return json({ ok: true, order: { id: o.meta.last_row_id, tier: p.tier, game_id: p.game_id, title: p.title, price: p.price, discount, total }, balance: nb.balance });
  }

  if (a === 'orders' && !b && M === 'GET') {
    const r = await db
      .prepare('SELECT o.id,o.price,o.discount,o.total,o.voucher,o.created_at,p.tier,p.game_id,p.title,p.file_name FROM orders o JOIN products p ON p.id=o.product_id WHERE o.user_id=? ORDER BY o.id DESC LIMIT 100')
      .bind(user.id)
      .all();
    return json({ orders: r.results });
  }
  if (a === 'orders' && b && c === 'download' && M === 'GET') {
    const p = await db
      .prepare('SELECT p.file_name,p.file_mime,p.file_data FROM orders o JOIN products p ON p.id=o.product_id WHERE o.id=? AND o.user_id=?')
      .bind(int(b), user.id)
      .first();
    if (!p || !p.file_data) return err('File tidak ditemukan', 404);
    return fileResponse(p);
  }

  if (a === 'deposits' && M === 'GET') {
    const r = await db.prepare('SELECT id,amount,method,note,status,created_at FROM deposits WHERE user_id=? ORDER BY id DESC LIMIT 50').bind(user.id).all();
    return json({ deposits: r.results });
  }
  if (a === 'deposits' && M === 'POST') {
    const amount = int(body.amount);
    if (!(amount >= 10000 && amount <= 10000000)) return err('Nominal deposit Rp 10.000 – Rp 10.000.000');
    const pend = await db.prepare("SELECT COUNT(*) c FROM deposits WHERE user_id=? AND status='pending'").bind(user.id).first();
    if (pend.c >= 5) return err('Masih ada 5 deposit menunggu konfirmasi. Mohon tunggu admin.');
    await db
      .prepare('INSERT INTO deposits(user_id,amount,method,note,status,created_at) VALUES(?,?,?,?,?,?)')
      .bind(user.id, amount, String(body.method || '').slice(0, 30), String(body.note || '').slice(0, 200), 'pending', now)
      .run();
    return json({ ok: true });
  }

  // ---------- ADMIN ----------
  if (a === 'admin') {
    if (user.role !== 'admin') return err('Akses ditolak', 403);

    if (b === 'overview' && M === 'GET') {
      const [u, st, sold, rev, dep, tiers] = await Promise.all([
        db.prepare('SELECT COUNT(*) c FROM users').first(),
        db.prepare("SELECT COUNT(*) c FROM products WHERE status='available'").first(),
        db.prepare("SELECT COUNT(*) c FROM products WHERE status='sold'").first(),
        db.prepare('SELECT COALESCE(SUM(total),0) s FROM orders').first(),
        db.prepare("SELECT COUNT(*) c FROM deposits WHERE status='pending'").first(),
        db.prepare("SELECT tier,COUNT(*) c FROM products WHERE status='available' GROUP BY tier").all(),
      ]);
      return json({ users: u.c, stock: st.c, sold: sold.c, revenue: rev.s, pending_deposits: dep.c, tiers: tiers.results });
    }

    if (b === 'products' && !c && M === 'GET') {
      let sql = 'SELECT id,tier,game_id,title,description,price,status,file_name,created_at,sold_at FROM products WHERE 1=1';
      const args = [];
      if (TIERS.includes(q.get('tier'))) { sql += ' AND tier=?'; args.push(q.get('tier')); }
      if (['available', 'sold'].includes(q.get('status'))) { sql += ' AND status=?'; args.push(q.get('status')); }
      const s = (q.get('q') || '').trim().replace(/[%_]/g, '');
      if (s) { sql += ' AND game_id LIKE ?'; args.push('%' + s + '%'); }
      sql += ' ORDER BY id DESC LIMIT 300';
      return json({ products: (await db.prepare(sql).bind(...args).all()).results });
    }
    if (b === 'products' && !c && M === 'POST') {
      const tier = String(body.tier || '');
      const gid = String(body.game_id || '').trim().slice(0, 30);
      const price = int(body.price);
      if (!TIERS.includes(tier)) return err('Tingkat tidak valid');
      if (!gid) return err('ID akun wajib diisi');
      if (!(price > 0)) return err('Harga tidak valid');
      const fd = String(body.file_data || '');
      if (!fd) return err('File akun wajib diupload');
      if (fd.length > MAX_FILE_B64) return err('File terlalu besar (maks ±1 MB)');
      const r = await db
        .prepare('INSERT INTO products(tier,game_id,title,description,price,file_name,file_mime,file_data,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .bind(tier, gid, String(body.title || '').slice(0, 80), String(body.description || '').slice(0, 300), price, String(body.file_name || 'akun.txt').slice(0, 100), String(body.file_mime || 'application/octet-stream').slice(0, 100), fd, 'available', now)
        .run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
    if (b === 'products' && c && seg[3] === 'file' && M === 'GET') {
      const p = await db.prepare('SELECT file_name,file_mime,file_data FROM products WHERE id=?').bind(int(c)).first();
      if (!p || !p.file_data) return err('File tidak ada', 404);
      return fileResponse(p);
    }
    if (b === 'products' && c && M === 'PUT') {
      const sets = [], args = [];
      if (body.price !== undefined) { const pr = int(body.price); if (!(pr > 0)) return err('Harga tidak valid'); sets.push('price=?'); args.push(pr); }
      if (body.tier !== undefined) { if (!TIERS.includes(body.tier)) return err('Tingkat tidak valid'); sets.push('tier=?'); args.push(body.tier); }
      if (body.title !== undefined) { sets.push('title=?'); args.push(String(body.title).slice(0, 80)); }
      if (body.description !== undefined) { sets.push('description=?'); args.push(String(body.description).slice(0, 300)); }
      if (!sets.length) return err('Tidak ada perubahan');
      await db.prepare(`UPDATE products SET ${sets.join(',')} WHERE id=?`).bind(...args, int(c)).run();
      return json({ ok: true });
    }
    if (b === 'products' && c && M === 'DELETE') {
      const r = await db.prepare("DELETE FROM products WHERE id=? AND status='available'").bind(int(c)).run();
      return r.meta.changes ? json({ ok: true }) : err('Hanya stok yang belum terjual yang bisa dihapus');
    }

    if (b === 'users' && !c && M === 'GET') {
      const s = (q.get('q') || '').trim().replace(/[%_]/g, '');
      const r = await db.prepare(`SELECT ${USER_COLS} FROM users WHERE username LIKE ? ORDER BY id DESC LIMIT 200`).bind('%' + s + '%').all();
      return json({ users: r.results });
    }
    if (b === 'balance' && M === 'POST') {
      const amount = int(body.amount);
      if (!amount || !Number.isFinite(amount)) return err('Nominal tidak valid');
      const u = await db.prepare('SELECT id,balance FROM users WHERE username=?').bind(String(body.username || '').trim()).first();
      if (!u) return err('User tidak ditemukan', 404);
      if (u.balance + amount < 0) return err('Saldo user tidak boleh minus');
      await db.prepare('UPDATE users SET balance=balance+? WHERE id=?').bind(amount, u.id).run();
      const nb = await db.prepare('SELECT balance FROM users WHERE id=?').bind(u.id).first();
      return json({ ok: true, balance: nb.balance });
    }
    if (b === 'users' && c && M === 'PUT') {
      const id = int(c);
      if (id === user.id && (body.banned !== undefined || body.role !== undefined)) return err('Tidak bisa mengubah akun sendiri');
      if (body.banned !== undefined) {
        await db.prepare('UPDATE users SET banned=? WHERE id=?').bind(body.banned ? 1 : 0, id).run();
        if (body.banned) await db.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
      }
      if (body.role !== undefined && ['user', 'admin'].includes(body.role)) await db.prepare('UPDATE users SET role=? WHERE id=?').bind(body.role, id).run();
      return json({ ok: true });
    }

    if (b === 'deposits' && !c && M === 'GET') {
      const r = await db
        .prepare('SELECT d.id,d.amount,d.method,d.note,d.status,d.created_at,u.username FROM deposits d JOIN users u ON u.id=d.user_id ORDER BY (d.status=\'pending\') DESC, d.id DESC LIMIT 200')
        .all();
      return json({ deposits: r.results });
    }
    if (b === 'deposits' && c && M === 'POST') {
      const d = await db.prepare('SELECT * FROM deposits WHERE id=?').bind(int(c)).first();
      if (!d) return err('Deposit tidak ditemukan', 404);
      const act = body.action === 'approve' ? 'approved' : body.action === 'reject' ? 'rejected' : null;
      if (!act) return err('Aksi tidak valid');
      const r = await db.prepare("UPDATE deposits SET status=?,processed_at=? WHERE id=? AND status='pending'").bind(act, now, d.id).run();
      if (!r.meta.changes) return err('Deposit sudah diproses');
      if (act === 'approved') await db.prepare('UPDATE users SET balance=balance+? WHERE id=?').bind(d.amount, d.user_id).run();
      return json({ ok: true });
    }

    if (b === 'vouchers' && !c && M === 'GET') {
      return json({ vouchers: (await db.prepare('SELECT * FROM vouchers ORDER BY created_at DESC').all()).results });
    }
    if (b === 'vouchers' && !c && M === 'POST') {
      const code = String(body.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
      const type = body.type === 'fixed' ? 'fixed' : 'percent';
      const value = int(body.value);
      if (!code) return err('Kode voucher wajib');
      if (!(value > 0) || (type === 'percent' && value > 100)) return err('Nilai voucher tidak valid');
      const days = int(body.days) || 0;
      try {
        await db
          .prepare('INSERT INTO vouchers(code,type,value,max_uses,min_price,expires_at,active,created_at) VALUES(?,?,?,?,?,?,1,?)')
          .bind(code, type, value, Math.max(0, int(body.max_uses) || 0), Math.max(0, int(body.min_price) || 0), days > 0 ? now + days * 864e5 : null, now)
          .run();
      } catch { return err('Kode voucher sudah ada'); }
      return json({ ok: true });
    }
    if (b === 'vouchers' && c && M === 'PUT') {
      await db.prepare('UPDATE vouchers SET active=? WHERE code=?').bind(body.active ? 1 : 0, c).run();
      return json({ ok: true });
    }
    if (b === 'vouchers' && c && M === 'DELETE') {
      await db.prepare('DELETE FROM vouchers WHERE code=?').bind(c).run();
      return json({ ok: true });
    }

    if (b === 'broadcasts' && M === 'POST') {
      const t = String(body.title || '').trim().slice(0, 80), m = String(body.message || '').trim().slice(0, 500);
      if (!t || !m) return err('Judul dan pesan wajib diisi');
      await db.prepare('INSERT INTO broadcasts(title,message,created_at) VALUES(?,?,?)').bind(t, m, now).run();
      return json({ ok: true });
    }
    if (b === 'broadcasts' && c && M === 'DELETE') {
      await db.prepare('DELETE FROM broadcasts WHERE id=?').bind(int(c)).run();
      return json({ ok: true });
    }

    if (b === 'orders' && M === 'GET') {
      const r = await db
        .prepare('SELECT o.id,o.price,o.discount,o.total,o.voucher,o.created_at,u.username,p.tier,p.game_id FROM orders o JOIN users u ON u.id=o.user_id JOIN products p ON p.id=o.product_id ORDER BY o.id DESC LIMIT 200')
        .all();
      return json({ orders: r.results });
    }

    if (b === 'settings' && M === 'GET') return json(await getSettings(db));
    if (b === 'settings' && M === 'PUT') {
      const up = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
      const batch = [];
      if (body.contact !== undefined) batch.push(up.bind('contact', String(body.contact).slice(0, 200)));
      if (body.deposit_info !== undefined) batch.push(up.bind('deposit_info', String(body.deposit_info).slice(0, 1000)));
      if (batch.length) await db.batch(batch);
      return json({ ok: true });
    }
  }

  return err('Endpoint tidak ditemukan', 404);
}

function fileResponse(p) {
  const bin = atob(p.file_data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const safe = String(p.file_name || 'akun.txt').replace(/[^\w.\-]/g, '_');
  return new Response(bytes, {
    headers: {
      'content-type': p.file_mime || 'application/octet-stream',
      'content-disposition': `attachment; filename="${safe}"`,
      'cache-control': 'no-store',
    },
  });
}

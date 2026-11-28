// DO membership API (Cloudflare D1). Plans: ₹99 / ₹499 / ₹999
const PLANS = {
  m1:  { label: "1 Month",   price: 99,  days: 30 },
  m6:  { label: "6 Months",  price: 499, days: 183 },
  m12: { label: "12 Months", price: 999, days: 365 },
};
const DAY = 86400000;
const enc = new TextEncoder();
const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store", ...h } });
const toHex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
const rand = (n) => toHex(crypto.getRandomValues(new Uint8Array(n)));

async function hashPw(pw, saltHex) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations: 100000 }, key, 256);
  return toHex(new Uint8Array(bits));
}
function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const getToken = (req) => (req.headers.get("cookie") || "").match(/(?:^|;\s*)dm_session=([a-f0-9]{64})/)?.[1];
async function currentUser(req, env) {
  const t = getToken(req);
  if (!t) return null;
  return env.MDB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?").bind(t, Date.now()).first();
}
const publicUser = (u) => ({ name: u.name, email: u.email, do_id: u.do_id, since: u.created_at, member_until: u.member_until, active: u.member_until > Date.now() });
const cookie = (t, age) => `dm_session=${t}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`;

async function startSession(u, env) {
  const token = rand(32);
  await env.MDB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").bind(token, u.id, Date.now() + 30 * DAY).run();
  return json({ user: publicUser(u) }, 200, { "set-cookie": cookie(token, 30 * 86400) });
}

async function signup(req, env) {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim().slice(0, 60);
  const email = String(b.email || "").trim().toLowerCase().slice(0, 120);
  const phone = String(b.phone || "").replace(/\D/g, "").slice(-10);
  const pw = String(b.password || "");
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Enter your name and a valid email." }, 400);
  if (pw.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
  const salt = rand(16);
  const hash = await hashPw(pw, salt);
  const doId = "DO" + new Date().getFullYear() + "-" + rand(4).toUpperCase();
  try {
    await env.MDB.prepare("INSERT INTO users (email, name, phone, pass_hash, salt, do_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(email, name, phone, hash, salt, doId, Date.now()).run();
  } catch (e) {
    return json({ error: "This email is already registered. Please log in." }, 409);
  }
  const u = await env.MDB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  return startSession(u, env);
}

async function login(req, env) {
  const b = await req.json().catch(() => ({}));
  const u = await env.MDB.prepare("SELECT * FROM users WHERE email = ?").bind(String(b.email || "").trim().toLowerCase()).first();
  const bad = () => json({ error: "Wrong email or password." }, 401);
  if (!u) return bad();
  if (!safeEq(await hashPw(String(b.password || ""), u.salt), u.pass_hash)) return bad();
  return startSession(u, env);
}

async function logout(req, env) {
  const t = getToken(req);
  if (t) await env.MDB.prepare("DELETE FROM sessions WHERE token = ?").bind(t).run();
  return json({ ok: true }, 200, { "set-cookie": cookie("", 0) });
}

async function pay(req, env, user) {
  const b = await req.json().catch(() => ({}));
  const plan = PLANS[b.plan];
  const utr = String(b.utr || "").trim().toUpperCase();
  if (!plan) return json({ error: "Invalid plan." }, 400);
  if (!/^[A-Z0-9]{10,22}$/.test(utr)) return json({ error: "Enter the UPI transaction / UTR number (10–22 letters or digits)." }, 400);
  const open = await env.MDB.prepare("SELECT COUNT(*) AS c FROM payments WHERE user_id = ? AND status = 'pending'").bind(user.id).first();
  if (open.c >= 3) return json({ error: "You already have payments awaiting approval." }, 429);
  try {
    await env.MDB.prepare("INSERT INTO payments (user_id, plan, amount, utr, created_at) VALUES (?, ?, ?, ?, ?)").bind(user.id, b.plan, plan.price, utr, Date.now()).run();
  } catch (e) {
    return json({ error: "This transaction number was already submitted." }, 409);
  }
  return json({ ok: true });
}

const isAdmin = (req, env) => !!env.MEMBERSHIP_ADMIN_KEY && safeEq(req.headers.get("x-admin-key") || "", env.MEMBERSHIP_ADMIN_KEY);

async function decide(req, env) {
  const b = await req.json().catch(() => ({}));
  const p = await env.MDB.prepare("SELECT * FROM payments WHERE id = ? AND status = 'pending'").bind(Number(b.id)).first();
  if (!p) return json({ error: "Payment not found or already decided." }, 404);
  const now = Date.now();
  if (b.action === "approve") {
    const u = await env.MDB.prepare("SELECT member_until FROM users WHERE id = ?").bind(p.user_id).first();
    const until = Math.max(now, u.member_until || 0) + PLANS[p.plan].days * DAY;
    await env.MDB.batch([
      env.MDB.prepare("UPDATE payments SET status = 'approved', decided_at = ? WHERE id = ?").bind(now, p.id),
      env.MDB.prepare("UPDATE users SET member_until = ? WHERE id = ?").bind(until, p.user_id),
    ]);
    return json({ ok: true });
  }
  if (b.action === "reject") {
    await env.MDB.prepare("UPDATE payments SET status = 'rejected', decided_at = ? WHERE id = ?").bind(now, p.id).run();
    return json({ ok: true });
  }
  return json({ error: "Invalid action." }, 400);
}

async function route(req, env, url) {
  const p = url.pathname.replace(/^\/api\/m\//, "/api/");
  const m = req.method;

  if (p === "/api/plans" && m === "GET") return json({ plans: PLANS, upi_id: env.UPI_ID, payee: env.PAYEE_NAME || "DESI OFFICIALS" });
  if (p === "/api/signup" && m === "POST") return signup(req, env);
  if (p === "/api/login" && m === "POST") return login(req, env);
  if (p === "/api/logout" && m === "POST") return logout(req, env);

  if (p === "/api/me" && m === "GET") {
    const u = await currentUser(req, env);
    if (!u) return json({ user: null });
    const pend = await env.MDB.prepare("SELECT COUNT(*) AS c FROM payments WHERE user_id = ? AND status = 'pending'").bind(u.id).first();
    return json({ user: publicUser(u), pending: pend.c });
  }
  if (p === "/api/pay" && m === "POST") {
    const u = await currentUser(req, env);
    if (!u) return json({ error: "Please log in first." }, 401);
    return pay(req, env, u);
  }
  if (p === "/api/bid" && m === "POST") {
    const u = await currentUser(req, env);
    if (!u) return json({ error: "Please log in first." }, 401);
    if (u.member_until <= Date.now()) return json({ error: "Active membership required." }, 403);
    const b = await req.json().catch(() => ({}));
    const amount = Math.floor(Number(b.amount));
    const item = String(b.item || "").slice(0, 60);
    if (!item || !(amount > 0 && amount < 10000000)) return json({ error: "Enter a valid bid." }, 400);
    await env.MDB.prepare("INSERT INTO bids (user_id, item, amount, created_at) VALUES (?, ?, ?, ?)").bind(u.id, item, amount, Date.now()).run();
    return json({ ok: true });
  }
  if (p.startsWith("/api/admin/")) {
    if (!isAdmin(req, env)) return json({ error: "Unauthorized" }, 401);
    if (p === "/api/admin/payments" && m === "GET") {
      const { results } = await env.MDB.prepare(
        `SELECT p.id, p.plan, p.amount, p.utr, p.status, p.created_at, u.name, u.email, u.phone, u.do_id
         FROM payments p JOIN users u ON u.id = p.user_id ORDER BY (p.status = 'pending') DESC, p.created_at DESC LIMIT 200`).all();
      return json({ payments: results });
    }
    if (p === "/api/admin/decide" && m === "POST") return decide(req, env);
    if (p === "/api/admin/members" && m === "GET") {
      const { results } = await env.MDB.prepare("SELECT name, email, phone, do_id, member_until, created_at FROM users ORDER BY member_until DESC, created_at DESC LIMIT 500").all();
      return json({ members: results });
    }
    if (p === "/api/admin/bids" && m === "GET") {
      const { results } = await env.MDB.prepare("SELECT b.item, b.amount, b.created_at, u.name, u.email, u.phone, u.do_id FROM bids b JOIN users u ON u.id = b.user_id ORDER BY b.amount DESC LIMIT 200").all();
      return json({ bids: results });
    }
  }
  return json({ error: "Not found" }, 404);
}

export async function handleMembership(req, env) {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/api/m/")) return null;
  const origin = req.headers.get("origin");
  if (req.method !== "GET" && origin && origin !== url.origin) return json({ error: "Forbidden" }, 403);
  try { return await route(req, env, url); }
  catch (e) { return json({ error: "Server error. Please try again." }, 500); }
    }

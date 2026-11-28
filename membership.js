(() => {
  "use strict";
  const S = { user: null, cfg: null, pending: 0 };
  const h = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(kid));
    return e;
  };
  const api = async (path, body) => {
    const r = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Something went wrong. Try again.");
    return d;
  };

  let dlg = null;
  const closeModal = () => { if (dlg) dlg.close(); };
  const modal = (title, ...body) => {
    closeModal();
    const me = h("dialog", { class: "dm-dlg" },
      h("button", { class: "dm-x", "aria-label": "Close", onclick: closeModal }, "×"),
      h("h3", {}, title), ...body);
    me.addEventListener("click", (e) => { if (e.target === me) me.close(); });
    me.addEventListener("close", () => { me.remove(); if (dlg === me) dlg = null; });
    dlg = me;
    document.body.append(me);
    me.showModal();
  };

  function openAuth(mode = "signup", after) {
    const signup = mode === "signup";
    const msg = h("p", { class: "dm-msg" });
    const field = (name, label, type, extra = {}) => h("label", {}, label, h("input", { name, type, ...extra }));
    const form = h("form", {
      onsubmit: async (e) => {
        e.preventDefault();
        msg.textContent = "";
        try {
          await api(signup ? "/api/m/signup" : "/api/m/login", Object.fromEntries(new FormData(form)));
          await refresh();
          closeModal();
          after ? after() : (window.openAccount && window.openAccount());
        } catch (err) { msg.textContent = err.message; }
      },
    },
      signup ? field("name", "Full name", "text", { required: "", autocomplete: "name" }) : null,
      field("email", "Email", "email", { required: "", autocomplete: "email" }),
      signup ? field("phone", "Phone (optional)", "tel", { autocomplete: "tel" }) : null,
      field("password", "Password (min 8)", "password", { required: "", minlength: "8", autocomplete: signup ? "new-password" : "current-password" }),
      h("button", { class: "dm-btn", type: "submit" }, signup ? "CREATE MY DO ID" : "LOG IN"), msg);
    modal(signup ? "BECOME A DO MEMBER" : "WELCOME BACK", form,
      h("button", { class: "dm-link", type: "button", onclick: () => openAuth(signup ? "login" : "signup", after) },
        signup ? "Already have a DO ID? Log in" : "New here? Create your DO ID"));
  }

  function cardEl() {
    const u = S.user;
    const CARD = { site: "desiofficials.com", mail: "desiofficials2@gmail.com" };
    const since = new Date(u.since || Date.now()).toLocaleDateString("en-IN", { month: "short", year: "numeric" }).toUpperCase();
    const line = u.active ? `MEMBER SINCE · ${since}` : (u.member_until ? "MEMBERSHIP EXPIRED" : "JOIN TO ACTIVATE");
    return h("div", { class: "dm-card" },
      h("div", { class: "dm-card-top" }, h("span", {}, "DESI OFFICIALS"), h("span", { class: "dm-card-tag" }, "♛ MEMBER IDENTITY")),
      h("div", { class: "dm-card-mid" },
        h("div", { class: "dm-card-logo" }, h("img", { src: "assets/images/do-logo.png", alt: "DO" }), h("small", {}, "DESI OFFICIALS")),
        h("div", {}, h("div", { class: "dm-card-name" }, u.name), h("div", { class: "dm-card-id" }, u.do_id), h("div", { class: "dm-card-since" }, line))),
      h("div", { class: "dm-card-bot" }, h("span", {}, "🌐 " + CARD.site), h("span", {}, "✉ " + CARD.mail)),
      h("div", { class: "dm-card-fine" }, "BEYOND FASHION."));
  }

  const loadQR = () => window.QRCode ? Promise.resolve() : new Promise((res, rej) => {
    const s = h("script", { src: "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js" });
    s.onload = res; s.onerror = rej; document.head.append(s);
  });

  function openPay(key) {
    const plan = S.cfg.plans[key];
    const note = encodeURIComponent(`${S.user.do_id} ${plan.label}`);
    const upi = `upi://pay?pa=${S.cfg.upi_id}&pn=${encodeURIComponent(S.cfg.payee)}&am=${plan.price}&cu=INR&tn=${note}`;
    const canvas = h("canvas", { class: "dm-qr", width: "220", height: "220" });
    const msg = h("p", { class: "dm-msg" });
    const utr = h("input", { name: "utr", placeholder: "UPI transaction / UTR number", maxlength: "22", required: "", autocomplete: "off" });
    const form = h("form", {
      onsubmit: async (e) => {
        e.preventDefault();
        msg.textContent = "";
        try {
          await api("/api/m/pay", { plan: key, utr: utr.value });
          await refresh();
          modal("PAYMENT SUBMITTED",
            h("p", {}, "Thanks! We're verifying your payment. Your membership goes live once it's approved, usually within a few hours."),
            h("button", { class: "dm-btn", onclick: closeModal }, "DONE"));
        } catch (err) { msg.textContent = err.message; }
      },
    }, h("label", {}, "After paying, enter your UTR / transaction ID", utr),
      h("button", { class: "dm-btn", type: "submit" }, "SUBMIT PAYMENT"), msg);
    modal(`${plan.label} · ₹${plan.price}`,
      h("p", { class: "dm-dim" }, "Pay with any UPI app (GPay, PhonePe, Paytm, BHIM)."),
      canvas,
      h("a", { class: "dm-btn dm-mobile", href: upi }, `OPEN UPI APP · PAY ₹${plan.price}`),
      h("p", { class: "dm-upi" }, `UPI ID: ${S.cfg.upi_id}`),
      form);
    loadQR().then(() => window.QRCode.toCanvas(canvas, upi, { width: 220, margin: 1 })).catch(() => canvas.remove());
  }

  function renderPlans() {
    const wrap = document.querySelector("#membership .wrap");
    if (!wrap) return;
    let box = document.getElementById("do-plans");
    if (!box) { box = h("div", { id: "do-plans", class: "dm-plans" }); wrap.append(box); }
    box.replaceChildren(...Object.entries(S.cfg.plans).map(([key, p]) => {
      const save = S.cfg.plans.m1.price * (p.days >= 365 ? 12 : p.days >= 180 ? 6 : 1) - p.price;
      return h("div", { class: "dm-plan" + (key === "m12" ? " best" : "") },
        key === "m12" ? h("span", { class: "dm-tag" }, "BEST VALUE") : null,
        h("div", { class: "dm-plan-name" }, p.label),
        h("div", { class: "dm-price" }, `₹${p.price}`),
        h("div", { class: "dm-dim" }, save > 0 ? `Save ₹${save}` : "Flexible"),
        h("ul", {}, h("li", {}, "Early access to drops"), h("li", {}, "Unique DOs bidding"), h("li", {}, "Your DO ID & history")),
        h("button", { class: "btn solid", type: "button", style: "width:100%;justify-content:center",
          onclick: () => S.user ? openPay(key) : openAuth("signup", () => openPay(key)) }, "JOIN NOW ↗"));
    }));
  }

  let mcard = null;
  function paintMenu() {
    const menu = document.getElementById("menu");
    const top = menu && menu.querySelector(".top");
    if (!top) return;
    if (!mcard) {
      mcard = h("button", { type: "button", class: "dmc", onclick: () => {
        const x = document.getElementById("menuClose"); if (x) x.click();
        if (window.openAccount) window.openAccount();
      } });
      top.after(mcard);
      menu.querySelectorAll("a").forEach((a, i) => (a.style.animationDelay = i * 0.05 + 0.1 + "s"));
    }
    const u = S.user;
    mcard.replaceChildren(
      h("small", {}, u ? (u.active ? "WELCOME TO THE FREQUENCY" : "MEMBERSHIP EXPIRED") : "WELCOME TO DO"),
      h("b", {}, u ? u.name : "JOIN THE MOVEMENT"),
      h("span", {}, u ? u.do_id + (u.active ? " · MEMBER" : " · RENEW NOW") : "Create your DO ID · early access for members"));
  }

  function paint() {
    window.DOMember = { user: S.user, isMember: !!(S.user && S.user.active) };
    document.dispatchEvent(new CustomEvent("do:member", { detail: window.DOMember }));
    paintMenu();
  }
  async function refresh() {
    const me = await api("/api/m/me");
    S.user = me.user; S.pending = me.pending || 0;
    paint();
  }

  window.DOMembership = {
    openAuth, cardEl,
    logout: async () => { try { await api("/api/m/logout", {}); } catch (e) {} S.user = null; S.pending = 0; paint(); },
  };

  async function init() {
    try { S.cfg = await api("/api/m/plans"); await refresh(); renderPlans(); } catch (e) { paint(); }
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();

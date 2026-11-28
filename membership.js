
(() => {
  "use strict";

  const S = { user: null, cfg: null, pending: 0 };
  let dlg = null;
  let mcard = null;

  const h = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid != null) e.append(kid?.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return e;
  };

  async function api(path, body) {
    const options = { credentials: "same-origin", cache: "no-store" };
    if (body !== undefined) {
      options.method = "POST";
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(body);
    }

    const response = await fetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  function closeModal() {
    if (dlg?.open) dlg.close();
  }

  function modal(title, ...body) {
    closeModal();

    const me = h("dialog", { class: "dm-dlg" },
      h("button", {
        class: "dm-x",
        type: "button",
        "aria-label": "Close",
        onclick: closeModal
      }, "×"),
      h("h3", {}, title),
      ...body
    );

    me.addEventListener("click", e => {
      if (e.target === me) me.close();
    });

    me.addEventListener("close", () => {
      me.remove();
      if (dlg === me) dlg = null;
    });

    dlg = me;
    document.body.append(me);
    me.showModal();
  }

  function openAuth() {
    modal("YOUR DO ID",
      h("p", { class: "dm-dim" },
        "Sign in securely with your Google account to access your DO ID, membership and bidding."
      ),
      h("a", {
        class: "dm-btn",
        href: "/auth/google"
      }, "CONTINUE WITH GOOGLE ↗")
    );
  }

  function cardEl() {
    const u = S.user;
    if (!u) return h("p", {}, "Sign in to view your DO ID.");

    const since = u.since
      ? new Date(u.since).toLocaleDateString("en-IN", {
          month: "short",
          year: "numeric"
        }).toUpperCase()
      : "NEW MEMBER";

    const line = u.active
      ? `MEMBER SINCE · ${since}`
      : u.member_until
        ? "MEMBERSHIP EXPIRED"
        : "JOIN TO ACTIVATE";

    return h("div", { class: "dm-card" },
      h("div", { class: "dm-card-top" },
        h("span", {}, "DESI OFFICIALS"),
        h("span", { class: "dm-card-tag" }, "♛ MEMBER IDENTITY")
      ),
      h("div", { class: "dm-card-mid" },
        h("div", { class: "dm-card-logo" },
          h("img", { src: "assets/images/do-logo.png", alt: "DO" }),
          h("small", {}, "DESI OFFICIALS")
        ),
        h("div", {},
          h("div", { class: "dm-card-name" }, u.name),
          h("div", { class: "dm-card-id" }, u.do_id || "DO ID PENDING"),
          h("div", { class: "dm-card-since" }, line)
        )
      ),
      h("div", { class: "dm-card-bot" },
        h("span", {}, "desiofficials.com"),
        h("span", {}, "desiofficials26@gmail.com")
      ),
      h("div", { class: "dm-card-fine" }, "BEYOND FASHION.")
    );
  }

  function loadQR() {
    if (window.QRCode) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const script = h("script", {
        src: "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"
      });
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  }

  function openPay(key) {
    if (!S.user) return openAuth();

    const plan = S.cfg?.plans?.[key];
    if (!plan) return;

    if (!S.cfg.upi_id) {
      return modal("PAYMENT CONFIGURATION",
        h("p", {}, "Membership UPI payment is not configured yet. Please contact DESI OFFICIALS.")
      );
    }

    const note = encodeURIComponent(`${S.user.do_id} ${plan.label}`);
    const upi = `upi://pay?pa=${encodeURIComponent(S.cfg.upi_id)}&pn=${encodeURIComponent(S.cfg.payee || "DESI OFFICIALS")}&am=${plan.price}&cu=INR&tn=${note}`;

    const canvas = h("canvas", {
      class: "dm-qr",
      width: "220",
      height: "220"
    });

    const msg = h("p", { class: "dm-msg", role: "alert" });
    const utr = h("input", {
      name: "utr",
      placeholder: "UPI transaction / UTR number",
      maxlength: "22",
      required: "",
      autocomplete: "off"
    });

    const form = h("form", {
      onsubmit: async e => {
        e.preventDefault();
        msg.textContent = "";

        try {
          await api("/api/membership/pay", {
            plan: key,
            utr: utr.value.trim()
          });

          await refresh();

          modal("PAYMENT SUBMITTED",
            h("p", {},
              "Your payment reference has been submitted for verification. Your membership activates after approval."
            ),
            h("button", {
              class: "dm-btn",
              type: "button",
              onclick: closeModal
            }, "DONE")
          );
        } catch (error) {
          msg.textContent = error.message;
        }
      }
    },
      h("label", {},
        "UPI transaction reference",
        utr
      ),
      h("button", {
        class: "dm-btn",
        type: "submit"
      }, "SUBMIT PAYMENT"),
      msg
    );

    modal(`${plan.label} · ₹${plan.price}`,
      h("p", { class: "dm-dim" },
        "Pay using GPay, PhonePe, Paytm, BHIM or another UPI app."
      ),
      canvas,
      h("a", {
        class: "dm-btn dm-mobile",
        href: upi
      }, `OPEN UPI APP · PAY ₹${plan.price}`),
      h("p", { class: "dm-upi" }, `UPI ID: ${S.cfg.upi_id}`),
      form
    );

    loadQR()
      .then(() => window.QRCode.toCanvas(canvas, upi, {
        width: 220,
        margin: 1
      }))
      .catch(() => canvas.remove());
  }

  function renderPlans() {
    const wrap = document.querySelector("#membership .wrap");
    if (!wrap || !S.cfg?.plans) return;

    let box = document.getElementById("do-plans");

    if (!box) {
      box = h("div", {
        id: "do-plans",
        class: "dm-plans"
      });
      wrap.append(box);
    }

    box.replaceChildren(
      ...Object.entries(S.cfg.plans).map(([key, plan]) => {
        const months = key === "m12" ? 12 : key === "m6" ? 6 : 1;
        const saving = S.cfg.plans.m1.price * months - plan.price;

        return h("div", {
          class: "dm-plan" + (key === "m12" ? " best" : "")
        },
          key === "m12"
            ? h("span", { class: "dm-tag" }, "BEST VALUE")
            : null,
          h("div", { class: "dm-plan-name" }, plan.label),
          h("div", { class: "dm-price" }, `₹${plan.price}`),
          h("div", { class: "dm-dim" },
            saving > 0 ? `Save ₹${saving}` : "Flexible membership"
          ),
          h("ul", {},
            h("li", {}, "Early access to drops"),
            h("li", {}, "Unique DOs bidding"),
            h("li", {}, "Your DO ID and history")
          ),
          h("button", {
            class: "btn solid",
            type: "button",
            style: "width:100%;justify-content:center",
            onclick: () => S.user
              ? openPay(key)
              : openAuth()
          }, "JOIN NOW ↗")
        );
      })
    );
  }

  function paintMenu() {
    const menu = document.getElementById("menu");
    const top = menu?.querySelector(".top");
    if (!top) return;

    if (!mcard) {
      mcard = h("button", {
        type: "button",
        class: "dmc",
        onclick: () => {
          document.getElementById("menuClose")?.click();
          window.openAccount?.();
        }
      });

      top.after(mcard);

      menu.querySelectorAll("a").forEach((a, i) => {
        a.style.animationDelay = `${i * 0.05 + 0.1}s`;
      });
    }

    const u = S.user;

    mcard.replaceChildren(
      h("small", {},
        u
          ? u.active ? "WELCOME TO THE FREQUENCY" : "MEMBERSHIP INACTIVE"
          : "WELCOME TO DO"
      ),
      h("b", {}, u ? u.name : "JOIN THE MOVEMENT"),
      h("span", {},
        u
          ? `${u.do_id || "DO ID"} · ${u.active ? "MEMBER" : "VIEW MEMBERSHIP"}`
          : "Sign in with Google · create your DO ID"
      )
    );
  }

  function paint() {
    window.DOMember = {
      user: S.user,
      isMember: !!(S.user && S.user.active)
    };

    document.dispatchEvent(
      new CustomEvent("do:member", {
        detail: window.DOMember
      })
    );

    paintMenu();
  }

  async function refresh() {
    try {
      const me = await api("/api/me");
      const membership = await api("/api/membership");

      const customer = membership.customer || {};
      const paid = membership.membership || {};
      const active = paid.status === "ACTIVE" &&
        (!paid.expires_at || new Date(paid.expires_at).getTime() > Date.now());

      S.user = {
        name: customer.name || me.user?.name || "DO Member",
        email: customer.email || me.user?.email || "",
        do_id: customer.member_id || "",
        active,
        since: paid.joined_at || customer.created_at || "",
        member_until: paid.expires_at || "",
        phone: customer.phone || "",
        picture: customer.profile_photo || me.user?.picture || ""
      };

      S.pending = Number(membership.pending_payments || 0);
    } catch (error) {
      S.user = null;
      S.pending = 0;
    }

    paint();
    return S.user;
  }

  window.DOMembership = {
    openAuth,
    cardEl,
    refresh,

    logout: async () => {
      try {
        await api("/auth/logout", {});
      } finally {
        S.user = null;
        S.pending = 0;
        paint();
      }
    }
  };

  async function init() {
    try {
      const config = await api("/api/membership/plans");
      S.cfg = {
        ...config,
        plans: config.plans || {}
      };
      await refresh();
      renderPlans();
    } catch (error) {
      console.error("DO membership:", error);
      paint();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

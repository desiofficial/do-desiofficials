(() => {
  "use strict";

  const S = { user: null, cfg: null, pending: 0 };
  const IG_URL = "https://www.instagram.com/desi_officials/";
  const IG_HANDLE_KEY = "do-instagram-handle";
  const IG_PENDING_KEY = "do-instagram-join-pending";

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
      if (kid != null) {
        e.append(kid?.nodeType ? kid : document.createTextNode(String(kid)));
      }
    }

    return e;
  };

  async function api(path, body) {
    const options = {
      credentials: "same-origin",
      cache: "no-store"
    };

    if (body !== undefined) {
      options.method = "POST";
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(body);
    }

    const response = await fetch(path, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }

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

  function messageBox() {
    return h("p", {
      class: "dm-msg",
      role: "alert",
      style: "color:#d7ff3a;margin-top:12px"
    });
  }

  /* ================================
     LOGIN
  ================================= */

  function openAuth() {
    modal("YOUR DO ID",
      h("p", { class: "dm-dim" },
        "Join DESI OFFICIALS and create your personal DO identity."
      ),

      h("a", {
        class: "dm-btn",
        href: "/auth/google",
        style: "display:block;text-align:center;margin:18px 0"
      }, "CONTINUE WITH GOOGLE ↗"),

      h("div", {
        style: "border-top:1px solid #292929;padding-top:18px"
      },
        h("p", {
          style: "font-size:12px;letter-spacing:2px;color:#d7ff3a;margin-bottom:12px"
        }, "JOIN THROUGH INSTAGRAM"),

        h("button", {
          class: "dm-btn",
          type: "button",
          style: "width:100%",
          onclick: startInstagramJoin
        }, "INSTAGRAM JOIN ↗")
      ),

      h("p", {
        class: "dm-dim",
        style: "font-size:11px;margin-top:16px"
      }, "Instagram onboarding uses your voluntarily supplied username. Google securely verifies your DO account.")
    );
  }

  function startInstagramJoin() {
    const username = h("input", {
      type: "text",
      placeholder: "@yourusername",
      autocomplete: "off",
      maxlength: "30",
      required: ""
    });

    const msg = messageBox();

    const continueButton = h("button", {
      class: "dm-btn",
      type: "button",
      style: "width:100%;margin-top:12px"
    }, "OPEN DO INSTAGRAM ↗");

    continueButton.addEventListener("click", () => {
      const handle = username.value
        .trim()
        .replace(/^@/, "")
        .toLowerCase();

      if (!/^[a-z0-9._]{1,30}$/.test(handle)) {
        msg.textContent = "Enter a valid Instagram username.";
        return;
      }

      localStorage.setItem(IG_HANDLE_KEY, handle);

      modal("FOLLOW DESI OFFICIALS",
        h("p", { class: "dm-dim" },
          "Follow our official Instagram profile, then return here."
        ),

        h("p", {
          style: "color:#d7ff3a;font-weight:800;margin:16px 0"
        }, "@desi_officials"),

        h("a", {
          class: "dm-btn",
          href: IG_URL,
          target: "_blank",
          rel: "noopener noreferrer",
          style: "display:block;text-align:center"
        }, "FOLLOW DESI OFFICIALS ↗"),

        h("button", {
          class: "dm-btn",
          type: "button",
          style: "width:100%;margin-top:12px"
        }, "I'VE FOLLOWED — CONTINUE")
      );

      const buttons = dlg.querySelectorAll("button.dm-btn");
      const confirm = buttons[buttons.length - 1];

      confirm.addEventListener("click", completeInstagramJoin);
    });

    modal("INSTAGRAM JOIN",
      h("p", { class: "dm-dim" },
        "Enter your Instagram username."
      ),
      h("label", {}, "INSTAGRAM USERNAME", username),
      continueButton,
      msg
    );
  }

  async function completeInstagramJoin() {
    const handle = localStorage.getItem(IG_HANDLE_KEY);

    if (!handle) {
      return startInstagramJoin();
    }

    closeModal();

    if (!S.user) {
      localStorage.setItem(IG_PENDING_KEY, "1");
      location.href = "/auth/google";
      return;
    }

    try {
      await createDOIdentity();
      await refresh();

      modal("WELCOME TO DESI OFFICIALS",
        h("p", { class: "dm-dim" },
          "Your DO identity has been created."
        ),
        h("button", {
          class: "dm-btn",
          type: "button",
          onclick: () => {
            closeModal();
            document.getElementById("acctBtn")?.click();
          }
        }, "VIEW MY DO ID ↗")
      );

    } catch (error) {
      modal("PLEASE TRY AGAIN",
        h("p", { class: "dm-msg" }, error.message)
      );
    }
  }

  async function createDOIdentity() {
    return api("/api/membership/join", {});
  }

  /* ================================
     DO ID CARD IMAGE
  ================================= */

  function makeCardCanvas() {
    const u = S.user || {};
    const canvas = document.createElement("canvas");

    canvas.width = 1200;
    canvas.height = 700;

    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, 1200, 700);

    ctx.strokeStyle = "#d7ff3a";
    ctx.lineWidth = 5;
    ctx.strokeRect(25, 25, 1150, 650);

    ctx.fillStyle = "#d7ff3a";
    ctx.font = "bold 54px Arial";
    ctx.fillText("DO", 75, 115);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px Arial";
    ctx.fillText("DESI OFFICIALS", 190, 110);

    ctx.fillStyle = "#d7ff3a";
    ctx.font = "bold 22px Arial";
    ctx.fillText("MEMBER IDENTITY", 75, 190);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 58px Arial";
    ctx.fillText(String(u.name || "DO MEMBER").toUpperCase().slice(0, 24), 75, 310);

    ctx.fillStyle = "#d7ff3a";
    ctx.font = "bold 38px Arial";
    ctx.fillText(u.do_id || "DO ID PENDING", 75, 385);

    ctx.fillStyle = "#ffffff";
    ctx.font = "26px Arial";
    ctx.fillText("MEMBER SINCE", 75, 475);

    ctx.fillStyle = "#aaaaaa";
    ctx.font = "26px Arial";
    ctx.fillText(
      u.since
        ? new Date(u.since).toLocaleDateString("en-IN")
        : "NEW MEMBER",
      300, 475
    );

    const handle = localStorage.getItem(IG_HANDLE_KEY);

    if (handle) {
      ctx.fillStyle = "#d7ff3a";
      ctx.font = "25px Arial";
      ctx.fillText("INSTAGRAM  @" + handle, 75, 550);
    }

    ctx.fillStyle = "#d7ff3a";
    ctx.font = "bold 28px Arial";
    ctx.fillText("BEYOND FASHION.", 75, 625);

    ctx.fillStyle = "#aaaaaa";
    ctx.font = "20px Arial";
    ctx.fillText("desiofficials.com", 900, 625);

    return canvas;
  }

  function downloadCard() {
    const canvas = makeCardCanvas();

    canvas.toBlob(blob => {
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = `DO-ID-${S.user?.do_id || "MEMBER"}.png`;

      document.body.append(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    }, "image/png");
  }

  async function shareCard() {
    const canvas = makeCardCanvas();

    canvas.toBlob(async blob => {
      if (!blob) return;

      const file = new File(
        [blob],
        `DO-ID-${S.user?.do_id || "MEMBER"}.png`,
        { type: "image/png" }
      );

      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({
            files: [file],
            title: "My DO Identity",
            text: "My DESI OFFICIALS identity. Beyond Fashion."
          });
        } catch (error) {
          if (error.name !== "AbortError") downloadCard();
        }
      } else {
        downloadCard();
      }
    }, "image/png");
  }

  function printCard() {
    const canvas = makeCardCanvas();
    const image = canvas.toDataURL("image/png");

    const win = window.open("", "_blank");

    if (!win) {
      downloadCard();
      return;
    }

    win.document.write(`
      <!doctype html>
      <html>
      <head>
        <title>DO Member ID</title>
        <style>
          body {
            background:#fff;
            margin:30px;
            text-align:center;
          }
          img {
            width:100%;
            max-width:900px;
          }
          @media print {
            button { display:none }
          }
        </style>
      </head>
      <body>
        <img src="${image}" alt="DESI OFFICIALS member ID">
        <br><br>
        <button onclick="window.print()">SAVE AS PDF / PRINT</button>
      </body>
      </html>
    `);

    win.document.close();
  }

  /* ================================
     MEMBER CARD
  ================================= */

  function cardEl() {
    const u = S.user;

    if (!u) {
      return h("p", {}, "Sign in to view your DO ID.");
    }

    const since = u.since
      ? new Date(u.since).toLocaleDateString("en-IN", {
          month: "short",
          year: "numeric"
        }).toUpperCase()
      : "NEW MEMBER";

    const handle = localStorage.getItem(IG_HANDLE_KEY);

    const card = h("div", { class: "dm-card" },
      h("div", { class: "dm-card-top" },
        h("span", {}, "DESI OFFICIALS"),
        h("span", { class: "dm-card-tag" }, "♛ MEMBER IDENTITY")
      ),

      h("div", { class: "dm-card-mid" },
        h("div", { class: "dm-card-logo" },
          h("div", {
            style: "font-size:40px;font-weight:900;color:#d7ff3a"
          }, "DO"),
          h("small", {}, "DESI OFFICIALS")
        ),

        h("div", {},
          h("div", { class: "dm-card-name" }, u.name),
          h("div", { class: "dm-card-id" }, u.do_id || "DO ID PENDING"),
          h("div", { class: "dm-card-since" },
            u.active ? `MEMBER SINCE · ${since}` : "DO ID CREATED"
          ),
          handle
            ? h("div", {
                style: "font-size:11px;color:#d7ff3a;margin-top:7px"
              }, "INSTAGRAM · @" + handle)
            : null
        )
      ),

      h("div", { class: "dm-card-bot" },
        h("span", {}, "desiofficials.com"),
        h("span", {}, "desiofficials26@gmail.com")
      ),

      h("div", { class: "dm-card-fine" }, "BEYOND FASHION.")
    );

    const actions = h("div", {
      style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:16px"
    },
      h("button", {
        class: "dm-btn",
        type: "button",
        onclick: downloadCard
      }, "DOWNLOAD PNG"),

      h("button", {
        class: "dm-btn",
        type: "button",
        onclick: printCard
      }, "SAVE PDF"),

      h("button", {
        class: "dm-btn",
        type: "button",
        onclick: shareCard
      }, "SHARE ID ↗")
    );

    return h("div", { class: "dm-card-wrap" }, card, actions);
  }

  /* ================================
     QR PAYMENT
  ================================= */

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
        h("p", {},
          "Membership UPI payment is not configured yet. Please contact DESI OFFICIALS."
        )
      );
    }

    const note = encodeURIComponent(`${S.user.do_id} ${plan.label}`);

    const upi = `upi://pay?pa=${encodeURIComponent(S.cfg.upi_id)}&pn=${encodeURIComponent(S.cfg.payee || "DESI OFFICIALS")}&am=${plan.price}&cu=INR&tn=${note}`;

    const canvas = h("canvas", {
      class: "dm-qr",
      width: "220",
      height: "220"
    });

    const msg = messageBox();

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
      h("label", {}, "UPI transaction reference", utr),

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

  /* ================================
     MEMBERSHIP PLANS
  ================================= */

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

  /* ================================
     MENU
  ================================= */

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
          document.getElementById("acctBtn")?.click();
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
          ? u.active
            ? "WELCOME TO THE FREQUENCY"
            : "DO ID CREATED"
          : "WELCOME TO DO"
      ),

      h("b", {}, u ? u.name : "JOIN THE MOVEMENT"),

      h("span", {},
        u
          ? `${u.do_id || "DO ID"} · ${u.active ? "MEMBER" : "VIEW MEMBERSHIP"}`
          : "Google login · Instagram join"
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

  /* ================================
     LOAD CUSTOMER
  ================================= */

  async function refresh() {
    try {
      const me = await api("/api/me");

      let membership = await api("/api/membership");

      /*
       * Complete a pending Instagram join only after
       * Google has securely authenticated the customer.
       */

      if (
        localStorage.getItem(IG_PENDING_KEY) === "1"
      ) {
        await createDOIdentity();

        localStorage.removeItem(IG_PENDING_KEY);

        membership = await api("/api/membership");
      }

      const customer = membership.customer || {};
      const paid = membership.membership || {};

      const active = paid.status === "ACTIVE" &&
        (!paid.expires_at ||
          new Date(paid.expires_at).getTime() > Date.now());

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

  /* ================================
     STARTUP
  ================================= */

  async function init() {
    try {
      const config = await api("/api/membership/plans");

      S.cfg = {
        ...config,
        plans: config.plans || {}
      };

      await refresh();

      renderPlans();

      if (
        location.hash === "#account" &&
        S.user
      ) {
        document.getElementById("acctBtn")?.click();
      }

    } catch (error) {
      console.error("DO membership:", error);
      paint();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {
      once: true
    });
  } else {
    init();
  }

})();

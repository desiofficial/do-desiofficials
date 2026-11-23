const REDIRECT_URI =
  "https://do-desiofficials.desioficials.workers.dev/auth/google/callback";

const ADMIN_EMAILS = [
  "desioficials@gmail.com",
  "desiofficials26@gmail.com"
];

const SESSION_COOKIE = "do_session";
const STATE_COOKIE = "do_oauth_state";

const SESSION_DURATION = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();

/* =========================================
   SECURITY HELPERS
========================================= */

function base64url(data) {
  const bytes = data instanceof Uint8Array
    ? data
    : new Uint8Array(data);

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64url(value) {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded = normalized.padEnd(
    Math.ceil(normalized.length / 4) * 4,
    "="
  );

  return Uint8Array.from(
    atob(padded),
    char => char.charCodeAt(0)
  );
}

function randomString(length = 32) {
  return base64url(
    crypto.getRandomValues(new Uint8Array(length))
  );
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";

  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");

    if (separator === -1) continue;

    const key = item.slice(0, separator).trim();

    if (key === name) {
      return item.slice(separator + 1).trim();
    }
  }

  return null;
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

/* =========================================
   SESSION MANAGEMENT
========================================= */

async function getSigningKey(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new Error("Session configuration unavailable");
  }

  return crypto.subtle.importKey(
    "raw",
    encoder.encode(env.SESSION_SECRET),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign", "verify"]
  );
}

async function createSession(user, env) {
  const payload = {
    email: user.email,
    name: user.name || "",
    picture: user.picture || "",
    exp: Math.floor(Date.now() / 1000) + SESSION_DURATION
  };

  const encoded = base64url(
    encoder.encode(JSON.stringify(payload))
  );

  const key = await getSigningKey(env);

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(encoded)
  );

  return `${encoded}.${base64url(signature)}`;
}

async function verifySession(token, env) {
  if (!token) return null;

  try {
    const parts = token.split(".");

    if (parts.length !== 2) return null;

    const [payload, signature] = parts;

    const key = await getSigningKey(env);

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64url(signature),
      encoder.encode(payload)
    );

    if (!valid) return null;

    const user = JSON.parse(
      new TextDecoder().decode(
        decodeBase64url(payload)
      )
    );

    if (
      !user.exp ||
      user.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return user;

  } catch {
    return null;
  }
}

/* =========================================
   GOOGLE LOGIN
========================================= */

async function googleLogin(env) {
  const state = randomString();

  const googleURL = new URL(
    "https://accounts.google.com/o/oauth2/v2/auth"
  );

  googleURL.searchParams.set(
    "client_id",
    env.GOOGLE_CLIENT_ID
  );

  googleURL.searchParams.set(
    "redirect_uri",
    REDIRECT_URI
  );

  googleURL.searchParams.set(
    "response_type",
    "code"
  );

  googleURL.searchParams.set(
    "scope",
    "openid email profile"
  );

  googleURL.searchParams.set("state", state);
  googleURL.searchParams.set("prompt", "select_account");

  return new Response(null, {
    status: 302,
    headers: {
      "Location": googleURL.toString(),
      "Set-Cookie": cookie(STATE_COOKIE, state, 600)
    }
  });
}

async function googleCallback(request, env) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const savedState = getCookie(request, STATE_COOKIE);

  if (
    !code ||
    !returnedState ||
    !savedState ||
    returnedState !== savedState
  ) {
    return new Response(
      "Invalid login request. Please try again.",
      { status: 400 }
    );
  }

  try {
    const tokenResponse = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code"
        })
      }
    );

    if (!tokenResponse.ok) {
      return new Response(
        "Google login failed. Please try again.",
        { status: 401 }
      );
    }

    const tokens = await tokenResponse.json();

    if (!tokens.id_token) {
      return new Response(
        "Google did not return a valid identity token.",
        { status: 401 }
      );
    }

    const verifyURL = new URL(
      "https://oauth2.googleapis.com/tokeninfo"
    );

    verifyURL.searchParams.set("id_token", tokens.id_token);

    const verificationResponse = await fetch(verifyURL);

    if (!verificationResponse.ok) {
      return new Response(
        "Google identity verification failed.",
        { status: 401 }
      );
    }

    const googleUser = await verificationResponse.json();

    const validIssuer = [
      "accounts.google.com",
      "https://accounts.google.com"
    ].includes(googleUser.iss);

    const validAudience =
      googleUser.aud === env.GOOGLE_CLIENT_ID;

    const validExpiry =
      Number(googleUser.exp) >
      Math.floor(Date.now() / 1000);

    const verifiedEmail =
      googleUser.email_verified === true ||
      googleUser.email_verified === "true";

    if (
      !validIssuer ||
      !validAudience ||
      !validExpiry ||
      !verifiedEmail ||
      !googleUser.email
    ) {
      return new Response(
        "Google account verification failed.",
        { status: 401 }
      );
    }

    const email = googleUser.email.toLowerCase();

    if (!ADMIN_EMAILS.includes(email)) {
      return new Response(
        "Access denied. This account is not an authorized DO administrator.",
        { status: 403 }
      );
    }

    const session = await createSession({
      email,
      name: googleUser.name || "",
      picture: googleUser.picture || ""
    }, env);

    const headers = new Headers();

    headers.set("Location", "/");

    headers.append(
      "Set-Cookie",
      cookie(SESSION_COOKIE, session, SESSION_DURATION)
    );

    headers.append(
      "Set-Cookie",
      cookie(STATE_COOKIE, "", 0)
    );

    return new Response(null, {
      status: 302,
      headers
    });

  } catch {
    return new Response(
      "Login could not be completed. Please try again.",
      { status: 500 }
    );
  }
}

/* =========================================
   DO BRAND + HEADER FIX
========================================= */

const DO_HEADER_FIX = `
<style>

/* -----------------------------------------
   INLINE DO LOGO
----------------------------------------- */

.do-inline-logo {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  text-decoration: none;
  color: #d0b98d;
  line-height: 1;
}

.do-inline-logo svg {
  display: block;
  width: 100px;
  height: 43px;
  overflow: visible;
}

.do-inline-logo .do-name {
  color: #f5f2eb;
  font-family: "DM Sans", sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 3px;
}

.do-inline-logo .do-tagline {
  color: #ad9160;
  font-family: "DM Sans", sans-serif;
  font-size: 7px;
  letter-spacing: 2px;
}

/* -----------------------------------------
   HEADER BUTTONS
----------------------------------------- */

.menu-button,
.dots-button,
#leftMenuButton,
#rightMenuButton,
#menuToggle {
  cursor: pointer !important;
  pointer-events: auto !important;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  position: relative;
  z-index: 10002;
}

/* -----------------------------------------
   DRAWER BACKDROP
----------------------------------------- */

.drawer-backdrop,
#drawerBackdrop {
  position: fixed !important;
  inset: 0 !important;
  z-index: 10000 !important;
  background: rgba(0, 0, 0, .72) !important;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity .3s ease,
    visibility .3s ease;
}

.drawer-backdrop.is-visible,
#drawerBackdrop.is-visible {
  opacity: 1 !important;
  visibility: visible !important;
  pointer-events: auto !important;
}

/* -----------------------------------------
   LEFT DRAWER
----------------------------------------- */

.left-drawer,
#leftDrawer {
  position: fixed !important;
  top: 0 !important;
  bottom: 0 !important;
  left: 0 !important;
  z-index: 10001 !important;
  transform: translateX(-105%);
  transition: transform .35s ease;
  visibility: visible;
  pointer-events: auto;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.left-drawer.is-open,
#leftDrawer.is-open {
  transform: translateX(0) !important;
}

/* -----------------------------------------
   RIGHT DRAWER
----------------------------------------- */

.right-drawer,
#rightDrawer {
  position: fixed !important;
  top: 0 !important;
  bottom: 0 !important;
  right: 0 !important;
  left: auto !important;
  z-index: 10001 !important;
  transform: translateX(105%);
  transition: transform .35s ease;
  visibility: visible;
  pointer-events: auto;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.right-drawer.is-open,
#rightDrawer.is-open {
  transform: translateX(0) !important;
}

/* -----------------------------------------
   PAGE SCROLL LOCK
----------------------------------------- */

body.do-drawer-open {
  overflow: hidden !important;
  touch-action: none;
}

@media (prefers-reduced-motion: reduce) {
  .left-drawer,
  .right-drawer,
  .drawer-backdrop {
    transition: none !important;
  }
}

</style>

<script>
(function () {
  "use strict";

  function initDOHeader() {

    /* =====================================
       LOGO REPLACEMENT
    ===================================== */

    const logoMarkup = \`
      <span class="do-inline-logo" aria-label="DO Desi Officials">
        <svg viewBox="0 0 180 65" role="img" aria-label="DO">
          <text x="4" y="52"
            font-family="Georgia, serif"
            font-size="57"
            font-weight="bold"
            fill="#d0b98d">D</text>
          <text x="72" y="52"
            font-family="Georgia, serif"
            font-size="57"
            font-weight="bold"
            fill="#f5f2eb">O</text>
          <path d="M8 59 H170"
            stroke="#ad9160"
            stroke-width="1"/>
        </svg>
        <span class="do-name">DESI OFFICIALS</span>
        <span class="do-tagline">DISTINCTIVE BY DESIGN</span>
      </span>
    \`;

    document.querySelectorAll(
      'img[alt*="DO Desi Officials" i]'
    ).forEach(function (oldLogo) {

      const wrapper = document.createElement("span");
      wrapper.innerHTML = logoMarkup;

      oldLogo.replaceWith(wrapper.firstElementChild);
    });

    /* =====================================
       FIND ACTUAL DRAWER ELEMENTS
    ===================================== */

    const leftDrawer = document.querySelector(
      ".left-drawer, #leftDrawer"
    );

    const rightDrawer = document.querySelector(
      ".right-drawer, #rightDrawer"
    );

    const backdrop = document.querySelector(
      ".drawer-backdrop, #drawerBackdrop"
    );

    const leftButton = document.querySelector(
      ".menu-button, #leftMenuButton, #menuToggle"
    );

    const rightButton = document.querySelector(
      ".dots-button, #rightMenuButton"
    );

    if (!leftDrawer || !rightDrawer || !backdrop) {
      console.error(
        "DO header: drawer elements not found.",
        { leftDrawer, rightDrawer, backdrop }
      );
      return;
    }

    /* =====================================
       CLOSE BOTH DRAWERS
    ===================================== */

    function closeDrawers() {

      leftDrawer.classList.remove("is-open");
      rightDrawer.classList.remove("is-open");

      backdrop.classList.remove("is-visible");

      document.body.classList.remove("do-drawer-open");

      leftButton?.setAttribute("aria-expanded", "false");
      rightButton?.setAttribute("aria-expanded", "false");
    }

    /* =====================================
       OPEN ONE DRAWER
    ===================================== */

    function openDrawer(drawer, button) {

      closeDrawers();

      drawer.classList.add("is-open");

      backdrop.classList.add("is-visible");

      document.body.classList.add("do-drawer-open");

      button?.setAttribute("aria-expanded", "true");
    }

    /* =====================================
       LEFT THREE-LINE BUTTON
    ===================================== */

    if (leftButton) {

      leftButton.setAttribute(
        "aria-controls",
        leftDrawer.id || "leftDrawer"
      );

      leftButton.setAttribute(
        "aria-expanded",
        "false"
      );

      leftButton.addEventListener(
        "click",
        function (event) {

          event.preventDefault();
          event.stopPropagation();

          if (leftDrawer.classList.contains("is-open")) {
            closeDrawers();
          } else {
            openDrawer(leftDrawer, leftButton);
          }

        },
        true
      );
    }

    /* =====================================
       RIGHT THREE-DOT BUTTON
    ===================================== */

    if (rightButton) {

      rightButton.setAttribute(
        "aria-controls",
        rightDrawer.id || "rightDrawer"
      );

      rightButton.setAttribute(
        "aria-expanded",
        "false"
      );

      rightButton.addEventListener(
        "click",
        function (event) {

          event.preventDefault();
          event.stopPropagation();

          if (rightDrawer.classList.contains("is-open")) {
            closeDrawers();
          } else {
            openDrawer(rightDrawer, rightButton);
          }

        },
        true
      );
    }

    /* =====================================
       BACKDROP CLOSE
    ===================================== */

    backdrop.addEventListener("click", function () {
      closeDrawers();
    });

    /* =====================================
       DRAWER CLOSE BUTTONS
    ===================================== */

    document.querySelectorAll(
      ".drawer-close, [data-close-drawers], [data-close-drawer]"
    ).forEach(function (button) {

      button.addEventListener("click", function (event) {
        event.preventDefault();
        closeDrawers();
      });

    });

    /* =====================================
       ESCAPE KEY
    ===================================== */

    document.addEventListener("keydown", function (event) {

      if (event.key === "Escape") {
        closeDrawers();
      }

    });

    /* =====================================
       NAVIGATION LINKS
    ===================================== */

    document.querySelectorAll(
      ".left-drawer a, .right-drawer a, #leftDrawer a, #rightDrawer a"
    ).forEach(function (link) {

      link.addEventListener("click", function () {
        closeDrawers();
      });

    });

    console.log("DO header successfully initialized.");
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initDOHeader
    );
  } else {
    initDOHeader();
  }

})();
</script>
`;

/* =========================================
   HTML ENHANCEMENT
========================================= */

async function serveSite(request, env) {

  const response = await env.ASSETS.fetch(request);

  const contentType =
    response.headers.get("Content-Type") || "";

  if (!contentType.includes("text/html")) {
    return response;
  }

  const html = await response.text();

  const enhancedHTML = html.includes("</body>")
    ? html.replace(
        "</body>",
        DO_HEADER_FIX + "</body>"
      )
    : html + DO_HEADER_FIX;

  const headers = new Headers(response.headers);

  headers.delete("Content-Length");
  headers.delete("Content-Encoding");

  return new Response(enhancedHTML, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

/* =========================================
   MAIN CLOUDFLARE WORKER
========================================= */

export default {

  async fetch(request, env) {

    const url = new URL(request.url);

    /* STATUS */

    if (url.pathname === "/api/status") {

      return Response.json({
        brand: "DO DESI OFFICIALS",
        status: "online"
      });

    }

    /* DATABASE CHECK */

    if (url.pathname === "/api/db-check") {

      try {

        const result = await env.DB.prepare(
          "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table'"
        ).first();

        return Response.json({
          database: "connected",
          tables: result.total
        });

      } catch {

        return Response.json({
          database: "error",
          message: "Database connection failed"
        }, { status: 500 });

      }

    }

    /* GOOGLE LOGIN */

    if (url.pathname === "/auth/google") {

      if (
        !env.GOOGLE_CLIENT_ID ||
        !env.GOOGLE_CLIENT_SECRET
      ) {

        return new Response(
          "Google login configuration is incomplete.",
          { status: 500 }
        );

      }

      return googleLogin(env);

    }

    /* GOOGLE CALLBACK */

    if (url.pathname === "/auth/google/callback") {

      return googleCallback(request, env);

    }

    /* CURRENT USER */

    if (url.pathname === "/api/me") {

      const token = getCookie(request, SESSION_COOKIE);

      const user = await verifySession(token, env);

      if (!user) {

        return Response.json({
          authenticated: false
        }, { status: 401 });

      }

      return Response.json({

        authenticated: true,

        user: {
          email: user.email,
          name: user.name,
          picture: user.picture
        },

        admin: ADMIN_EMAILS.includes(user.email)

      });

    }

    /* LOGOUT */

    if (url.pathname === "/auth/logout") {

      return new Response(null, {

        status: 302,

        headers: {
          "Location": "/",
          "Set-Cookie": cookie(SESSION_COOKIE, "", 0)
        }

      });

    }

    /* WEBSITE */

    return serveSite(request, env);

  }

};

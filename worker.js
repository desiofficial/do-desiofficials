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

/* =========================================
   SESSION MANAGEMENT
========================================= */

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
   GOOGLE AUTHENTICATION
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

    verifyURL.searchParams.set(
      "id_token",
      tokens.id_token
    );

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
   DO LOGO + DRAWER ENHANCEMENTS
========================================= */

const DO_ENHANCEMENTS = `
<style>
/* DO INLINE LOGO */

.do-worker-logo {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 2px !important;
  text-decoration: none !important;
  color: #d0b98d !important;
  line-height: 1 !important;
}

.do-worker-logo svg {
  width: 100px;
  height: 48px;
  display: block;
}

.do-worker-logo-name {
  font-family: "DM Sans", sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 3px;
  color: #f5f2eb;
}

.do-worker-logo-tagline {
  font-family: "DM Sans", sans-serif;
  font-size: 7px;
  letter-spacing: 2px;
  color: #ad9160;
}

/* DRAWER BACKDROP */

#drawerBackdrop {
  position: fixed !important;
  inset: 0 !important;
  z-index: 9998 !important;
  background: rgba(0,0,0,.72) !important;
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
  transition: opacity .3s ease, visibility .3s ease !important;
}

#drawerBackdrop.is-visible {
  opacity: 1 !important;
  visibility: visible !important;
  pointer-events: auto !important;
}

/* DRAWERS */

#leftDrawer,
#rightDrawer {
  position: fixed !important;
  top: 0 !important;
  bottom: 0 !important;
  z-index: 9999 !important;
  transition: transform .35s ease !important;
  visibility: visible;
}

#leftDrawer {
  left: 0 !important;
  transform: translateX(-110%) !important;
}

#rightDrawer {
  right: 0 !important;
  transform: translateX(110%) !important;
}

#leftDrawer.is-open,
#rightDrawer.is-open {
  transform: translateX(0) !important;
}

body.do-drawer-open {
  overflow: hidden !important;
}

@media (prefers-reduced-motion: reduce) {
  #leftDrawer,
  #rightDrawer,
  #drawerBackdrop {
    transition: none !important;
  }
}
</style>

<script>
(function () {
  "use strict";

  function initDO() {
    const leftButton = document.getElementById("leftMenuButton");
    const rightButton = document.getElementById("rightMenuButton");

    const leftDrawer = document.getElementById("leftDrawer");
    const rightDrawer = document.getElementById("rightDrawer");

    const backdrop = document.getElementById("drawerBackdrop");

    /* INLINE LOGO */

    const logoMarkup = \`
      <a href="#home" class="do-worker-logo" aria-label="DO Desi Officials Home">
        <svg viewBox="0 0 180 90" role="img" aria-label="DO">
          <path d="M8 8 H58 C85 8 101 23 101 45 C101 67 85 82 58 82 H8 Z"
            fill="none" stroke="currentColor" stroke-width="3"/>
          <path d="M55 8 V82" stroke="currentColor" stroke-width="2"/>
          <text x="9" y="60" font-size="48"
            font-family="Georgia,serif" font-weight="bold"
            fill="currentColor">D</text>
          <text x="105" y="60" font-size="48"
            font-family="Georgia,serif" font-weight="bold"
            fill="currentColor">O</text>
        </svg>
        <span class="do-worker-logo-name">DESI OFFICIALS</span>
        <span class="do-worker-logo-tagline">DISTINCTIVE BY DESIGN</span>
      </a>
    \`;

    document.querySelectorAll(
      ".brand-logo-image, .drawer-logo-image, .footer-logo-image"
    ).forEach(function (oldLogo) {
      const replacement = document.createElement("span");
      replacement.innerHTML = logoMarkup;
      oldLogo.replaceWith(replacement.firstElementChild);
    });

    /* DRAWERS */

    if (!leftDrawer || !rightDrawer || !backdrop) {
      console.warn("DO: Drawer HTML elements were not found.");
      return;
    }

    function closeDrawers() {
      leftDrawer.classList.remove("is-open");
      rightDrawer.classList.remove("is-open");
      backdrop.classList.remove("is-visible");

      document.body.classList.remove("do-drawer-open");

      if (leftButton) {
        leftButton.setAttribute("aria-expanded", "false");
      }

      if (rightButton) {
        rightButton.setAttribute("aria-expanded", "false");
      }
    }

    function openDrawer(drawer, button) {
      closeDrawers();

      drawer.classList.add("is-open");
      backdrop.classList.add("is-visible");

      document.body.classList.add("do-drawer-open");

      if (button) {
        button.setAttribute("aria-expanded", "true");
      }
    }

    function bindButton(button, drawer) {
      if (!button) return;

      button.setAttribute("aria-controls", drawer.id);
      button.setAttribute("aria-expanded", "false");

      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();

        if (drawer.classList.contains("is-open")) {
          closeDrawers();
        } else {
          openDrawer(drawer, button);
        }
      }, true);
    }

    bindButton(leftButton, leftDrawer);
    bindButton(rightButton, rightDrawer);

    backdrop.addEventListener("click", closeDrawers);

    document.querySelectorAll("[data-close-drawer]").forEach(
      function (button) {
        button.addEventListener("click", function (event) {
          event.preventDefault();
          closeDrawers();
        });
      }
    );

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeDrawers();
      }
    });

    document.querySelectorAll(
      "#leftDrawer a, #rightDrawer a"
    ).forEach(function (link) {
      link.addEventListener("click", closeDrawers);
    });

    console.log("DO: Logo and drawer enhancements loaded.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDO);
  } else {
    initDO();
  }
})();
</script>
`;

/* =========================================
   INJECT ENHANCEMENTS INTO EXISTING HTML
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
        DO_ENHANCEMENTS + "</body>"
      )
    : html + DO_ENHANCEMENTS;

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

    /* API STATUS */

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

    /* EXISTING WEBSITE + ENHANCEMENTS */

    return serveSite(request, env);
  }
};

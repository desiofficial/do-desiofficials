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
  const bytes = crypto.getRandomValues(
    new Uint8Array(length)
  );

  return base64url(bytes);
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");

    if (separator === -1) continue;

    const key = cookie.slice(0, separator).trim();

    if (key === name) {
      return cookie.slice(separator + 1).trim();
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

    if (!user.exp || user.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return user;

  } catch {
    return null;
  }
}

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
    return new Response("Invalid login request. Please try again.", {
      status: 400
    });
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
      return new Response("Google login failed. Please try again.", {
        status: 401
      });
    }

    const tokens = await tokenResponse.json();

    if (!tokens.id_token) {
      return new Response("Google did not return a valid identity token.", {
        status: 401
      });
    }

    const verifyURL = new URL(
      "https://oauth2.googleapis.com/tokeninfo"
    );

    verifyURL.searchParams.set("id_token", tokens.id_token);

    const verificationResponse = await fetch(verifyURL);

    if (!verificationResponse.ok) {
      return new Response("Google identity verification failed.", {
        status: 401
      });
    }

    const googleUser = await verificationResponse.json();

    const validIssuer = [
      "accounts.google.com",
      "https://accounts.google.com"
    ].includes(googleUser.iss);

    const validAudience =
      googleUser.aud === env.GOOGLE_CLIENT_ID;

    const validExpiry =
      Number(googleUser.exp) > Math.floor(Date.now() / 1000);

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
      return new Response("Google account verification failed.", {
        status: 401
      });
    }

    const email = googleUser.email.toLowerCase();

    if (!ADMIN_EMAILS.includes(email)) {
      return new Response("Access denied. This account is not an authorized DO administrator.", {
        status: 403
      });
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
    return new Response("Login could not be completed. Please try again.", {
      status: 500
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/status") {
      return Response.json({
        brand: "DO DESI OFFICIALS",
        status: "online"
      });
    }

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

    if (url.pathname === "/auth/google") {
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        return new Response("Google login configuration is incomplete.", {
          status: 500
        });
      }

      return googleLogin(env);
    }

    if (url.pathname === "/auth/google/callback") {
      return googleCallback(request, env);
    }

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

    if (url.pathname === "/auth/logout") {
      return new Response(null, {
        status: 302,
        headers: {
          "Location": "/",
          "Set-Cookie": cookie(SESSION_COOKIE, "", 0)
        }
      });
    }

    return env.ASSETS.fetch(request);
  }
};

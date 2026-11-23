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

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

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

    if (item.slice(0, separator).trim() === name) {
      return item.slice(separator + 1).trim();
    }
  }

  return null;
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}

function isAdmin(email) {
  return ADMIN_EMAILS.includes(
    String(email || "").toLowerCase()
  );
}

function isValidId(value) {
  return typeof value === "string" &&
    /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

async function readJSON(request) {
  const contentType = request.headers.get("Content-Type") || "";

  if (!contentType.includes("application/json")) {
    throw new Error("Content-Type must be application/json.");
  }

  const length = Number(
    request.headers.get("Content-Length") || 0
  );

  if (length > 20000) {
    throw new Error("Request is too large.");
  }

  const text = await request.text();

  if (text.length > 20000) {
    throw new Error("Request is too large.");
  }

  return JSON.parse(text);
}

function checkOrigin(request) {
  const origin = request.headers.get("Origin");

  if (!origin) return false;

  try {
    return new URL(origin).origin ===
      new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function requireJSONBody(request) {
  try {
    return await readJSON(request);
  } catch (error) {
    throw new Error(error.message || "Invalid request body.");
  }
}

/* =========================================
   SESSION MANAGEMENT
========================================= */

async function getSigningKey(env) {
  if (
    !env.SESSION_SECRET ||
    env.SESSION_SECRET.length < 32
  ) {
    throw new Error("Session configuration unavailable.");
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
    customerId: user.customerId,
    role: isAdmin(user.email) ? "admin" : "customer",
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

async function getCurrentUser(request, env) {
  const token = getCookie(request, SESSION_COOKIE);

  return verifySession(token, env);
}

async function requireCustomer(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user || !user.customerId) {
    return {
      error: json({
        error: "Please sign in to continue."
      }, 401)
    };
  }

  return { user };
}

async function requireAdmin(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user || !isAdmin(user.email)) {
    return {
      error: json({
        error: "Administrator access required."
      }, 403)
    };
  }

  return { user };
}

/* =========================================
   GOOGLE LOGIN
========================================= */

async function googleLogin(request, env) {
  const state = randomString();

  const requestedMode =
    new URL(request.url).searchParams.get("mode");

  const mode = requestedMode === "admin"
    ? "admin"
    : "customer";

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
      "Set-Cookie": cookie(
        STATE_COOKIE,
        `${state}.${mode}`,
        600
      )
    }
  });
}

async function googleCallback(request, env) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const savedState = getCookie(request, STATE_COOKIE);

  const stateParts = savedState
    ? savedState.split(".")
    : [];

  const savedRandomState = stateParts[0];
  const loginMode = stateParts[1];

  if (
    !code ||
    !returnedState ||
    !savedRandomState ||
    returnedState !== savedRandomState ||
    !["customer", "admin"].includes(loginMode)
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
      !googleUser.email ||
      !googleUser.sub
    ) {
      return new Response(
        "Google account verification failed.",
        { status: 401 }
      );
    }

    const email = googleUser.email.toLowerCase();

    if (
      loginMode === "admin" &&
      !isAdmin(email)
    ) {
      return new Response(
        "Access denied. This account is not an authorized DO administrator.",
        { status: 403 }
      );
    }

    const customerId = randomString(18);

    const customer = await env.DB.prepare(`
      INSERT INTO customers (
        id,
        google_id,
        email,
        name,
        picture,
        created_at,
        last_login
      )
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)

      ON CONFLICT(google_id)
      DO UPDATE SET
        email = excluded.email,
        name = excluded.name,
        picture = excluded.picture,
        last_login = CURRENT_TIMESTAMP

      RETURNING id
    `).bind(
      customerId,
      googleUser.sub,
      email,
      googleUser.name || "",
      googleUser.picture || ""
    ).first();

    if (!customer || !customer.id) {
      throw new Error("Customer account could not be created.");
    }

    const session = await createSession({
      email,
      name: googleUser.name || "",
      picture: googleUser.picture || "",
      customerId: customer.id
    }, env);

    const headers = new Headers();

    headers.set(
      "Location",
      loginMode === "admin"
        ? "/admin/"
        : "/#account"
    );

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

  } catch (error) {
    console.error("Google callback error:", error);

    return new Response(
      "Login could not be completed. Please try again.",
      { status: 500 }
    );
  }
}

/* =========================================
   AUCTION SETTLEMENT
========================================= */

async function settleExpiredAuctions(env) {
  const now = new Date().toISOString();

  const expired = await env.DB.prepare(`
    SELECT id
    FROM products
    WHERE status = 'live'
      AND auction_end <= ?
    LIMIT 50
  `).bind(now).all();

  for (const product of expired.results || []) {
    await env.DB.batch([

      env.DB.prepare(`
        INSERT OR IGNORE INTO auction_history (
          id,
          product_id,
          winner_id,
          winning_bid_id,
          winning_amount,
          closed_at
        )
        SELECT
          ?,
          p.id,
          (
            SELECT b.customer_id
            FROM bids b
            WHERE b.product_id = p.id
            ORDER BY b.amount DESC, b.created_at ASC
            LIMIT 1
          ),
          (
            SELECT b.id
            FROM bids b
            WHERE b.product_id = p.id
            ORDER BY b.amount DESC, b.created_at ASC
            LIMIT 1
          ),
          (
            SELECT b.amount
            FROM bids b
            WHERE b.product_id = p.id
            ORDER BY b.amount DESC, b.created_at ASC
            LIMIT 1
          ),
          CURRENT_TIMESTAMP
        FROM products p
        WHERE p.id = ?
          AND p.status = 'live'
          AND p.auction_end <= ?
      `).bind(
        randomString(18),
        product.id,
        now
      ),

      env.DB.prepare(`
        UPDATE products
        SET status = 'closed'
        WHERE id = ?
          AND status = 'live'
          AND auction_end <= ?
      `).bind(
        product.id,
        now
      )

    ]);
  }
}

/* =========================================
   PRODUCT APIs
========================================= */

async function listProducts(env) {
  await settleExpiredAuctions(env);

  const result = await env.DB.prepare(`
    SELECT
      p.*,
      (
        SELECT MAX(b.amount)
        FROM bids b
        WHERE b.product_id = p.id
      ) AS current_bid,
      (
        SELECT COUNT(*)
        FROM bids b
        WHERE b.product_id = p.id
      ) AS bid_count
    FROM products p
    WHERE p.status IN ('live', 'closed')
    ORDER BY p.created_at DESC
  `).all();

  return json({
    products: result.results || []
  });
}

async function getProduct(env, slug) {
  await settleExpiredAuctions(env);

  const product = await env.DB.prepare(`
    SELECT
      p.*,
      (
        SELECT MAX(b.amount)
        FROM bids b
        WHERE b.product_id = p.id
      ) AS current_bid,
      (
        SELECT COUNT(*)
        FROM bids b
        WHERE b.product_id = p.id
      ) AS bid_count
    FROM products p
    WHERE p.slug = ?
      AND p.status IN ('live', 'closed')
  `).bind(slug).first();

  if (!product) {
    return json({ error: "Product not found." }, 404);
  }

  return json({ product });
}

async function createProduct(request, env) {
  const body = await requireJSONBody(request);

  const name = String(body.name || "").trim();
  const description = String(body.description || "");
  const category = String(body.category || "").trim();
  const imageUrl = String(body.image_url || "").trim();
  const startingPrice = Number(body.starting_price);
  const auctionStart = body.auction_start
    ? new Date(body.auction_start)
    : new Date();
  const auctionEnd = new Date(body.auction_end);

  const slug = slugify(body.slug || name);

  if (
    !name ||
    !slug ||
    !Number.isSafeInteger(startingPrice) ||
    startingPrice < 0 ||
    Number.isNaN(auctionStart.getTime()) ||
    Number.isNaN(auctionEnd.getTime()) ||
    auctionEnd <= auctionStart ||
    description.length > 10000 ||
    imageUrl.length > 2000
  ) {
    return json({
      error: "Please provide valid product details."
    }, 400);
  }

  if (
    imageUrl &&
    !imageUrl.startsWith("/") &&
    !/^https:\/\//i.test(imageUrl)
  ) {
    return json({
      error: "Product image

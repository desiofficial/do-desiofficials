const REDIRECT_URI =
  "https://do-desiofficials.desioficials.workers.dev/auth/google/callback";

const ADMIN_EMAILS = [
  "desiofficials@gmail.com",
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
  const header = request.headers.get("Cookie") || "";

  for (const item of header.split(";")) {
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
  const contentType =
    request.headers.get("Content-Type") || "";

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

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON request body.");
  }
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

function errorMessage(error) {
  return error?.message || "Something went wrong.";
}

function databaseError(error) {
  const message = errorMessage(error);

  if (
    message.includes("UNIQUE constraint failed") ||
    message.includes("PRIMARY KEY")
  ) {
    return json({
      error: "This slug or record already exists."
    }, 409);
  }

  console.error("Database operation failed:", error);

  return json({
    error: "Database operation failed."
  }, 500);
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
  return verifySession(
    getCookie(request, SESSION_COOKIE),
    env
  );
}

async function requireCustomer(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user || !user.customerId) {
    return {
      error: json({
        authenticated: false,
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
  if (!env.GOOGLE_CLIENT_ID) {
    return new Response(
      "Google login configuration is unavailable.",
      { status: 500 }
    );
  }

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

  googleURL.searchParams.set("response_type", "code");
  googleURL.searchParams.set("scope", "openid email profile");
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

  const savedState = getCookie(
    request,
    STATE_COOKIE
  );

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
          "Content-Type":
            "application/x-www-form-urlencoded"
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

    const googleUser =
      await verificationResponse.json();

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

    if (!customer?.id) {
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
      `).bind(product.id, now)
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
  const body = await readJSON(request);

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

  const status = ["draft", "live", "closed"].includes(body.status)
    ? body.status
    : "draft";

  if (
    !name ||
    !slug ||
    !Number.isSafeInteger(startingPrice) ||
    startingPrice < 0 ||
    Number.isNaN(auctionStart.getTime()) ||
    Number.isNaN(auctionEnd.getTime()) ||
    auctionEnd <= auctionStart ||
    description.length > 10000 ||
    category.length > 100 ||
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
      error: "Product image must use a site path or HTTPS URL."
    }, 400);
  }

  const id = randomString(18);

  try {
    await env.DB.prepare(`
      INSERT INTO products (
        id,
        name,
        price,
        slug,
        description,
        category,
        image_url,
        starting_price,
        auction_start,
        auction_end,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      name,
      startingPrice,
      slug,
      description,
      category,
      imageUrl,
      startingPrice,
      auctionStart.toISOString(),
      auctionEnd.toISOString(),
      status
    ).run();

  } catch (error) {
    return databaseError(error);
  }

  return json({
    success: true,
    product: {
      id,
      name,
      price: startingPrice,
      slug,
      description,
      category,
      image_url: imageUrl,
      starting_price: startingPrice,
      auction_start: auctionStart.toISOString(),
      auction_end: auctionEnd.toISOString(),
      status
    }
  }, 201);
}

async function updateProduct(request, env, id) {
  if (!isValidId(id)) {
    return json({ error: "Invalid product ID." }, 400);
  }

  const body = await readJSON(request);

  const existing = await env.DB.prepare(`
    SELECT *
    FROM products
    WHERE id = ?
  `).bind(id).first();

  if (!existing) {
    return json({ error: "Product not found." }, 404);
  }

  const name = String(body.name ?? existing.name).trim();

  const description = String(
    body.description ?? existing.description
  );

  const category = String(
    body.category ?? existing.category
  ).trim();

  const imageUrl = String(
    body.image_url ?? existing.image_url
  ).trim();

  const startingPrice = Number(
    body.starting_price ?? existing.starting_price
  );

  const auctionStart = new Date(
    body.auction_start ?? existing.auction_start
  );

  const auctionEnd = new Date(
    body.auction_end ?? existing.auction_end
  );

  const slug = slugify(body.slug || name);

  const status = body.status ?? existing.status;

  if (
    !name ||
    !slug ||
    !Number.isSafeInteger(startingPrice) ||
    startingPrice < 0 ||
    Number.isNaN(auctionStart.getTime()) ||
    Number.isNaN(auctionEnd.getTime()) ||
    auctionEnd <= auctionStart ||
    !["draft", "live", "closed"].includes(status) ||
    description.length > 10000 ||
    category.length > 100 ||
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
      error: "Product image must use a site path or HTTPS URL."
    }, 400);
  }

  try {
    await env.DB.prepare(`
      UPDATE products
      SET
        name = ?,
        price = ?,
        slug = ?,
        description = ?,
        category = ?,
        image_url = ?,
        starting_price = ?,
        auction_start = ?,
        auction_end = ?,
        status = ?
      WHERE id = ?
    `).bind(
      name,
      startingPrice,
      slug,
      description,
      category,
      imageUrl,
      startingPrice,
      auctionStart.toISOString(),
      auctionEnd.toISOString(),
      status,
      id
    ).run();

  } catch (error) {
    return databaseError(error);
  }

  return json({
    success: true,
    message: "Product updated."
  });
}

async function deleteProduct(env, id) {
  if (!isValidId(id)) {
    return json({ error: "Invalid product ID." }, 400);
  }

  const product = await env.DB.prepare(`
    SELECT id
    FROM products
    WHERE id = ?
  `).bind(id).first();

  if (!product) {
    return json({ error: "Product not found." }, 404);
  }

  const bids = await env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM bids
    WHERE product_id = ?
  `).bind(id).first();

  if (Number(bids?.total || 0) > 0) {
    return json({
      error: "Products with bids cannot be deleted."
    }, 409);
  }

  try {
    await env.DB.batch([
      env.DB.prepare(`
        DELETE FROM auction_history
        WHERE product_id = ?
      `).bind(id),

      env.DB.prepare(`
        DELETE FROM products
        WHERE id = ?
      `).bind(id)
    ]);

  } catch (error) {
    return databaseError(error);
  }

  return json({ success: true });
}

/* =========================================
   BIDDING APIs
========================================= */

async function placeBid(request, env) {
  const auth = await requireCustomer(request, env);

  if (auth.error) return auth.error;

  const body = await readJSON(request);

  const productId = String(body.product_id || "");
  const amount = Number(body.amount);

  if (
    !isValidId(productId) ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    return json({
      error: "Please enter a valid bid."
    }, 400);
  }

  await settleExpiredAuctions(env);

  const now = new Date().toISOString();

  const result = await env.DB.prepare(`
    INSERT INTO bids (
      id,
      product_id,
      customer_id,
      amount
    )
    SELECT
      ?,
      p.id,
      ?,
      ?
    FROM products p
    WHERE p.id = ?
      AND p.status = 'live'
      AND p.auction_start <= ?
      AND p.auction_end > ?
      AND ? > MAX(
        p.starting_price,
        COALESCE(
          (
            SELECT MAX(b.amount)
            FROM bids b
            WHERE b.product_id = p.id
          ),
          0
        )
      )
  `).bind(
    randomString(18),
    auth.user.customerId,
    amount,
    productId,
    now,
    now,
    amount
  ).run();

  if (!result.meta || result.meta.changes !== 1) {
    return json({
      error: "Your bid was not accepted. The auction may have closed or your bid may be too low."
    }, 409);
  }

  return json({
    success: true,
    message: "Your bid has been placed.",
    amount
  }, 201);
}

async function getMyBids(env, customerId) {
  await settleExpiredAuctions(env);

  const result = await env.DB.prepare(`
    SELECT
      b.id,
      b.amount,
      b.created_at,
      p.name AS product_name,
      p.slug AS product_slug,
      p.image_url,
      p.status AS product_status,
      p.auction_end,
      (
        SELECT MAX(other.amount)
        FROM bids other
        WHERE other.product_id = b.product_id
      ) AS highest_bid
    FROM bids b
    JOIN products p ON p.id = b.product_id
    WHERE b.customer_id = ?
    ORDER BY b.created_at DESC
  `).bind(customerId).all();

  return json({
    bids: result.results || []
  });
}

/* =========================================
   ARTICLE APIs
========================================= */

async function listArticles(env) {
  const result = await env.DB.prepare(`
    SELECT
      id,
      title,
      slug,
      content,
      image_url,
      created_at,
      updated_at
    FROM articles
    WHERE status = 'published'
    ORDER BY created_at DESC
  `).all();

  return json({
    articles: result.results || []
  });
}

async function getArticle(env, slug) {
  const article = await env.DB.prepare(`
    SELECT
      id,
      title,
      slug,
      content,
      image_url,
      created_at,
      updated_at
    FROM articles
    WHERE slug = ?
      AND status = 'published'
  `).bind(slug).first();

  if (!article) {
    return json({ error: "Article not found." }, 404);
  }

  return json({ article });
}

async function createArticle(request, env, adminEmail) {
  const body = await readJSON(request);

  const title = String(body.title || "").trim();
  const content = String(body.content || "");
  const imageUrl = String(body.image_url || "").trim();
  const slug = slugify(body.slug || title);

  const status = body.status === "published"
    ? "published"
    : "draft";

  if (
    !title ||
    !slug ||
    !content.trim() ||
    title.length > 250 ||
    content.length > 30000 ||
    imageUrl.length > 2000
  ) {
    return json({
      error: "Please provide valid article details."
    }, 400);
  }

  if (
    imageUrl &&
    !imageUrl.startsWith("/") &&
    !/^https:\/\//i.test(imageUrl)
  ) {
    return json({
      error: "Article image must use a site path or HTTPS URL."
    }, 400);
  }

  const id = randomString(18);

  try {
    await env.DB.prepare(`
      INSERT INTO articles (
        id,
        title,
        slug,
        content,
        image_url,
        status,
        author_email
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      title,
      slug,
      content,
      imageUrl,
      status,
      adminEmail
    ).run();

  } catch (error) {
    return databaseError(error);
  }

  return json({
    success: true,
    id,
    slug
  }, 201);
}

async function updateArticle(request, env, id) {
  if (!isValidId(id)) {
    return json({ error: "Invalid article ID." }, 400);
  }

  const body = await readJSON(request);

  const existing = await env.DB.prepare(`
    SELECT *
    FROM articles
    WHERE id = ?
  `).bind(id).first();

  if (!existing) {
    return json({ error: "Article not found." }, 404);
  }

  const title = String(body.title ?? existing.title).trim();
  const content = String(body.content ?? existing.content);

  const imageUrl = String(
    body.image_url ?? existing.image_url
  ).trim();

  const slug = slugify(body.slug || title);

  const status = body.status ?? existing.status;

  if (
    !title ||
    !slug ||
    !content.trim() ||
    title.length > 250 ||
    content.length > 30000 ||
    imageUrl.length > 2000 ||
    !["draft", "published"].includes(status)
  ) {
    return json({
      error: "Please provide valid article details."
    }, 400);
  }

  if (
    imageUrl &&
    !imageUrl.startsWith("/") &&
    !/^https:\/\//i.test(imageUrl)
  ) {
    return json({
      error: "Article image must use a site path or HTTPS URL."
    }, 400);
  }

  try {
    await env.DB.prepare(`
      UPDATE articles
      SET
        title = ?,
        slug = ?,
        content = ?,
        image_url = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      title,
      slug,
      content,
      imageUrl,
      status,
      id
    ).run();

  } catch (error) {
    return databaseError(error);
  }

  return json({
    success: true,
    message: "Article updated."
  });
}

async function deleteArticle(env, id) {
  if (!isValidId(id)) {
    return json({ error: "Invalid article ID." }, 400);
  }

  const result = await env.DB.prepare(`
    DELETE FROM articles
    WHERE id = ?
  `).bind(id).run();

  if (!result.meta || result.meta.changes !== 1) {
    return json({ error: "Article not found." }, 404);
  }

  return json({ success: true });
}

/* =========================================
   ADMIN APIs
========================================= */

async function adminOverview(env) {
  await settleExpiredAuctions(env);

  const [
    customers,
    products,
    liveProducts,
    bids,
    articles
  ] = await Promise.all([
    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM customers"
    ).first(),

    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM products"
    ).first(),

    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM products WHERE status = 'live'"
    ).first(),

    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM bids"
    ).first(),

    env.DB.prepare(
      "SELECT COUNT(*) AS total FROM articles"
    ).first()
  ]);

  return json({
    customers: customers.total,
    products: products.total,
    live_products: liveProducts.total,
    bids: bids.total,
    articles: articles.total
  });
}

async function adminCustomers(env) {
  const result = await env.DB.prepare(`
    SELECT
      id,
      email,
      name,
      picture,
      created_at,
      last_login
    FROM customers
    ORDER BY created_at DESC
  `).all();

  return json({
    customers: result.results || []
  });
}

async function adminBids(env) {
  await settleExpiredAuctions(env);

  const result = await env.DB.prepare(`
    SELECT
      b.id,
      b.amount,
      b.created_at,
      p.id AS product_id,
      p.name AS product_name,
      p.slug AS product_slug,
      c.id AS customer_id,
      c.name AS customer_name,
      c.email AS customer_email
    FROM bids b
    JOIN products p ON p.id = b.product_id
    JOIN customers c ON c.id = b.customer_id
    ORDER BY b.created_at DESC
  `).all();

  return json({
    bids: result.results || []
  });
}

async function adminProducts(env) {
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
    ORDER BY p.created_at DESC
  `).all();

  return json({
    products: result.results || []
  });
}

async function adminArticles(env) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM articles
    ORDER BY created_at DESC
  `).all();

  return json({
    articles: result.results || []
  });
}

/* =========================================
   MAIN REQUEST ROUTER
========================================= */

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  /* HEALTH CHECK */

  if (path === "/api/status" && method === "GET") {
    return json({
      brand: "DO DESI OFFICIALS",
      status: "online"
    });
  }

  /* DATABASE CHECK */

  if (path === "/api/db-check" && method === "GET") {
    const result = await env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM sqlite_master
      WHERE type = 'table'
    `).first();

    return json({
      database: "connected",
      tables: result.total
    });
  }

  /* GOOGLE AUTHENTICATION */

  if (path === "/auth/google" && method === "GET") {
    return googleLogin(request, env);
  }

  if (
    path === "/auth/google/callback" &&
    method === "GET"
  ) {
    return googleCallback(request, env);
  }

  /* CURRENT USER */

  if (path === "/api/me" && method === "GET") {
    const user = await getCurrentUser(request, env);

    if (!user) {
      return json({
        authenticated: false
      }, 401);
    }

    return json({
      authenticated: true,
      user: {
        email: user.email,
        name: user.name,
        picture: user.picture,
        role: isAdmin(user.email)
          ? "admin"
          : "customer"
      }
    });
  }

  /* LOGOUT */

  if (path === "/auth/logout" && method === "POST") {
    if (!checkOrigin(request)) {
      return json({ error: "Invalid request origin." }, 403);
    }

    return new Response(null, {
      status: 302,
      headers: {
        "Location": "/",
        "Set-Cookie": cookie(SESSION_COOKIE, "", 0)
      }
    });
  }

  /* PUBLIC PRODUCTS */

  if (path === "/api/products" && method === "GET") {
    return listProducts(env);
  }

  if (
    path.startsWith("/api/products/") &&
    method === "GET"
  ) {
    let slug;

    try {
      slug = decodeURIComponent(
        path.slice("/api/products/".length)
      );
    } catch {
      return json({ error: "Invalid product slug." }, 400);
    }

    return getProduct(env, slug);
  }

  /* PLACE BID */

  if (path === "/api/bids" && method === "POST") {
    if (!checkOrigin(request)) {
      return json({ error: "Invalid request origin." }, 403);
    }

    return placeBid(request, env);
  }

  /* CUSTOMER BID HISTORY */

  if (path === "/api/my-bids" && method === "GET") {
    const auth = await requireCustomer(request, env);

    if (auth.error) return auth.error;

    return getMyBids(env, auth.user.customerId);
  }

  /* PUBLIC ARTICLES */

  if (path === "/api/articles" && method === "GET") {
    return listArticles(env);
  }

  if (
    path.startsWith("/api/articles/") &&
    method === "GET"
  ) {
    let slug;

    try {
      slug = decodeURIComponent(
        path.slice("/api/articles/".length)
      );
    } catch {
      return json({ error: "Invalid article slug." }, 400);
    }

    return getArticle(env, slug);
  }

  /* ALL ADMIN ROUTES */

  if (path.startsWith("/api/admin/")) {
    const auth = await requireAdmin(request, env);

    if (auth.error) return auth.error;

    if (
      method !== "GET" &&
      !checkOrigin(request)
    ) {
      return json({
        error: "Invalid request origin."
      }, 403);
    }

    if (
      path === "/api/admin/overview" &&
      method === "GET"
    ) {
      return adminOverview(env);
    }

    if (
      path === "/api/admin/customers" &&
      method === "GET"
    ) {
      return adminCustomers(env);
    }

    if (
      path === "/api/admin/bids" &&
      method === "GET"
    ) {
      return adminBids(env);
    }

    if (
      path === "/api/admin/products" &&
      method === "GET"
    ) {
      return adminProducts(env);
    }

    if (
      path === "/api/admin/products" &&
      method === "POST"
    ) {
      return createProduct(request, env);
    }

    const productMatch = path.match(
      /^\/api\/admin\/products\/([^/]+)$/
    );

    if (productMatch) {
      let id;

      try {
        id = decodeURIComponent(productMatch[1]);
      } catch {
        return json({ error: "Invalid product ID." }, 400);
      }

      if (
        ["PUT", "PATCH"].includes(method)
      ) {
        return updateProduct(request, env, id);
      }

      if (method === "DELETE") {
        return deleteProduct(env, id);
      }
    }

    if (
      path === "/api/admin/articles" &&
      method === "GET"
    ) {
      return adminArticles(env);
    }

    if (
      path === "/api/admin/articles" &&
      method === "POST"
    ) {
      return createArticle(
        request,
        env,
        auth.user.email
      );
    }

    const articleMatch = path.match(
      /^\/api\/admin\/articles\/([^/]+)$/
    );

    if (articleMatch) {
      let id;

      try {
        id = decodeURIComponent(articleMatch[1]);
      } catch {
        return json({ error: "Invalid article ID." }, 400);
      }

      if (
        ["PUT", "PATCH"].includes(method)
      ) {
        return updateArticle(request, env, id);
      }

      if (method === "DELETE") {
        return deleteArticle(env, id);
      }
    }

    return json({
      error: "Admin API route not found."
    }, 404);
  }

  /* UNKNOWN API ROUTES */

  if (path.startsWith("/api/")) {
    return json({
      error: "API endpoint not found.",
      path
    }, 404);
  }

  /* STATIC WEBSITE */

  return env.ASSETS.fetch(request);
}

/* =========================================
   WORKER ENTRY POINT
========================================= */

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);

    } catch (error) {
      console.error("Worker error:", error);

      const path = new URL(request.url).pathname;

      if (path.startsWith("/api/")) {
        return json({
          error: "Internal server error."
        }, 500);
      }

      return new Response(
        "Something went wrong. Please try again.",
        { status: 500 }
      );
    }
  }
};

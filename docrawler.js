
/*
 * DO CRAWLER — DESI OFFICIALS
 * Automatic fashion website discovery crawler
 * Node.js 20+
 */

const fs = require("node:fs/promises");

const BRAND = "DESI OFFICIALS";
const HOME = "https://www.desiofficials.com/";

const START_SITES = [
  "https://www.google.com/search?q=clothing+websites",
  "https://www.google.com/search?q=fashion+stores",
  "https://www.google.com/search?q=clothing+wholesale+websites",
  "https://www.google.com/search?q=garment+stock+websites",
  "https://www.google.com/search?q=fashion+advertising+sites"
];

const KEYWORDS = [
  "fashion", "clothing", "garment", "apparel",
  "wholesale", "stock", "inventory", "textile",
  "menswear", "streetwear", "shopping"
];

const MAX_SITES = 60;
const DELAY = 1200;

const queue = [...START_SITES];
const visited = new Set();
const opportunities = [];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function relevant(url) {
  return KEYWORDS.some(word => url.toLowerCase().includes(word));
}

function safeUrl(raw, base) {
  try {
    const u = new URL(raw, base);

    if (!["http:", "https:"].includes(u.protocol)) return null;
    if (u.hostname === new URL(HOME).hostname) return null;

    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}

async function crawl(url) {
  try {
    console.log("DO SNAKE →", url);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "DO-Crawler/1.0 (+https://www.desiofficials.com/)"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) return;

    const finalUrl = new URL(response.url);

    if (finalUrl.protocol !== "https:") return;

    const html = await response.text();

    if (!/text\/html/i.test(response.headers.get("content-type") || "")) {
      return;
    }

    const title =
      (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";

    const description =
      (html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i) || [])[1] || "";

    const pageText = (title + " " + description).toLowerCase();

    if (KEYWORDS.some(word => pageText.includes(word))) {
      opportunities.push({
        website: finalUrl.origin,
        page: finalUrl.href,
        category: "Fashion / Clothing opportunity",
        promotionLink: HOME,
        status: "Discovered — permission required"
      });

      console.log("DO OPPORTUNITY:", finalUrl.hostname);
    }

    const links = html.match(/<a\b[^>]*href=["'][^"']+["'][^>]*>/gi) || [];

    for (const tag of links) {
      const match = tag.match(/href=["']([^"']+)["']/i);
      if (!match) continue;

      const next = safeUrl(match[1], finalUrl);

      if (
        next &&
        relevant(next) &&
        !visited.has(next) &&
        queue.length < MAX_SITES * 3
      ) {
        queue.push(next);
      }
    }
  } catch {
    console.log("SKIPPED:", url);
  }
}

async function start() {
  console.log("\n🐍 DO CRAWLER STARTED");
  console.log("PROMOTION HOMEPAGE:", HOME);

  while (queue.length && visited.size < MAX_SITES) {
    const url = queue.shift();

    if (visited.has(url)) continue;
    visited.add(url);

    await crawl(url);
    await sleep(DELAY);
  }

  await fs.writeFile(
    "do-crawler-opportunities.json",
    JSON.stringify(opportunities, null, 2)
  );

  console.log("\nDO CRAWL FINISHED");
  console.log("Sites visited:", visited.size);
  console.log("Opportunities:", opportunities.length);
  console.log("Report: do-crawler-opportunities.json");
}

start();

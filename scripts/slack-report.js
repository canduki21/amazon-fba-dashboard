require("dotenv").config();
const fs = require("fs");
const path = require("path");
const https = require("https");

const cogs = JSON.parse(fs.readFileSync(path.join(__dirname, "../docs/cogs.json"), "utf8"));

const weightByAsin = {};
Object.entries(cogs.byAsin).forEach(([asin, info]) => {
  const match = info.product.match(/(\d+kg)/i);
  if (match) weightByAsin[asin] = match[1];
});

const shortName = (name) => (name || "").split(/,|–/)[0].trim();

const COL_NAME  = 36;
const COL_WT    =  5;
const COL_TOTAL =  7;
const COL_AVAIL = 11;

const pad  = (str, len) => String(str).padEnd(len);
const lpad = (str, len) => String(str).padStart(len);

const HEADER  = `${pad("Product", COL_NAME)} ${pad("Wt", COL_WT)} ${lpad("Total", COL_TOTAL)} ${lpad("Fulfillable", COL_AVAIL)}`;
const DIVIDER = "─".repeat(HEADER.length);

function buildTable(predictions) {
  const active = predictions.filter((p) => p.discoverable !== false);
  if (active.length === 0) return null;
  const rows = active.map((p) => {
    const name  = shortName(p.productName) || p.sellerSku;
    const wt    = weightByAsin[p.asin] || "—";
    const total = p.totalQuantity;
    const avail = p.fulfillableQty != null ? p.fulfillableQty : "—";
    return `${pad(name.slice(0, COL_NAME), COL_NAME)} ${pad(wt, COL_WT)} ${lpad(total, COL_TOTAL)} ${lpad(avail, COL_AVAIL)}`;
  });
  return [HEADER, DIVIDER, ...rows].join("\n");
}

const naData = JSON.parse(fs.readFileSync(path.join(__dirname, "../docs/data.json"), "utf8"));
const euPath = path.join(__dirname, "../docs/data-eu.json");
const euData = fs.existsSync(euPath) ? JSON.parse(fs.readFileSync(euPath, "utf8")) : null;

const naTable = buildTable(naData.predictions);
const euTable = euData ? buildTable(euData.predictions) : null;

const updated = new Date(naData.lastUpdated).toLocaleDateString("en-US", {
  weekday: "long", month: "long", day: "numeric",
});

const blocks = [
  { type: "header", text: { type: "plain_text", text: "📦 FBA Inventory Report", emoji: true } },
  { type: "context", elements: [{ type: "mrkdwn", text: updated }] },
];

if (naTable) {
  blocks.push({ type: "section", text: { type: "mrkdwn", text: "*🇺🇸 United States (NA)*" } });
  blocks.push({ type: "section", text: { type: "mrkdwn", text: "```" + naTable + "```" } });
}

if (euTable) {
  blocks.push({ type: "divider" });
  blocks.push({ type: "section", text: { type: "mrkdwn", text: "*🇪🇺 Europe (EU)*" } });
  blocks.push({ type: "section", text: { type: "mrkdwn", text: "```" + euTable + "```" } });
}

blocks.push({ type: "divider" });
blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `<https://canduki21.github.io/amazon-fba-dashboard/|View full dashboard>` }] });

const payload = JSON.stringify({ blocks });

const webhookUrl = process.env.SLACK_WEBHOOK_URL;
if (!webhookUrl) { console.error("SLACK_WEBHOOK_URL not set"); process.exit(1); }

const url = new URL(webhookUrl);
const req = https.request(
  { hostname: url.hostname, path: url.pathname, method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
  (res) => {
    let body = "";
    res.on("data", (c) => (body += c));
    res.on("end", () => {
      if (res.statusCode === 200) console.log("Sent");
      else { console.error(`${res.statusCode}: ${body}`); process.exit(1); }
    });
  }
);
req.on("error", (e) => { console.error(e); process.exit(1); });
req.write(payload);
req.end();

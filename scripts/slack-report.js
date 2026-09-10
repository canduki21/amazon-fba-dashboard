require("dotenv").config();
const fs = require("fs");
const path = require("path");
const https = require("https");

const data = JSON.parse(fs.readFileSync(path.join(__dirname, "../docs/data.json"), "utf8"));
const cogs = JSON.parse(fs.readFileSync(path.join(__dirname, "../docs/cogs.json"), "utf8"));

const { predictions } = data;

const weightByAsin = {};
Object.entries(cogs.byAsin).forEach(([asin, info]) => {
  const match = info.product.match(/(\d+kg)/i);
  if (match) weightByAsin[asin] = match[1];
});

const shortName = (name) => (name || "").split(/,|–/)[0].trim();

const lines = predictions
  .filter((p) => p.discoverable !== false)
  .map((p) => {
    const weight = weightByAsin[p.asin] ? ` (${weightByAsin[p.asin]})` : "";
    const fulfillable = p.fulfillableQty !== null && p.fulfillableQty !== undefined
      ? ` | fulfillable: ${p.fulfillableQty}`
      : "";
    return `${shortName(p.productName) || p.sellerSku}${weight} | total: ${p.totalQuantity}${fulfillable}`;
  })
  .join("\n");

const payload = JSON.stringify({ text: lines });

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

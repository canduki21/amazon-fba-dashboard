require("dotenv").config();
const fs = require("fs");
const path = require("path");
const https = require("https");

const data = JSON.parse(fs.readFileSync(path.join(__dirname, "../docs/data.json"), "utf8"));
const cogs = JSON.parse(fs.readFileSync(path.join(__dirname, "../docs/cogs.json"), "utf8"));

const { predictions, lastUpdated } = data;

const weightByAsin = {};
Object.entries(cogs.byAsin).forEach(([asin, info]) => {
  const match = info.product.match(/(\d+kg)/i);
  if (match) weightByAsin[asin] = match[1];
});

const shortName = (name) => (name || "").split(/,|–/)[0].trim();

const updated = new Date(lastUpdated).toLocaleDateString("en-US", {
  weekday: "long", month: "long", day: "numeric",
});

const active = predictions.filter((p) => p.discoverable !== false);

const blocks = [
  {
    type: "header",
    text: { type: "plain_text", text: "📦 FBA Inventory Report", emoji: true },
  },
  {
    type: "context",
    elements: [{ type: "mrkdwn", text: `*${updated}*  •  ${active.length} active listings` }],
  },
  { type: "divider" },
];

active.forEach((p) => {
  const weight = weightByAsin[p.asin] ? `  \`${weightByAsin[p.asin]}\`` : "";
  const fulfillable = p.fulfillableQty !== null && p.fulfillableQty !== undefined
    ? `*Fulfillable:* ${p.fulfillableQty}`
    : "";
  const total = `*Total:* ${p.totalQuantity}`;

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${shortName(p.productName) || p.sellerSku}*${weight}`,
    },
    fields: [
      { type: "mrkdwn", text: total },
      { type: "mrkdwn", text: fulfillable || " " },
    ],
  });
});

blocks.push({ type: "divider" });
blocks.push({
  type: "context",
  elements: [{ type: "mrkdwn", text: `<https://canduki21.github.io/amazon-fba-dashboard/|View full dashboard>` }],
});

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

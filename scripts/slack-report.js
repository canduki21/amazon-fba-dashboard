require("dotenv").config();
const fs = require("fs");
const path = require("path");
const https = require("https");

const dataPath = path.join(__dirname, "../docs/data.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const { predictions, lastUpdated } = data;

const total       = predictions.length;
const oos         = predictions.filter((p) => p.urgency === "out-of-stock");
const urgent      = predictions.filter((p) => p.urgency === "urgent");
const warning     = predictions.filter((p) => p.urgency === "warning");
const ok          = predictions.filter((p) => p.urgency === "ok").length;
const totalUnits  = predictions.reduce((s, p) => s + (p.totalQuantity || 0), 0);
const totalRev30d = predictions.reduce((s, p) => s + (p.revenue30d || 0), 0);

const updated = new Date(lastUpdated).toLocaleDateString("en-US", {
  month: "short", day: "numeric", year: "numeric",
});

function urgencyLine(p) {
  const days = p.daysRemaining != null ? ` — ${p.daysRemaining}d left` : "";
  return `• *${p.productName || p.sellerSku}* (${p.totalQuantity} units${days})`;
}

const blocks = [
  {
    type: "header",
    text: { type: "plain_text", text: "📦 Weekly FBA Inventory Report", emoji: true },
  },
  {
    type: "context",
    elements: [{ type: "mrkdwn", text: `Data as of ${updated}` }],
  },
  { type: "divider" },
  {
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*Total SKUs*\n${total}` },
      { type: "mrkdwn", text: `*Total Units in FBA*\n${totalUnits.toLocaleString()}` },
      { type: "mrkdwn", text: `*30-Day Revenue*\n$${totalRev30d.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
      { type: "mrkdwn", text: `*Healthy SKUs*\n${ok}` },
    ],
  },
];

if (oos.length > 0) {
  blocks.push({ type: "divider" });
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `🔴 *Out of Stock (${oos.length})*\n${oos.map(urgencyLine).join("\n")}`,
    },
  });
}

if (urgent.length > 0) {
  blocks.push({ type: "divider" });
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `🟠 *Urgent Restock Needed (${urgent.length})*\n${urgent.map(urgencyLine).join("\n")}`,
    },
  });
}

if (warning.length > 0) {
  blocks.push({ type: "divider" });
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `🟡 *Restock Soon (${warning.length})*\n${warning.map(urgencyLine).join("\n")}`,
    },
  });
}

if (oos.length === 0 && urgent.length === 0 && warning.length === 0) {
  blocks.push({ type: "divider" });
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: "✅ *All SKUs are well-stocked!*" },
  });
}

blocks.push({ type: "divider" });
blocks.push({
  type: "context",
  elements: [
    {
      type: "mrkdwn",
      text: `<https://canduki21.github.io/amazon-fba-dashboard/|View full dashboard>`,
    },
  ],
});

const payload = JSON.stringify({ blocks });
const webhookUrl = process.env.SLACK_WEBHOOK_URL;

if (!webhookUrl) {
  console.error("SLACK_WEBHOOK_URL is not set");
  process.exit(1);
}

const url = new URL(webhookUrl);
const req = https.request(
  { hostname: url.hostname, path: url.pathname, method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
  (res) => {
    let body = "";
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => {
      if (res.statusCode === 200) {
        console.log("Slack message sent successfully");
      } else {
        console.error(`Slack responded with ${res.statusCode}: ${body}`);
        process.exit(1);
      }
    });
  }
);
req.on("error", (e) => { console.error(e); process.exit(1); });
req.write(payload);
req.end();

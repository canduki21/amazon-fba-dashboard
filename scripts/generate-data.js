require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { getInventory, getOrders } = require("../amazon");

async function generateData() {
  const [inventoryResult, ordersResult] = await Promise.allSettled([
    getInventory(),
    getOrders(30),
  ]);

  const inventory =
    inventoryResult.status === "fulfilled"
      ? inventoryResult.value?.payload?.inventorySummaries || []
      : [];

  const orders =
    ordersResult.status === "fulfilled"
      ? ordersResult.value?.payload?.Orders || []
      : [];

  if (inventoryResult.status === "rejected")
    console.error("Inventory error:", inventoryResult.reason?.message);
  if (ordersResult.status === "rejected")
    console.error("Orders error:", ordersResult.reason?.message);

  const data = {
    lastUpdated: new Date().toISOString(),
    inventory,
    orders,
  };

  const outputPath = path.join(__dirname, "../docs/data.json");
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

  console.log(`Data saved to docs/data.json`);
  console.log(`Inventory SKUs: ${inventory.length}`);
  console.log(`Orders (30d): ${orders.length}`);
}

generateData().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});

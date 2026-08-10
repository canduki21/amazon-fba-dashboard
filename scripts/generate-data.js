require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { getInventory, getOrders, getOrderItems } = require("../amazon");

const DAYS_IN_PERIOD  = 30;
const LEAD_TIME_DAYS  = 30; // FBA prep + ship + receiving
const TARGET_SUPPLY   = 90; // days of stock to reorder toward

function buildPredictions(inventory, skuSales) {
  return inventory.map((item) => {
    const sales        = skuSales[item.sellerSku] || { units: 0, revenue: 0 };
    const unitsSold30d = sales.units;
    const revenue30d   = parseFloat(sales.revenue.toFixed(2));
    const velocity     = unitsSold30d / DAYS_IN_PERIOD; // units/day
    const revenuePerDay = revenue30d / DAYS_IN_PERIOD;
    const currentQty   = item.totalQuantity;

    let daysRemaining  = null;
    let orderByDate    = null;
    let recommendedQty = null;
    let urgency        = "no-data";

    if (currentQty === 0) {
      urgency        = "out-of-stock";
      recommendedQty = velocity > 0 ? Math.ceil(velocity * TARGET_SUPPLY) : 10;
    } else if (velocity > 0) {
      daysRemaining = Math.floor(currentQty / velocity);
      const orderByDays = daysRemaining - LEAD_TIME_DAYS;

      const d = new Date();
      d.setDate(d.getDate() + orderByDays);
      orderByDate    = d.toISOString();
      recommendedQty = Math.ceil(velocity * TARGET_SUPPLY);

      urgency =
        orderByDays <= 0  ? "urgent"  :
        orderByDays <= 14 ? "warning" : "ok";
    } else {
      urgency = "no-sales";
    }

    const avgPrice = unitsSold30d > 0 ? parseFloat((revenue30d / unitsSold30d).toFixed(2)) : null;

    return {
      asin:           item.asin,
      sellerSku:      item.sellerSku,
      productName:    item.productName,
      totalQuantity:  currentQty,
      lastUpdatedTime: item.lastUpdatedTime,
      unitsSold30d,
      revenue30d,
      velocity:       parseFloat(velocity.toFixed(3)),      // units/day
      revenuePerDay:  parseFloat(revenuePerDay.toFixed(2)), // $/day
      avgPrice,
      daysRemaining,
      orderByDate,
      recommendedQty,
      urgency,
    };
  });
}

async function generateData() {
  // Fetch inventory and recent orders in parallel
  const [inventoryResult, ordersResult] = await Promise.allSettled([
    getInventory(),
    getOrders(DAYS_IN_PERIOD),
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

  // Fetch order items for all orders to get per-SKU sales
  console.log(`Fetching items for ${orders.length} orders…`);
  const itemResults = await Promise.allSettled(
    orders.map((o) => getOrderItems(o.AmazonOrderId))
  );

  // Aggregate units sold and revenue per seller SKU
  const skuSales = {};
  itemResults.forEach((res) => {
    if (res.status !== "fulfilled") return;
    const items = res.value?.payload?.OrderItems || [];
    items.forEach((item) => {
      const sku  = item.SellerSKU;
      const qty  = parseInt(item.QuantityOrdered) || 0;
      const rev  = parseFloat(item.ItemPrice?.Amount || 0);
      if (!skuSales[sku]) skuSales[sku] = { units: 0, revenue: 0 };
      skuSales[sku].units   += qty;
      skuSales[sku].revenue += rev;
    });
  });

  const predictions = buildPredictions(inventory, skuSales);

  const data = {
    lastUpdated: new Date().toISOString(),
    inventory,
    orders,
    predictions,
  };

  const outputPath = path.join(__dirname, "../docs/data.json");
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

  console.log(`Data saved to docs/data.json`);
  console.log(`Inventory SKUs: ${inventory.length}`);
  console.log(`Orders (30d): ${orders.length}`);
  console.log(`SKUs with sales: ${Object.keys(skuSales).length}`);

  const urgent  = predictions.filter((p) => p.urgency === "urgent").length;
  const warning = predictions.filter((p) => p.urgency === "warning").length;
  const oos     = predictions.filter((p) => p.urgency === "out-of-stock").length;
  console.log(`Urgent restocks: ${urgent} | Warnings: ${warning} | Out of stock: ${oos}`);
}

generateData().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});

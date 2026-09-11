require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { createClient } = require("../amazon");

const DAYS_IN_PERIOD  = 30;
const LEAD_TIME_DAYS  = 30;
const TARGET_SUPPLY   = 90;

function buildPredictions(inventory, skuSales) {
  return inventory.map((item) => {
    const sales          = skuSales[item.sellerSku] || { units: 0, revenue: 0 };
    const unitsSold30d   = sales.units;
    const revenue30d     = parseFloat(sales.revenue.toFixed(2));
    const velocity       = unitsSold30d / DAYS_IN_PERIOD;
    const revenuePerDay  = revenue30d / DAYS_IN_PERIOD;
    const currentQty     = item.totalQuantity;
    const fulfillableQty    = item.inventoryDetails?.fulfillableQuantity ?? null;
    const inboundWorkingQty = item.inventoryDetails?.inboundWorkingQuantity ?? 0;
    const discoverable      = fulfillableQty !== null ? fulfillableQty > 0 : currentQty > 0;

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
      asin: item.asin, sellerSku: item.sellerSku, productName: item.productName,
      totalQuantity: currentQty, lastUpdatedTime: item.lastUpdatedTime,
      unitsSold30d, revenue30d,
      velocity: parseFloat(velocity.toFixed(3)),
      revenuePerDay: parseFloat(revenuePerDay.toFixed(2)),
      avgPrice, daysRemaining, orderByDate, recommendedQty, urgency, discoverable, fulfillableQty, inboundWorkingQty,
    };
  });
}

async function generateRegionData(region) {
  const client = createClient(region);

  const [inventoryResult, ordersResult] = await Promise.allSettled([
    client.getInventory(),
    client.getOrders(DAYS_IN_PERIOD),
  ]);

  const inventory = inventoryResult.status === "fulfilled"
    ? inventoryResult.value?.payload?.inventorySummaries || [] : [];
  const orders = ordersResult.status === "fulfilled"
    ? ordersResult.value?.payload?.Orders || [] : [];

  if (inventoryResult.status === "rejected")
    console.error(`[${region}] Inventory error:`, inventoryResult.reason?.message);
  if (ordersResult.status === "rejected")
    console.error(`[${region}] Orders error:`, ordersResult.reason?.message);

  console.log(`[${region}] Fetching items for ${orders.length} orders…`);
  const itemResults = await Promise.allSettled(orders.map((o) => client.getOrderItems(o.AmazonOrderId)));

  const skuSales = {};
  itemResults.forEach((res) => {
    if (res.status !== "fulfilled") return;
    const items = res.value?.payload?.OrderItems || [];
    items.forEach((item) => {
      const sku = item.SellerSKU;
      const qty = parseInt(item.QuantityOrdered) || 0;
      const rev = parseFloat(item.ItemPrice?.Amount || 0);
      if (!skuSales[sku]) skuSales[sku] = { units: 0, revenue: 0 };
      skuSales[sku].units   += qty;
      skuSales[sku].revenue += rev;
    });
  });

  const predictions = buildPredictions(inventory, skuSales);

  const asinPriceMap = {};
  predictions.forEach((p) => { if (p.avgPrice && !asinPriceMap[p.asin]) asinPriceMap[p.asin] = p.avgPrice; });

  const uniqueAsins = Object.keys(asinPriceMap);
  console.log(`[${region}] Fetching fee estimates for ${uniqueAsins.length} ASINs…`);
  const feeResults = await Promise.allSettled(uniqueAsins.map((asin) => client.getFeesEstimate(asin, asinPriceMap[asin])));

  const feesByAsin = {};
  feeResults.forEach((res, i) => {
    if (res.status !== "fulfilled") return;
    const result = res.value?.payload?.FeesEstimateResult;
    if (result?.Status !== "Success") return;
    const details = result.FeesEstimate?.FeeDetailList || [];
    const find = (type) => details.find((f) => f.FeeType === type)?.FinalFee?.Amount || 0;
    feesByAsin[uniqueAsins[i]] = {
      totalFees: parseFloat(result.FeesEstimate.TotalFeesEstimate.Amount),
      referralFee: parseFloat(find("ReferralFee")),
      fbaFee: parseFloat(find("FBAFees")),
      atPrice: asinPriceMap[uniqueAsins[i]],
    };
  });

  predictions.forEach((p) => {
    const fees = feesByAsin[p.asin];
    if (!fees) return;
    const referralRate = fees.atPrice > 0 ? fees.referralFee / fees.atPrice : 0.15;
    p.fees = {
      totalFees: fees.totalFees, referralFee: fees.referralFee, fbaFee: fees.fbaFee,
      referralRate: parseFloat(referralRate.toFixed(4)),
      netAfterFees: parseFloat((fees.atPrice - fees.totalFees).toFixed(2)),
      atPrice: fees.atPrice,
    };
  });

  return { lastUpdated: new Date().toISOString(), inventory, orders, predictions };
}

async function generateData() {
  const [naData, euData] = await Promise.allSettled([
    generateRegionData("NA"),
    generateRegionData("EU"),
  ]);

  if (naData.status === "fulfilled") {
    fs.writeFileSync(path.join(__dirname, "../docs/data.json"), JSON.stringify(naData.value, null, 2));
    console.log(`[NA] Saved ${naData.value.predictions.length} SKUs`);
  } else {
    console.error("[NA] Failed:", naData.reason?.message);
  }

  if (euData.status === "fulfilled") {
    fs.writeFileSync(path.join(__dirname, "../docs/data-eu.json"), JSON.stringify(euData.value, null, 2));
    console.log(`[EU] Saved ${euData.value.predictions.length} SKUs`);
  } else {
    console.error("[EU] Failed:", euData.reason?.message);
  }
}

generateData().catch((err) => { console.error("Fatal error:", err.message); process.exit(1); });

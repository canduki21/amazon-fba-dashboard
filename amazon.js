require("dotenv").config();
const axios = require("axios");
const { getAccessToken } = require("./auth");

const BASE_URL = "https://sellingpartnerapi-na.amazon.com";
const MARKETPLACE_ID = process.env.AMAZON_MARKETPLACE_ID;

async function apiRequest(method, path, params = {}, data = null) {
  const token = await getAccessToken();
  const response = await axios({
    method,
    url: `${BASE_URL}${path}`,
    headers: {
      "x-amz-access-token": token,
      "Content-Type": "application/json",
    },
    params,
    ...(data !== null && { data }),
  });
  return response.data;
}

async function getFeesEstimate(asin, price) {
  return apiRequest("POST", `/products/fees/v0/items/${asin}/feesEstimate`, {}, {
    FeesEstimateRequest: {
      MarketplaceId: MARKETPLACE_ID,
      IsAmazonFulfilled: true,
      PriceToEstimateFees: {
        ListingPrice: { CurrencyCode: "USD", Amount: price },
      },
      Identifier: asin,
    },
  });
}

async function getOrders(daysPast = 7) {
  const createdAfter = new Date(Date.now() - daysPast * 86400000).toISOString();
  return apiRequest("GET", "/orders/v0/orders", {
    MarketplaceIds: MARKETPLACE_ID,
    CreatedAfter: createdAfter,
  });
}

async function getOrderItems(orderId) {
  return apiRequest("GET", `/orders/v0/orders/${orderId}/orderItems`);
}

async function getInventory() {
  return apiRequest("GET", "/fba/inventory/v1/summaries", {
    marketplaceIds: MARKETPLACE_ID,
    granularityType: "Marketplace",
    granularityId: MARKETPLACE_ID,
  });
}

async function searchCatalog(keywords) {
  return apiRequest("GET", "/catalog/2022-04-01/items", {
    marketplaceIds: MARKETPLACE_ID,
    keywords,
  });
}

async function getListings() {
  const sellerId = process.env.AMAZON_SELLER_ID || "";
  return apiRequest("GET", `/listings/2021-08-01/items/${sellerId}`, {
    marketplaceIds: MARKETPLACE_ID,
  });
}

module.exports = { getOrders, getOrderItems, getInventory, searchCatalog, getListings, getFeesEstimate };

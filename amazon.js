require("dotenv").config();
const axios = require("axios");
const { getAccessToken } = require("./auth");

const ENDPOINTS = {
  NA: "https://sellingpartnerapi-na.amazon.com",
  EU: "https://sellingpartnerapi-eu.amazon.com",
};

function createClient(region = "NA") {
  const BASE_URL = ENDPOINTS[region] || ENDPOINTS.NA;
  const MARKETPLACE_ID = region === "EU"
    ? process.env.AMAZON_MARKETPLACE_ID_EU
    : process.env.AMAZON_MARKETPLACE_ID;

  async function apiRequest(method, path, params = {}, data = null) {
    const token = await getAccessToken(region);
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

  return {
    getInventory: () => apiRequest("GET", "/fba/inventory/v1/summaries", {
      marketplaceIds: MARKETPLACE_ID,
      granularityType: "Marketplace",
      granularityId: MARKETPLACE_ID,
      details: true,
    }),
    getOrders: (daysPast = 7) => {
      const createdAfter = new Date(Date.now() - daysPast * 86400000).toISOString();
      return apiRequest("GET", "/orders/v0/orders", {
        MarketplaceIds: MARKETPLACE_ID,
        CreatedAfter: createdAfter,
      });
    },
    getOrderItems: (orderId) => apiRequest("GET", `/orders/v0/orders/${orderId}/orderItems`),
    getFeesEstimate: (asin, price) => apiRequest("POST", `/products/fees/v0/items/${asin}/feesEstimate`, {}, {
      FeesEstimateRequest: {
        MarketplaceId: MARKETPLACE_ID,
        IsAmazonFulfilled: true,
        PriceToEstimateFees: { ListingPrice: { CurrencyCode: region === "EU" ? "EUR" : "USD", Amount: price } },
        Identifier: asin,
      },
    }),
  };
}

module.exports = { createClient };

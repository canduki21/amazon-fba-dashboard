require("dotenv").config();
const axios = require("axios");

const cache = {};

async function getAccessToken(region = "NA") {
  const now = Date.now();
  if (cache[region]?.token && cache[region].expiry > now) return cache[region].token;

  const clientId     = region === "EU" ? process.env.AMAZON_CLIENT_ID_EU     : process.env.AMAZON_CLIENT_ID;
  const clientSecret = region === "EU" ? process.env.AMAZON_CLIENT_SECRET_EU : process.env.AMAZON_CLIENT_SECRET;
  const refreshToken = region === "EU" ? process.env.AMAZON_REFRESH_TOKEN_EU : process.env.AMAZON_REFRESH_TOKEN;

  const response = await axios.post(
    "https://api.amazon.com/auth/o2/token",
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  cache[region] = {
    token: response.data.access_token,
    expiry: now + response.data.expires_in * 1000 - 60000,
  };
  return cache[region].token;
}

module.exports = { getAccessToken };

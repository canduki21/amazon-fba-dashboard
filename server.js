require("dotenv").config();
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const { getOrders, getOrderItems, getInventory, searchCatalog, getListings } = require("./amazon");

const server = new Server(
  { name: "amazon-seller", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_orders",
      description: "Get recent Amazon orders",
      inputSchema: {
        type: "object",
        properties: {
          days: { type: "number", description: "How many days back to fetch (default 7)" },
        },
      },
    },
    {
      name: "get_order_items",
      description: "Get items for a specific order",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Amazon order ID" },
        },
        required: ["order_id"],
      },
    },
    {
      name: "get_inventory",
      description: "Get FBA inventory summary",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "search_catalog",
      description: "Search Amazon catalog by keyword",
      inputSchema: {
        type: "object",
        properties: {
          keywords: { type: "string", description: "Search keywords" },
        },
        required: ["keywords"],
      },
    },
    {
      name: "get_listings",
      description: "Get your active product listings",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    if (name === "get_orders") {
      result = await getOrders(args?.days || 7);
    } else if (name === "get_order_items") {
      result = await getOrderItems(args.order_id);
    } else if (name === "get_inventory") {
      result = await getInventory();
    } else if (name === "search_catalog") {
      result = await searchCatalog(args.keywords);
    } else if (name === "get_listings") {
      result = await getListings();
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();

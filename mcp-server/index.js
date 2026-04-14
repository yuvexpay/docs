#!/usr/bin/env node
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(
  readFileSync(join(__dirname, "..", "api-reference", "openapi.json"), "utf-8")
);

const server = new McpServer({
  name: "yuvexpay-docs",
  version: "1.0.0",
});

// --- Resources ---

server.resource("openapi-spec", "yuvexpay://openapi.json", async (uri) => ({
  contents: [
    {
      uri: uri.href,
      mimeType: "application/json",
      text: JSON.stringify(spec, null, 2),
    },
  ],
}));

server.resource(
  "api-overview",
  "yuvexpay://overview",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/markdown",
        text: buildOverview(),
      },
    ],
  })
);

server.resource(
  "endpoint",
  new ResourceTemplate("yuvexpay://endpoints/{method}/{path}", { list: undefined }),
  async (uri, { method, path }) => {
    const decodedPath = "/" + path.replace(/--/g, "/");
    const pathObj = spec.paths[decodedPath];
    if (!pathObj || !pathObj[method.toLowerCase()]) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: `Endpoint not found: ${method.toUpperCase()} ${decodedPath}`,
          },
        ],
      };
    }
    const op = pathObj[method.toLowerCase()];
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(op, null, 2),
        },
      ],
    };
  }
);

// --- Tools ---

server.tool(
  "list_endpoints",
  "List all available YuvexPay API endpoints with their HTTP method, path, and summary.",
  async () => {
    const endpoints = [];
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        if (typeof op === "object" && op.summary) {
          endpoints.push({
            method: method.toUpperCase(),
            path,
            summary: op.summary,
            tags: op.tags || [],
          });
        }
      }
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(endpoints, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "get_endpoint",
  "Get full details for a specific API endpoint including parameters, request body, and response schemas.",
  {
    method: z.string().describe("HTTP method (GET, POST, PATCH, DELETE)"),
    path: z.string().describe("API path, e.g. /v1/payments or /v1/payments/{paymentId}"),
  },
  async ({ method, path }) => {
    const pathObj = spec.paths[path];
    if (!pathObj) {
      return {
        content: [{ type: "text", text: `Path not found: ${path}\n\nAvailable paths:\n${Object.keys(spec.paths).join("\n")}` }],
      };
    }
    const op = pathObj[method.toLowerCase()];
    if (!op) {
      return {
        content: [{ type: "text", text: `Method ${method.toUpperCase()} not found for ${path}\n\nAvailable methods: ${Object.keys(pathObj).join(", ").toUpperCase()}` }],
      };
    }
    const resolved = resolveRefs(op);
    return {
      content: [{ type: "text", text: JSON.stringify(resolved, null, 2) }],
    };
  }
);

server.tool(
  "get_schema",
  "Get a component schema definition by name (e.g. Payment, CreatePaymentRequest, Error).",
  {
    name: z.string().describe("Schema name from the OpenAPI components"),
  },
  async ({ name }) => {
    const schema = spec.components?.schemas?.[name];
    if (!schema) {
      const available = Object.keys(spec.components?.schemas || {});
      return {
        content: [{ type: "text", text: `Schema not found: ${name}\n\nAvailable schemas:\n${available.join("\n")}` }],
      };
    }
    const resolved = resolveRefs(schema);
    return {
      content: [{ type: "text", text: JSON.stringify(resolved, null, 2) }],
    };
  }
);

server.tool(
  "search_endpoints",
  "Search API endpoints by keyword in summary, description, path, or tags.",
  {
    query: z.string().describe("Search query"),
  },
  async ({ query }) => {
    const q = query.toLowerCase();
    const results = [];
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        if (typeof op !== "object" || !op.summary) continue;
        const searchable = [
          path,
          op.summary,
          op.description,
          ...(op.tags || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (searchable.includes(q)) {
          results.push({
            method: method.toUpperCase(),
            path,
            summary: op.summary,
            tags: op.tags || [],
          });
        }
      }
    }
    return {
      content: [
        {
          type: "text",
          text: results.length
            ? JSON.stringify(results, null, 2)
            : `No endpoints found matching "${query}".`,
        },
      ],
    };
  }
);

server.tool(
  "get_webhook_events",
  "List all webhook event types that YuvexPay can deliver to your endpoint.",
  async () => {
    const events =
      spec.components?.schemas?.WebhookEventType?.enum || [];
    const webhooks = spec.webhooks || {};
    const details = Object.entries(webhooks).map(([name, hook]) => ({
      name,
      summary: hook.post?.summary,
      description: hook.post?.description,
    }));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ eventTypes: events, webhooks: details }, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "get_auth_info",
  "Get authentication instructions for the YuvexPay API.",
  async () => {
    const tokenEndpoint = spec.paths["/oauth/token"]?.post;
    return {
      content: [
        {
          type: "text",
          text: [
            "# YuvexPay API Authentication",
            "",
            "## OAuth 2.0 Client Credentials Flow",
            "",
            "1. Get client_id and client_secret from the YuvexPay dashboard.",
            '2. POST /oauth/token with grant_type: "client_credentials".',
            "3. Use the returned access_token as: Authorization: Bearer {token}",
            "4. Tokens expire in 1 hour. Max 2 active tokens per credential.",
            "",
            "## Environments",
            "- Access tokens: ypt_*",
            "- Production client_secret: sk_prod_*",
            "- Sandbox client_secret: sk_sandbox_*",
            "- Same URL: https://api.yuvexpay.com",
            "",
            "## Token Endpoint",
            "",
            tokenEndpoint ? JSON.stringify(resolveRefs(tokenEndpoint), null, 2) : "See /oauth/token",
          ].join("\n"),
        },
      ],
    };
  }
);

// --- Helpers ---

function resolveRefs(obj, depth = 0) {
  if (depth > 10) return obj;
  if (typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map((item) => resolveRefs(item, depth + 1));

  if (obj.$ref) {
    const refPath = obj.$ref.replace("#/", "").split("/");
    let resolved = spec;
    for (const segment of refPath) {
      resolved = resolved?.[segment];
    }
    return resolved ? resolveRefs(resolved, depth + 1) : obj;
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = resolveRefs(value, depth + 1);
  }
  return result;
}

function buildOverview() {
  const endpoints = [];
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (typeof op === "object" && op.summary) {
        endpoints.push(`- **${method.toUpperCase()} ${path}** — ${op.summary}`);
      }
    }
  }
  return [
    `# ${spec.info.title} v${spec.info.version}`,
    "",
    spec.info.description,
    "",
    `## Base URL\n\n${spec.servers?.map((s) => `- ${s.url} (${s.description})`).join("\n")}`,
    "",
    `## Endpoints\n\n${endpoints.join("\n")}`,
    "",
    `## Authentication\n\nBearer token via OAuth 2.0 client credentials. See POST /oauth/token.`,
  ].join("\n");
}

// --- Start ---

const transport = new StdioServerTransport();
await server.connect(transport);

import { TOOLS, executeTool } from "./tools";

interface Env {
  SERP_API_KEY: string;
  DEFAULT_GL?: string;
  DEFAULT_HL?: string;
  DEFAULT_TRENDS_GEO?: string;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function jsonRpcOk(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleMcpRequest(request: JsonRpcRequest, env: Env): Promise<JsonRpcResponse> {
  const id = request.id ?? null;
  switch (request.method) {
    case "initialize":
      return jsonRpcOk(id, {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "nuhah-serp-mcp", version: "1.0.0" },
      });
    case "notifications/initialized":
      return jsonRpcOk(id, {});
    case "tools/list":
      return jsonRpcOk(id, { tools: TOOLS });
    case "tools/call": {
      const params = request.params as { name: string; arguments?: Record<string, unknown> } | undefined;
      if (!params?.name) return jsonRpcError(id, -32602, "Missing tool name");
      return jsonRpcOk(id, await executeTool(params.name, params.arguments ?? {}, env));
    }
    case "ping":
      return jsonRpcOk(id, {});
    default:
      return jsonRpcError(id, -32601, `Method not found: ${request.method}`);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname === "/health" && request.method === "GET") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/mcp" && request.method === "POST") {
      try {
        const body = (await request.json()) as JsonRpcRequest | JsonRpcRequest[];
        if (Array.isArray(body)) {
          const results = await Promise.all(body.map((r) => handleMcpRequest(r, env)));
          return new Response(JSON.stringify(results), {
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        const result = await handleMcpRequest(body, env);
        return new Response(JSON.stringify(result), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Internal error";
        return new Response(JSON.stringify(jsonRpcError(null, -32700, msg)), {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }
    return new Response("Not found", { status: 404, headers: cors });
  },
};

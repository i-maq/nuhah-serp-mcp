/**
 * MCP tool definitions and handlers for SerpAPI.
 */

import * as serp from "./serp";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const TOOLS: ToolDef[] = [
  {
    name: "serp_search",
    description: `Run a Google search via SerpAPI. UK-localised by default (gl=uk, hl=en). Returns a clean SERP summary: top 10 organic results, top domains, People Also Ask, related searches, ads count, shopping presence, featured snippet and knowledge panel flags.

Useful for: SERP competitor analysis, assessing defensibility for a keyword, surfacing PAA for content planning, checking if a query has commercial intent (ads/shopping).

Set include_raw=true to return the full SerpAPI response object in addition to the summary.

Costs 1 SerpAPI credit per call.`,
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search query" },
        gl: { type: "string", description: "Country code (default: uk)" },
        hl: { type: "string", description: "Language code (default: en)" },
        num: { type: "number", description: "Number of organic results to request (default: 10, max: 100)" },
        location: { type: "string", description: "Optional location string, e.g. 'London, England, United Kingdom'. Note: using 'location' sometimes triggers SerpAPI DNS cache errors; prefer gl/hl alone if reliability matters." },
        include_raw: { type: "boolean", description: "If true, include the full SerpAPI response object alongside the summary (default: false)" },
      },
      required: ["q"],
    },
  },
  {
    name: "serp_autocomplete",
    description: `Get Google autocomplete suggestions for a seed query, UK-localised. Essential for keyword expansion and discovering real user phrasings.

Returns up to 15 suggestions ordered by Google's internal relevance.

Costs 1 SerpAPI credit per call.`,
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Seed query for autocomplete" },
        gl: { type: "string", description: "Country code (default: uk)" },
        hl: { type: "string", description: "Language code (default: en)" },
      },
      required: ["q"],
    },
  },
  {
    name: "serp_trends",
    description: `Google Trends time series for 1 to 5 comma-separated terms. UK-scoped by default (geo=GB, date=today 12-m).

Returns timeline data points, mean interest per query, and related topics/queries if available.

Useful for: comparing relative UK interest between candidate keywords, spotting seasonality, validating wedge-level demand.

Date formats: 'today 1-m', 'today 3-m', 'today 12-m', 'today 5-y', 'all', or a custom range like '2025-01-01 2025-12-31'.

Costs 1 SerpAPI credit per call.`,
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "One to five terms, comma-separated (e.g. 'aqiqah,islamic baby names,ramadan pregnant')" },
        geo: { type: "string", description: "Geo code (default: GB for United Kingdom). Use 'US' for United States, '' for worldwide, etc." },
        date: { type: "string", description: "Date range (default: 'today 12-m'). Examples: 'today 1-m', 'today 5-y', 'all', '2025-01-01 2025-12-31'." },
        data_type: { type: "string", description: "TIMESERIES (default), GEO_MAP, RELATED_TOPICS, RELATED_QUERIES" },
      },
      required: ["q"],
    },
  },
  {
    name: "serp_account",
    description: `Check SerpAPI account status: plan name, searches remaining this month, usage, rate limit. Does NOT cost a credit. Use this before running expensive batch research to confirm budget.`,
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

interface Env {
  SERP_API_KEY: string;
  DEFAULT_GL?: string;
  DEFAULT_HL?: string;
  DEFAULT_TRENDS_GEO?: string;
}

function serpOpts(env: Env): serp.SerpOpts {
  return {
    apiKey: env.SERP_API_KEY,
    defaultGl: env.DEFAULT_GL ?? "uk",
    defaultHl: env.DEFAULT_HL ?? "en",
    defaultTrendsGeo: env.DEFAULT_TRENDS_GEO ?? "GB",
  };
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  env: Env
): Promise<{ content: Array<{ type: string; text: string }> }> {
  if (!env.SERP_API_KEY) {
    return { content: [{ type: "text", text: "Error: SERP_API_KEY env var not configured. Run `wrangler secret put SERP_API_KEY`." }] };
  }
  const opts = serpOpts(env);

  try {
    let result: unknown;

    switch (name) {
      case "serp_search":
        result = await serp.search(opts, {
          q: args.q as string,
          gl: args.gl as string | undefined,
          hl: args.hl as string | undefined,
          num: args.num as number | undefined,
          location: args.location as string | undefined,
          include_raw: args.include_raw as boolean | undefined,
        });
        break;

      case "serp_autocomplete":
        result = await serp.autocomplete(opts, {
          q: args.q as string,
          gl: args.gl as string | undefined,
          hl: args.hl as string | undefined,
        });
        break;

      case "serp_trends":
        result = await serp.trends(opts, {
          q: args.q as string,
          geo: args.geo as string | undefined,
          date: args.date as string | undefined,
          data_type: args.data_type as string | undefined,
        });
        break;

      case "serp_account":
        result = await serp.account(opts);
        break;

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    }

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${message}` }] };
  }
}

# Nuhah SerpAPI MCP Server

SerpAPI MCP server for [Nuhah](https://nuhah.app), deployed as a Cloudflare Worker. Gives Claude direct access to Google SERPs, autocomplete, and Trends for SEO research.

Clone of the [nuhah-gsc-mcp](https://github.com/i-maq/nuhah-gsc-mcp) architecture, adapted for SerpAPI.

## Tools (4)

| Tool | Description | Credit cost |
|------|-------------|-------------|
| `serp_search` | Google search with UK localisation, returns clean SERP summary (top 10 organic, PAA, related, ads count, featured snippet flag, knowledge panel flag). Set `include_raw=true` for full response. | 1 |
| `serp_autocomplete` | Google autocomplete suggestions for a seed query | 1 |
| `serp_trends` | Google Trends time series for 1 to 5 terms, returns timeline + mean per query + related topics/queries | 1 |
| `serp_account` | Check SerpAPI plan and remaining credits | 0 (free) |

## Why this exists

Claude cannot search Google directly. It can web_search via Anthropic's index, but that does not return structured SERP data (PAA, related searches, ads, positions, domains). This MCP gives Claude the raw SERP intelligence needed for SEO competitor analysis, keyword research, and wedge strategy work.

Built for Nuhah's content strategy, usable for any SEO workflow.

## Setup

### 1. SerpAPI account

Sign up at [serpapi.com](https://serpapi.com). The free plan gives 250 searches/month. Paid plans start at $75/month for 5,000 searches. Copy your API key from [serpapi.com/manage-api-key](https://serpapi.com/manage-api-key).

### 2. Deploy

```bash
npm install
wrangler secret put SERP_API_KEY   # paste your SerpAPI key
wrangler deploy
```

### 3. Connect to Claude.ai

Add as MCP server in your Claude.ai project or Claude Desktop settings:
- URL: `https://nuhah-serp-mcp.<your-subdomain>.workers.dev/mcp`
- Transport: Streamable HTTP

## Configuration

All configuration lives in `wrangler.toml` under `[vars]`:

| Var | Default | Purpose |
|---|---|---|
| `DEFAULT_GL` | `uk` | Default country for Google search (ISO 3166-1 alpha-2) |
| `DEFAULT_HL` | `en` | Default language for Google search (ISO 639-1) |
| `DEFAULT_TRENDS_GEO` | `GB` | Default geo for Google Trends (ISO 3166-1 alpha-2) |

Override per-call via tool arguments.

## Architecture

```
src/
  serp.ts    SerpAPI client (search, autocomplete, trends, account)
  tools.ts   MCP tool definitions and execution handlers
  worker.ts  Cloudflare Worker HTTP + JSON-RPC router
```

## Local development

```bash
npm install
echo "SERP_API_KEY=your_key_here" > .dev.vars
npm run dev

# Test it
curl -X POST http://localhost:8787/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

curl -X POST http://localhost:8787/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"serp_account","arguments":{}}}'
```

## Known quirks

1. **`location` param** on `serp_search` sometimes triggers SerpAPI's "DNS cache overflow" 503 error. If a call fails, retry without location, using `gl`/`hl` alone is usually sufficient for country-level targeting.
2. **Free plan rate limit** is 250 searches/hour AND 250/month on the free tier. Burst usage can hit the hourly cap.
3. **Trends data** has a 1 to 7 day lag vs live Google Trends.

## Related projects

- [nuhah-gsc-mcp](https://github.com/i-maq/nuhah-gsc-mcp), Google Search Console MCP
- [nuhah-ga4-mcp](https://github.com/i-maq/nuhah-ga4-mcp), Google Analytics 4 MCP

Together these three MCPs give Claude a full SEO toolchain: SerpAPI for discovery and competitor intel, GSC for own-site search performance, GA4 for traffic behaviour.

## License

Private. Not for redistribution.

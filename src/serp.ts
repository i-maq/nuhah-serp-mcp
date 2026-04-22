/**
 * SerpAPI client for Cloudflare Workers.
 * Uses the fetch() global, no SDK required.
 * All calls are GET requests with api_key as a query parameter.
 */

export interface SerpOpts {
  apiKey: string;
  defaultGl: string;
  defaultHl: string;
  defaultTrendsGeo: string;
}

const BASE = "https://serpapi.com/search.json";
const ACCOUNT = "https://serpapi.com/account";

interface OrganicResult {
  position: number;
  title: string;
  link: string;
  displayed_link?: string;
  snippet?: string;
  source?: string;
  date?: string;
}

interface PaaItem {
  question: string;
  snippet?: string;
  title?: string;
  link?: string;
}

interface RelatedSearchItem {
  query: string;
  link?: string;
}

interface AdItem {
  position: number;
  title: string;
  link: string;
  source?: string;
  displayed_link?: string;
}

interface ShoppingItem {
  position: number;
  title: string;
  price?: string;
  source?: string;
  link?: string;
}

interface KnowledgeGraph {
  title?: string;
  type?: string;
  description?: string;
  source?: { link?: string; name?: string };
}

interface AnswerBox {
  type?: string;
  title?: string;
  answer?: string;
  snippet?: string;
  link?: string;
}

interface SerpSearchResponse {
  search_metadata?: { status?: string; id?: string };
  search_information?: { total_results?: number; query_displayed?: string };
  organic_results?: OrganicResult[];
  related_questions?: PaaItem[];
  related_searches?: RelatedSearchItem[];
  ads?: AdItem[];
  shopping_results?: ShoppingItem[];
  answer_box?: AnswerBox;
  featured_snippet?: AnswerBox;
  knowledge_graph?: KnowledgeGraph;
  error?: string;
}

export interface SearchSummary {
  query: string;
  status: string;
  total_results: number | null;
  organic: Array<Pick<OrganicResult, "position" | "title" | "link" | "snippet" | "source">>;
  top_domains: string[];
  people_also_ask: Array<{ question: string; snippet?: string }>;
  related_searches: string[];
  ads_count: number;
  shopping_count: number;
  has_featured_snippet: boolean;
  has_knowledge_panel: boolean;
  featured_snippet_source?: string;
  knowledge_panel_title?: string;
}

export interface AutocompleteSummary {
  seed: string;
  suggestions: string[];
}

export interface TrendsPoint {
  date: string;
  values: Array<{ query: string; value: number }>;
}

export interface TrendsSummary {
  queries: string[];
  geo: string;
  date_range: string;
  points: TrendsPoint[];
  mean_per_query: Record<string, number>;
  related_topics?: Record<string, Array<{ topic: string; value: number }>>;
  related_queries?: Record<string, Array<{ query: string; value: number }>>;
}

export interface AccountInfo {
  account_email?: string;
  plan_name?: string;
  plan_monthly_price?: number;
  searches_per_month?: number;
  total_searches_left?: number;
  this_month_usage?: number;
  account_rate_limit_per_hour?: number;
}

function domainOf(link: string): string {
  try {
    const u = new URL(link);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "nuhah-serp-mcp/1.0" },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SerpAPI ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`SerpAPI returned non-JSON: ${text.slice(0, 300)}`);
  }
}

function buildUrl(params: Record<string, string | number | undefined>, apiKey: string): string {
  const u = new URL(BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  }
  u.searchParams.set("api_key", apiKey);
  return u.toString();
}

export async function search(
  opts: SerpOpts,
  params: { q: string; gl?: string; hl?: string; num?: number; location?: string; include_raw?: boolean }
): Promise<SearchSummary | (SearchSummary & { raw: SerpSearchResponse })> {
  const gl = params.gl ?? opts.defaultGl;
  const hl = params.hl ?? opts.defaultHl;
  const url = buildUrl(
    {
      q: params.q,
      gl,
      hl,
      num: params.num,
      location: params.location,
    },
    opts.apiKey
  );
  const data = await getJson<SerpSearchResponse>(url);
  if (data.error) throw new Error(`SerpAPI error: ${data.error}`);

  const organic = (data.organic_results ?? []).slice(0, 10).map((r) => ({
    position: r.position,
    title: r.title,
    link: r.link,
    snippet: r.snippet,
    source: r.source,
  }));
  const top_domains = organic.map((r) => domainOf(r.link)).filter(Boolean);
  const paa = (data.related_questions ?? []).map((p) => ({
    question: p.question,
    snippet: p.snippet,
  }));
  const related = (data.related_searches ?? []).map((r) => r.query).filter(Boolean);
  const featured = data.answer_box ?? data.featured_snippet;

  const summary: SearchSummary = {
    query: params.q,
    status: data.search_metadata?.status ?? "unknown",
    total_results: data.search_information?.total_results ?? null,
    organic,
    top_domains,
    people_also_ask: paa,
    related_searches: related,
    ads_count: (data.ads ?? []).length,
    shopping_count: (data.shopping_results ?? []).length,
    has_featured_snippet: !!featured,
    has_knowledge_panel: !!data.knowledge_graph,
    featured_snippet_source: featured?.link,
    knowledge_panel_title: data.knowledge_graph?.title,
  };

  if (params.include_raw) {
    return { ...summary, raw: data };
  }
  return summary;
}

interface SerpAutocompleteResponse {
  suggestions?: Array<{ value: string; relevance?: number }>;
  error?: string;
}

export async function autocomplete(
  opts: SerpOpts,
  params: { q: string; gl?: string; hl?: string }
): Promise<AutocompleteSummary> {
  const url = buildUrl(
    {
      engine: "google_autocomplete",
      q: params.q,
      gl: params.gl ?? opts.defaultGl,
      hl: params.hl ?? opts.defaultHl,
    },
    opts.apiKey
  );
  const data = await getJson<SerpAutocompleteResponse>(url);
  if (data.error) throw new Error(`SerpAPI error: ${data.error}`);
  return {
    seed: params.q,
    suggestions: (data.suggestions ?? []).map((s) => s.value).filter(Boolean),
  };
}

interface TrendsTimelineValue {
  query: string;
  value?: string;
  extracted_value?: number;
}
interface TrendsTimelinePoint {
  date?: string;
  timestamp?: string;
  values: TrendsTimelineValue[];
}
interface SerpTrendsResponse {
  interest_over_time?: { timeline_data?: TrendsTimelinePoint[] };
  related_topics?: Record<string, { top?: Array<{ topic: { title?: string }; value?: number | string; extracted_value?: number }> }>;
  related_queries?: Record<string, { top?: Array<{ query?: string; value?: number | string; extracted_value?: number }> }>;
  error?: string;
}

export async function trends(
  opts: SerpOpts,
  params: { q: string; geo?: string; date?: string; data_type?: string }
): Promise<TrendsSummary> {
  const geo = params.geo ?? opts.defaultTrendsGeo;
  const date = params.date ?? "today 12-m";
  const dataType = params.data_type ?? "TIMESERIES";
  const url = buildUrl(
    {
      engine: "google_trends",
      q: params.q,
      geo,
      date,
      data_type: dataType,
    },
    opts.apiKey
  );
  const data = await getJson<SerpTrendsResponse>(url);
  if (data.error) throw new Error(`SerpAPI error: ${data.error}`);

  const timeline = data.interest_over_time?.timeline_data ?? [];
  const points: TrendsPoint[] = timeline.map((p) => ({
    date: p.date ?? p.timestamp ?? "",
    values: p.values.map((v) => ({
      query: v.query,
      value: v.extracted_value ?? Number(v.value) ?? 0,
    })),
  }));

  const queries: string[] = points[0]?.values.map((v) => v.query) ?? params.q.split(",").map((s) => s.trim());
  const means: Record<string, number> = {};
  for (const q of queries) {
    const vals = points.map((p) => p.values.find((v) => v.query === q)?.value ?? 0);
    means[q] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }

  const related_topics: Record<string, Array<{ topic: string; value: number }>> = {};
  if (data.related_topics) {
    for (const [k, v] of Object.entries(data.related_topics)) {
      related_topics[k] = (v.top ?? []).map((t) => ({
        topic: t.topic?.title ?? "",
        value: t.extracted_value ?? Number(t.value) ?? 0,
      })).filter((t) => t.topic);
    }
  }

  const related_queries: Record<string, Array<{ query: string; value: number }>> = {};
  if (data.related_queries) {
    for (const [k, v] of Object.entries(data.related_queries)) {
      related_queries[k] = (v.top ?? []).map((q) => ({
        query: q.query ?? "",
        value: q.extracted_value ?? Number(q.value) ?? 0,
      })).filter((q) => q.query);
    }
  }

  return {
    queries,
    geo,
    date_range: date,
    points,
    mean_per_query: means,
    related_topics: Object.keys(related_topics).length ? related_topics : undefined,
    related_queries: Object.keys(related_queries).length ? related_queries : undefined,
  };
}

export async function account(opts: SerpOpts): Promise<AccountInfo> {
  const url = `${ACCOUNT}?api_key=${encodeURIComponent(opts.apiKey)}`;
  const res = await fetch(url, { headers: { "User-Agent": "nuhah-serp-mcp/1.0" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`SerpAPI account ${res.status}: ${text.slice(0, 200)}`);
  const data = JSON.parse(text);
  return {
    account_email: data.account_email,
    plan_name: data.plan_name,
    plan_monthly_price: data.plan_monthly_price,
    searches_per_month: data.searches_per_month,
    total_searches_left: data.total_searches_left,
    this_month_usage: data.this_month_usage,
    account_rate_limit_per_hour: data.account_rate_limit_per_hour,
  };
}

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

type IncidentInsert = Database["public"]["Tables"]["incidents"]["Insert"];
type IncidentType = Database["public"]["Enums"]["incident_type"];

// Default RSS feeds covering Indian crime / hooch / liquor news.
// Override per-request via { feeds: [...] } in the POST body.
const DEFAULT_FEEDS = [
  "https://news.google.com/rss/search?q=hooch+tragedy+india&hl=en-IN&gl=IN&ceid=IN:en",
  "https://news.google.com/rss/search?q=illegal+liquor+seizure+india&hl=en-IN&gl=IN&ceid=IN:en",
  "https://news.google.com/rss/search?q=spurious+liquor+deaths+india&hl=en-IN&gl=IN&ceid=IN:en",
];

const MAX_ITEMS_PER_FEED = 8;
const MAX_AI_ITEMS = 12;

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripCdata(s: string): string {
  return s.replace(/^<!\[CDATA\[|\]\]>$/g, "").trim();
}

function tagText(item: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = item.match(re);
  if (!m) return "";
  return decodeEntities(stripCdata(m[1])).replace(/<[^>]+>/g, "").trim();
}

function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const re = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    items.push({
      title: tagText(block, "title"),
      link: tagText(block, "link"),
      pubDate: tagText(block, "pubDate"),
      description: tagText(block, "description"),
    });
    if (items.length >= MAX_ITEMS_PER_FEED) break;
  }
  return items;
}

interface ExtractedEvent {
  type: IncidentType;
  state_code: string;
  state_name?: string;
  district?: string | null;
  occurred_on: string; // YYYY-MM-DD
  casualties?: number | null;
  title: string;
  description?: string | null;
  is_relevant: boolean;
}

async function extractWithAI(
  apiKey: string,
  gatewayUrl: string,
  model: string,
  articles: { title: string; description: string; pubDate: string; link: string }[],
  validCodes: string[],
): Promise<ExtractedEvent[]> {
  const resp = await fetch(gatewayUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You extract structured incident records from Indian news headlines about alcohol-related events (hooch tragedies, illicit liquor seizures, alcohol-linked crime, alcohol-fuelled domestic violence). For each article, decide if it is relevant. Use only the listed Indian state codes. If the article is not about an Indian alcohol incident, mark is_relevant=false.",
        },
        {
          role: "user",
          content: `Valid Indian state codes: ${validCodes.join(", ")}.\n\nArticles:\n${articles
            .map(
              (a, i) =>
                `[${i}] title: ${a.title}\n    pubDate: ${a.pubDate}\n    desc: ${a.description.slice(0, 400)}`,
            )
            .join("\n\n")}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "record_incidents",
            description: "Return one structured record per article in the same order.",
            parameters: {
              type: "object",
              properties: {
                events: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      is_relevant: {
                        type: "boolean",
                        description:
                          "true only if the article is a real Indian alcohol-related incident.",
                      },
                      type: {
                        type: "string",
                        enum: [
                          "hooch_tragedy",
                          "illegal_seizure",
                          "domestic_violence",
                          "alcohol_crime",
                        ],
                      },
                      state_code: {
                        type: "string",
                        description: "2-letter Indian state code from the provided list.",
                      },
                      state_name: { type: "string" },
                      district: { type: "string", nullable: true },
                      occurred_on: {
                        type: "string",
                        description:
                          "Best-guess incident date as YYYY-MM-DD. Use the article pubDate if no event date is mentioned.",
                      },
                      casualties: { type: "number", nullable: true },
                      title: {
                        type: "string",
                        description: "Concise headline (≤140 chars) describing the incident.",
                      },
                      description: { type: "string", nullable: true },
                    },
                    required: [
                      "is_relevant",
                      "type",
                      "state_code",
                      "occurred_on",
                      "title",
                    ],
                    additionalProperties: false,
                  },
                },
              },
              required: ["events"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "record_incidents" } },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`AI provider ${resp.status}: ${body.slice(0, 200)}`);
  }

  const json = (await resp.json()) as {
    choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
  };
  const args =
    json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}";
  const parsed = JSON.parse(args) as { events?: ExtractedEvent[] };
  return parsed.events ?? [];
}

export const Route = createFileRoute("/hooks/ingest-news")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        try {
          // Auth: require x-cron header (for scheduled jobs) OR Authorization bearer.
          const ctx = request.headers.get("x-cron") ?? request.headers.get("x-ingest-context");
          const auth = request.headers.get("authorization");
          const cronSecret = request.headers.get("x-cron-secret");
          const expectedCronSecret = process.env.CRON_SECRET;
          const cronAuthorized =
            ctx === "cron" &&
            (!expectedCronSecret || cronSecret === expectedCronSecret);
          if (!cronAuthorized && !auth) {
            return Response.json({ error: "unauthorized" }, { status: 401 });
          }

          const apiKey = process.env.AI_API_KEY;
          const gatewayUrl =
            process.env.AI_GATEWAY_URL ?? "https://api.openai.com/v1/chat/completions";
          const model = process.env.AI_MODEL ?? "gpt-4o-mini";
          if (!apiKey) {
            return Response.json(
              { error: "AI_API_KEY not configured" },
              { status: 500 },
            );
          }

          let body: { feeds?: string[]; dryRun?: boolean } = {};
          try {
            body = (await request.json()) as typeof body;
          } catch {
            // empty body is fine
          }
          const feeds = body.feeds?.length ? body.feeds : DEFAULT_FEEDS;
          const dryRun = !!body.dryRun;

          // Pull state codes for validation.
          const { data: stateRows, error: stateErr } = await supabaseAdmin
            .from("states")
            .select("code, name");
          if (stateErr) throw new Error(stateErr.message);
          const validCodes = (stateRows ?? []).map((r) => r.code);

          // Fetch all feeds in parallel.
          const fetched = await Promise.all(
            feeds.map(async (url) => {
              try {
                const r = await fetch(url, {
                  headers: {
                    "User-Agent":
                      "SoberMap/1.0 (+https://sobermap.app) Mozilla/5.0",
                    Accept: "application/rss+xml, application/xml, text/xml",
                  },
                });
                if (!r.ok) return { url, items: [], error: `HTTP ${r.status}` };
                const xml = await r.text();
                return { url, items: parseRss(xml), error: null as string | null };
              } catch (e) {
                return {
                  url,
                  items: [] as RssItem[],
                  error: e instanceof Error ? e.message : "fetch failed",
                };
              }
            }),
          );

          const allItems = fetched.flatMap((f) =>
            f.items.map((it) => ({ ...it, feed: f.url })),
          );

          // Dedupe by link, keep most recent.
          const seenLinks = new Set<string>();
          const uniqueItems = allItems.filter((it) => {
            if (!it.link || seenLinks.has(it.link)) return false;
            seenLinks.add(it.link);
            return true;
          });

          // Skip items already ingested (matched by source_url).
          const links = uniqueItems.map((i) => i.link);
          let alreadyIngested = new Set<string>();
          if (links.length) {
            const { data: existing } = await supabaseAdmin
              .from("incidents")
              .select("source_url")
              .in("source_url", links);
            alreadyIngested = new Set(
              (existing ?? []).map((r) => r.source_url ?? "").filter(Boolean),
            );
          }

          const candidates = uniqueItems
            .filter((i) => !alreadyIngested.has(i.link))
            .slice(0, MAX_AI_ITEMS);

          if (candidates.length === 0) {
            return Response.json({
              success: true,
              feeds: fetched.map((f) => ({
                url: f.url,
                items: f.items.length,
                error: f.error,
              })),
              fetched: uniqueItems.length,
              new: 0,
              inserted: 0,
              durationMs: Date.now() - startedAt,
            });
          }

          // AI extraction.
          const extracted = await extractWithAI(
            apiKey,
            gatewayUrl,
            model,
            candidates,
            validCodes,
          );

          // Filter relevant + valid state codes.
          const validCodeSet = new Set(validCodes);
          const relevant = extracted
            .map((e, idx) => ({ e, src: candidates[idx] }))
            .filter(
              ({ e, src }) =>
                e &&
                src &&
                e.is_relevant &&
                validCodeSet.has(e.state_code) &&
                /^\d{4}-\d{2}-\d{2}$/.test(e.occurred_on),
            );

          const rows: IncidentInsert[] = relevant.map(({ e, src }) => ({
            title: e.title.slice(0, 240),
            type: e.type,
            state_code: e.state_code,
            district: e.district ?? null,
            occurred_on: e.occurred_on,
            casualties: e.casualties ?? 0,
            description: e.description ?? src.description.slice(0, 500) ?? null,
            source_url: src.link,
          }));

          let inserted = 0;
          if (!dryRun && rows.length) {
            const { error: insErr, count } = await supabaseAdmin
              .from("incidents")
              .insert(rows, { count: "exact" });
            if (insErr) throw new Error(insErr.message);
            inserted = count ?? rows.length;
          }

          return Response.json({
            success: true,
            durationMs: Date.now() - startedAt,
            feeds: fetched.map((f) => ({
              url: f.url,
              items: f.items.length,
              error: f.error,
            })),
            fetched: uniqueItems.length,
            new: candidates.length,
            extracted: extracted.length,
            relevant: rows.length,
            inserted,
            dryRun,
            preview: rows.slice(0, 5),
          });
        } catch (err) {
          console.error("[ingest-news] failed:", err);
          return Response.json(
            {
              error: err instanceof Error ? err.message : "ingest failed",
              durationMs: Date.now() - startedAt,
            },
            { status: 500 },
          );
        }
      },
    },
  },
});

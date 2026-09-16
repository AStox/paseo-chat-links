import {
  mentionKey,
  parseMentions,
  type Mention,
} from "../shared/parse";
import { pluginEnv } from "./env";

const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const TICKET_NOUL = 0.9;
const PR_NOUL = 0.9;

export type ThreadLine = { role: "user" | "assistant"; text: string; at: string };

export type Thread = {
  title: string;
  lines: ThreadLine[];
};

function addScores(
  scores: Map<string, { mention: Mention; score: number }>,
  text: string,
  weight: number,
  shorthand: boolean,
) {
  for (const mention of parseMentions(text, { shorthand })) {
    const key = mentionKey(mention);
    const prev = scores.get(key);
    if (prev) prev.score += weight;
    else scores.set(key, { mention, score: weight });
  }
}

function ranked(thread: Thread): Array<{ mention: Mention; score: number }> {
  const scores = new Map<string, { mention: Mention; score: number }>();
  addScores(scores, thread.title, 100, true);
  const users = thread.lines.filter((line) => line.role === "user");
  if (users[0]) addScores(scores, users[0].text, 50, true);
  for (const line of users.slice(1)) addScores(scores, line.text, 20, true);
  for (const line of thread.lines) {
    if (line.role !== "assistant") continue;
    addScores(scores, line.text, 2, false);
  }
  return [...scores.values()].sort((left, right) => right.score - left.score);
}

function label(mention: Mention): string {
  return mention.kind === "linear" ? mention.id : `${mention.owner}/${mention.repo}#${mention.number}`;
}

function snippet(thread: Thread, mention: Mention): string {
  const needle = mention.kind === "linear" ? mention.id : `#${mention.number}`;
  for (const line of thread.lines) {
    const at = line.text.toUpperCase().indexOf(needle.toUpperCase());
    if (at < 0) continue;
    return line.text.slice(Math.max(0, at - 80), at + 160).replace(/\s+/g, " ").trim();
  }
  return "";
}

async function typesafeKey(): Promise<string> {
  return pluginEnv("TYPESAFE_API_KEY");
}

async function askJev(
  thread: Thread,
  candidates: Mention[],
  titles: Record<string, string>,
): Promise<Mention[]> {
  if (candidates.length === 0) return [];
  const key = await typesafeKey();
  if (!key) {
    throw new Error("TYPESAFE_API_KEY is missing. Set it on the daemon or in ~/.paseo/chat-links.env");
  }

  const questions: Record<
    string,
    { type: "noul"; instructions: string; criteria: { true: string; false: string } }
  > = {};
  candidates.forEach((mention, index) => {
    const name = label(mention);
    const itemTitle = titles[mentionKey(mention)];
    const kind = mention.kind === "linear" ? "Linear ticket" : "GitHub pull request";
    questions[`c${index}`] = {
      type: "noul",
      instructions: itemTitle
        ? `Is ${name} (${itemTitle}) a ${kind} this chat is working on (implementing, testing, reviewing, or tracking)?`
        : `Is ${name} a ${kind} this chat is working on (implementing, testing, reviewing, or tracking)?`,
      criteria: {
        true: "The chat is doing work on this item, including testing or reviewing an existing PR or creating the ticket",
        false: "A passing mention, docs, example, EIP/ERC, or someone else's item",
      },
    };
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(JEV_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "jev-latest",
        state: {
          title: thread.title || "",
          conversation: thread.lines.map((line) => ({ role: line.role, text: line.text })),
          candidates: candidates.map((mention) => ({
            id: label(mention),
            kind: mention.kind === "linear" ? "linear" : "pr",
            title: titles[mentionKey(mention)] || "",
            snippet: snippet(thread, mention),
          })),
        },
        questions,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Jev HTTP ${res.status}`);
  const body = (await res.json()) as { answers?: Record<string, { noul?: number }> };
  const answers = body.answers ?? {};
  const scored = candidates.map((mention, index) => ({
    mention,
    noul: answers[`c${index}`]?.noul ?? 0,
  }));
  const picked: Mention[] = [];
  picked.push(
    ...scored
      .filter((row) => row.mention.kind === "linear" && row.noul >= TICKET_NOUL)
      .sort((a, b) => b.noul - a.noul)
      .slice(0, 3)
      .map((row) => row.mention),
  );
  picked.push(
    ...scored
      .filter((row) => row.mention.kind === "pr" && row.noul >= PR_NOUL)
      .sort((a, b) => b.noul - a.noul)
      .slice(0, 3)
      .map((row) => row.mention),
  );
  return picked;
}
function ticketsFromKeptPrTitles(picked: Mention[], titles: Record<string, string>): Mention[] {
  const have = new Set(picked.map(mentionKey));
  const extra: Mention[] = [];
  for (const mention of picked) {
    if (mention.kind !== "pr") continue;
    const title = titles[mentionKey(mention)];
    if (!title) continue;
    for (const found of parseMentions(title)) {
      if (found.kind !== "linear") continue;
      const key = mentionKey(found);
      if (have.has(key)) continue;
      have.add(key);
      extra.push(found);
    }
  }
  return extra;
}

export function threadMentions(thread: Thread): Mention[] {
  return ranked(thread).map((row) => row.mention);
}

export async function pickSessionLinks(
  thread: Thread,
  titles: Record<string, string> = {},
): Promise<{ mentions: Mention[]; error: string | null }> {
  const candidates = threadMentions(thread);
  if (candidates.length === 0) return { mentions: [], error: null };
  try {
    const picked = await askJev(thread, candidates, titles);
    return { mentions: [...picked, ...ticketsFromKeptPrTitles(picked, titles)], error: null };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const message =
      error instanceof Error && (error.name === "AbortError" || /aborted/i.test(raw))
        ? "Jev timed out"
        : raw;
    console.log(`chat-links jev failed: ${message}`);
    return { mentions: [], error: message };
  }
}

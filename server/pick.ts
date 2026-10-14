import {
  mentionKey,
  parseMentions,
  type Mention,
} from "../shared/parse";
import { pluginEnv } from "./env";

const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

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

export function pickByNoul<T>(rows: Array<{ item: T; noul: number }>): T[] {
  const sorted = [...rows].sort((left, right) => right.noul - left.noul);
  const high = sorted.filter((row) => row.noul >= 0.9);
  if (high.length) return high.map((row) => row.item);
  const mid = sorted.filter((row) => row.noul >= 0.75).slice(0, 3);
  if (mid.length) return mid.map((row) => row.item);
  return sorted.filter((row) => row.noul >= 0.5).slice(0, 2).map((row) => row.item);
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
    const kind = mention.kind === "pr" ? "pull request" : "Linear ticket";
    questions[`c${index}`] = {
      type: "noul",
      instructions: itemTitle
        ? `Is ${name} (${itemTitle}) the ${kind} this conversation is using to address the problem it discussed?`
        : `Is ${name} the ${kind} this conversation is using to address the problem it discussed?`,
      criteria: {
        true: "The chat is implementing, opening, or waiting on this for the problem in the conversation",
        false: "Mentioned only as background or prior work",
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
  if (!res.ok) {
    let detail = "";
    try {
      const text = (await res.text()).trim();
      try {
        const parsed = JSON.parse(text) as {
          error?: { message?: unknown } | string;
          message?: unknown;
          detail?: unknown;
        };
        const found = [
          typeof parsed.error === "object" ? parsed.error?.message : undefined,
          parsed.message,
          parsed.error,
          parsed.detail,
        ].find((value): value is string => typeof value === "string");
        detail = found ?? "";
      } catch {
        detail = text;
      }
    } catch {
      detail = "";
    }
    detail = detail.trim().slice(0, 200);
    throw new Error(detail ? `Jev HTTP ${res.status}: ${detail}` : `Jev HTTP ${res.status}`);
  }
  const body = (await res.json()) as { answers?: Record<string, { noul?: number }> };
  if (!body.answers || typeof body.answers !== "object") throw new Error("Jev returned no answers");
  const answers = body.answers;
  const scored = candidates.map((mention, index) => ({
    mention,
    noul: answers[`c${index}`]?.noul ?? 0,
  }));
  const picked: Mention[] = [];
  picked.push(
    ...pickByNoul(
      scored.filter((row) => row.mention.kind === "linear").map((row) => ({ item: row.mention, noul: row.noul })),
    ),
  );
  picked.push(
    ...pickByNoul(
      scored.filter((row) => row.mention.kind === "pr").map((row) => ({ item: row.mention, noul: row.noul })),
    ),
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
): Promise<{ mentions: Mention[]; jevError: string | null }> {
  const candidates = threadMentions(thread);
  if (candidates.length === 0) return { mentions: [], jevError: null };
  try {
    const picked = await askJev(thread, candidates, titles);
    return { mentions: [...picked, ...ticketsFromKeptPrTitles(picked, titles)], jevError: null };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const message =
      error instanceof Error && (error.name === "AbortError" || /aborted/i.test(raw))
        ? "Jev timed out"
        : raw;
    console.log(`chat-links jev failed: ${message}`);
    return { mentions: candidates, jevError: message };
  }
}

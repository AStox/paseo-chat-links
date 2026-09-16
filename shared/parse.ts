export type LinearMention = { kind: "linear"; id: string };
export type PrMention = { kind: "pr"; owner: string; repo: string; number: number };
export type Mention = LinearMention | PrMention;

const NOT_LINEAR: Record<string, true> = {
  ISO: true,
  UTF: true,
  SHA: true,
  HTTP: true,
  HTML: true,
  JSON: true,
  YAML: true,
  CVE: true,
  RFC: true,
  WIP: true,
  TODO: true,
  ASCII: true,
  EIP: true,
  ERC: true,
};

export function mentionKey(mention: Mention): string {
  if (mention.kind === "linear") return `linear:${mention.id}`;
  return `pr:${mention.owner}/${mention.repo}#${mention.number}`;
}

export function parseMentions(text: string, opts: { shorthand?: boolean } = {}): Mention[] {
  const found = new Map<string, Mention>();

  for (const match of text.matchAll(
    /https?:\/\/linear\.app\/[\w-]+\/issue\/([A-Z][A-Z0-9]+-\d+)/gi,
  )) {
    const id = match[1].toUpperCase();
    found.set(`linear:${id}`, { kind: "linear", id });
  }

  for (const match of text.matchAll(/(?<![A-Z0-9])([A-Z]{2,5}-\d+)\b/g)) {
    const id = match[1].toUpperCase();
    const team = id.slice(0, id.indexOf("-"));
    if (NOT_LINEAR[team]) continue;
    found.set(`linear:${id}`, { kind: "linear", id });
  }

  for (const match of text.matchAll(
    /https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/gi,
  )) {
    const owner = match[1];
    const repo = match[2].replace(/\.git$/, "");
    const number = Number(match[3]);
    found.set(`pr:${owner}/${repo}#${number}`, { kind: "pr", owner, repo, number });
  }

  if (opts.shorthand) {
    for (const match of text.matchAll(/\b([\w.-]+\/[\w.-]+)#(\d+)\b/g)) {
      const [owner, repo] = match[1].split("/");
      if (!owner || !repo || owner.includes(".")) continue;
      const number = Number(match[2]);
      found.set(`pr:${owner}/${repo}#${number}`, { kind: "pr", owner, repo, number });
    }
  }

  return [...found.values()];
}

export function parsePrRef(text: string): PrMention | null {
  const match = text.trim().match(/^([\w.-]+)\/([\w.-]+)#(\d+)$/);
  if (!match) return null;
  return { kind: "pr", owner: match[1], repo: match[2].replace(/\.git$/, ""), number: Number(match[3]) };
}

export function parsePickResponse(raw: string): { ticket: LinearMention | null; prs: PrMention[] } {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { ticket: null, prs: [] };
  let data: { result?: unknown; ticket?: string | null; prs?: string[] };
  try {
    data = JSON.parse(jsonMatch[0]) as { result?: unknown; ticket?: string | null; prs?: string[] };
  } catch {
    return { ticket: null, prs: [] };
  }
  if (data.result && typeof data.result === "object") {
    data = data.result as { ticket?: string | null; prs?: string[] };
  } else if (typeof data.result === "string") {
    const nested = data.result.match(/\{[\s\S]*\}/);
    if (nested) {
      try {
        data = JSON.parse(nested[0]) as { ticket?: string | null; prs?: string[] };
      } catch {
        return { ticket: null, prs: [] };
      }
    }
  }
  const ticketId = data.ticket?.toUpperCase().trim() ?? "";
  const ticket =
    ticketId && /^[A-Z]{2,5}-\d+$/.test(ticketId) && !NOT_LINEAR[ticketId.slice(0, ticketId.indexOf("-"))]
      ? { kind: "linear" as const, id: ticketId }
      : null;
  const prs: PrMention[] = [];
  const seen = new Set<string>();
  for (const ref of data.prs ?? []) {
    const pr = parsePrRef(String(ref));
    if (!pr) continue;
    const key = mentionKey(pr);
    if (seen.has(key)) continue;
    seen.add(key);
    prs.push(pr);
    if (prs.length === 3) break;
  }
  return { ticket, prs };
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { mentionKey, type Mention } from "../shared/parse";
import type { ChatLinkItem } from "../shared/rpc";
import { pluginEnv } from "./env";
import { pickSessionLinks, threadMentions, type Thread, type ThreadLine } from "./pick";

const HOME = process.env.HOME || os.homedir();
const SEEN_PATH = path.join(
  process.env.PASEO_HOME || path.join(HOME, ".paseo"),
  "plugin-data",
  "chat-links",
  "seen.json",
);
const LINEAR_CREDENTIALS = path.join(HOME, ".config", "linear", "credentials.toml");
const POLL_PAGES = 4;
const PAGE_SIZE = 200;

type SeenMap = Record<string, string>;

let githubToken = "";
let linearToken = "";
let githubMe: string | null = null;
let linearMe: string | null = null;
let secretsLoaded = false;

async function readLinearToken(): Promise<string> {
  try {
    const text = await readFile(LINEAR_CREDENTIALS, "utf8");
    const values: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*"(.*)"\s*$/);
      if (match) values[match[1]] = match[2];
    }
    const workspace = values.default;
    if (workspace && values[workspace]) return values[workspace];
    for (const [key, value] of Object.entries(values)) {
      if (key === "default" || !value) continue;
      return value;
    }
  } catch {
    // no Linear CLI credentials
  }
  return "";
}

async function loadSecrets(): Promise<void> {
  if (secretsLoaded) return;
  githubToken =
    (await pluginEnv("GITHUB_TOKEN")) || (await pluginEnv("GH_TOKEN")) || "";
  linearToken = (await pluginEnv("LINEAR_API_KEY")) || (await readLinearToken());
  secretsLoaded = true;
}

async function readSeen(): Promise<SeenMap> {
  try {
    return JSON.parse(await readFile(SEEN_PATH, "utf8")) as SeenMap;
  } catch {
    return {};
  }
}

async function writeSeen(seen: SeenMap): Promise<void> {
  await mkdir(path.dirname(SEEN_PATH), { recursive: true });
  await writeFile(SEEN_PATH, `${JSON.stringify(seen, null, 2)}\n`);
}

function visibleLine(entry: unknown): ThreadLine | null {
  if (!entry || typeof entry !== "object") return null;
  const rec = entry as { timestamp?: string; item?: { type?: string; text?: string }; type?: string; text?: string };
  const item = rec.item ?? rec;
  const at = rec.timestamp ?? "";
  if (item.type === "user_message" && item.text?.trim()) {
    return { role: "user", text: item.text, at };
  }
  if (item.type === "assistant_message" && item.text?.trim()) {
    return { role: "assistant", text: item.text, at };
  }
  return null;
}

async function collectThread(
  paseo: PluginHandlerContext["paseo"],
  agentId: string,
): Promise<Thread> {
  const lines: ThreadLine[] = [];
  let title = "";
  let page = await paseo.agents.ref(agentId).timeline.refetch({
    direction: "tail",
    limit: PAGE_SIZE,
  });
  title = page.agent?.title ?? "";
  for (const entry of page.entries) {
    const line = visibleLine(entry);
    if (line) lines.push(line);
  }
  let guard = 0;
  while (page.hasOlder && page.startCursor && guard < POLL_PAGES - 1) {
    guard += 1;
    page = await paseo.agents.ref(agentId).timeline.refetch({
      direction: "before",
      cursor: page.startCursor,
      limit: PAGE_SIZE,
    });
    if (!title) title = page.agent?.title ?? "";
    for (const entry of page.entries) {
      const line = visibleLine(entry);
      if (line) lines.push(line);
    }
  }
  lines.sort((left, right) => left.at.localeCompare(right.at));
  return { title, lines };
}

async function graphql(
  url: string,
  token: string,
  query: string,
  variables: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as {
    data?: unknown;
    errors?: Array<{ message: string }>;
  };
  if (!response.ok) {
    throw new Error(`${response.status} ${body.errors?.[0]?.message ?? response.statusText}`);
  }
  if (body.errors?.[0]) throw new Error(body.errors[0].message);
  return body.data;
}

async function githubGraphql(query: string, variables: Record<string, unknown>): Promise<unknown> {
  return graphql("https://api.github.com/graphql", githubToken, query, variables, {
    "user-agent": "paseo-chat-links",
    accept: "application/vnd.github+json",
  });
}

async function linearGraphql(query: string, variables: Record<string, unknown>): Promise<unknown> {
  return graphql("https://api.linear.app/graphql", linearToken, query, variables, {
    authorization: linearToken,
  });
}

async function fetchTitles(mentions: Mention[]): Promise<Record<string, string>> {
  const titles: Record<string, string> = {};
  const tickets = mentions.filter((mention) => mention.kind === "linear");
  const prs = mentions.filter((mention) => mention.kind === "pr");
  const work: Promise<void>[] = [];
  if (linearToken && tickets.length > 0) {
    const variables: Record<string, unknown> = {};
    const fields = tickets.map((mention, index) => {
      variables[`id${index}`] = mention.id;
      return `t${index}: issue(id: $id${index}) { title }`;
    });
    const args = tickets.map((_, index) => `$id${index}: String!`).join(", ");
    work.push(
      linearGraphql(`query (${args}) { ${fields.join("\n")} }`, variables)
        .then((data) => {
          const rows = data as Record<string, { title?: string } | null>;
          tickets.forEach((mention, index) => {
            const title = rows[`t${index}`]?.title?.trim();
            if (title) titles[mentionKey(mention)] = title;
          });
        })
        .catch(() => {}),
    );
  }
  if (githubToken && prs.length > 0) {
    const variables: Record<string, unknown> = {};
    const fields = prs.map((mention, index) => {
      variables[`o${index}`] = mention.owner;
      variables[`n${index}`] = mention.repo;
      variables[`num${index}`] = mention.number;
      return `p${index}: repository(owner: $o${index}, name: $n${index}) { pullRequest(number: $num${index}) { title } }`;
    });
    const args = prs
      .map((_, index) => `$o${index}: String!, $n${index}: String!, $num${index}: Int!`)
      .join(", ");
    work.push(
      githubGraphql(`query (${args}) { ${fields.join("\n")} }`, variables)
        .then((data) => {
          const rows = data as Record<string, { pullRequest?: { title?: string } | null } | null>;
          prs.forEach((mention, index) => {
            const title = rows[`p${index}`]?.pullRequest?.title?.trim();
            if (title) titles[mentionKey(mention)] = title;
          });
        })
        .catch(() => {}),
    );
  }
  if (work.length === 0) return titles;
  await Promise.race([
    Promise.all(work),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);
  return titles;
}

function countNew(timestamps: string[], lastSeen: string | undefined, scannedAt: string): number {
  if (!lastSeen) return 0;
  return timestamps.filter((stamp) => stamp > lastSeen && stamp <= scannedAt).length;
}

async function resolveLinear(mention: Extract<Mention, { kind: "linear" }>, lastSeen: string | undefined, scannedAt: string): Promise<ChatLinkItem | null> {
  const data = (await linearGraphql(
    `query ($id: String!) {
      issue(id: $id) {
        identifier
        title
        url
        updatedAt
        state { name type }
        assignee { displayName }
        comments(first: 50) { nodes { createdAt user { displayName } } }
      }
    }`,
    { id: mention.id },
  )) as {
    issue: {
      identifier: string;
      title: string;
      url: string;
      updatedAt: string;
      state: { name: string; type: string } | null;
      assignee: { displayName: string } | null;
      comments: { nodes: Array<{ createdAt: string; user: { displayName: string } | null }> };
    } | null;
  };
  if (!data.issue) return null;
  const issue = data.issue;
  const comments = issue.comments.nodes.filter((node) => {
    const name = node.user?.displayName?.toLowerCase() ?? "";
    return !linearMe || name !== linearMe;
  });
  const newComments = countNew(comments.map((node) => node.createdAt), lastSeen, scannedAt);
  const reasons: string[] = [];
  if (newComments > 0) reasons.push(`${newComments} new comment${newComments === 1 ? "" : "s"}`);
  const stateName = issue.state?.name ?? "Unknown";
  if (/block|review required/i.test(stateName)) reasons.push(stateName);
  const assignedToMe = !!linearMe && issue.assignee?.displayName.toLowerCase() === linearMe;
  if (assignedToMe && /review/i.test(stateName)) reasons.push("your review");
  return {
    id: mentionKey(mention),
    kind: "linear",
    label: issue.identifier,
    title: issue.title,
    url: issue.url,
    status: stateName,
    needsAttention: reasons.length > 0,
    newComments,
    reasons,
    updatedAt: issue.updatedAt,
    error: null,
  };
}

async function resolvePr(mention: Extract<Mention, { kind: "pr" }>, lastSeen: string | undefined, scannedAt: string): Promise<ChatLinkItem> {
  const data = (await githubGraphql(
    `query ($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $number) {
          title
          url
          state
          isDraft
          mergeable
          reviewDecision
          updatedAt
          reviewRequests(first: 20) {
            nodes { requestedReviewer { ... on User { login } } }
          }
          comments(last: 50) { nodes { updatedAt author { login } } }
          reviews(last: 40) { nodes { submittedAt author { login } } }
          reviewThreads(first: 40) {
            nodes {
              isResolved
              comments(last: 1) { nodes { updatedAt author { login } } }
            }
          }
          commits(last: 1) {
            nodes { commit { statusCheckRollup { state } } }
          }
        }
      }
    }`,
    { owner: mention.owner, name: mention.repo, number: mention.number },
  )) as {
    repository: {
      pullRequest: {
        title: string;
        url: string;
        state: string;
        isDraft: boolean;
        mergeable: string | null;
        reviewDecision: string | null;
        updatedAt: string;
        reviewRequests: { nodes: Array<{ requestedReviewer: { login?: string } | null }> };
        comments: { nodes: Array<{ updatedAt: string; author: { login: string } | null }> };
        reviews: { nodes: Array<{ submittedAt: string | null; author: { login: string } | null }> };
        reviewThreads: {
          nodes: Array<{
            isResolved: boolean;
            comments: { nodes: Array<{ updatedAt: string; author: { login: string } | null }> };
          }>;
        };
        commits: { nodes: Array<{ commit: { statusCheckRollup: { state: string } | null } }> };
      } | null;
    } | null;
  };
  const pr = data.repository?.pullRequest;
  if (!pr) {
    return {
      id: mentionKey(mention),
      kind: "pr",
      label: `${mention.owner}/${mention.repo}#${mention.number}`,
      title: `PR #${mention.number}`,
      url: `https://github.com/${mention.owner}/${mention.repo}/pull/${mention.number}`,
      status: "missing",
      needsAttention: false,
      newComments: 0,
      reasons: [],
      updatedAt: null,
      error: "PR not found",
    };
  }

  const stamps: string[] = [];
  for (const node of pr.comments.nodes) {
    if (githubMe && node.author?.login === githubMe) continue;
    stamps.push(node.updatedAt);
  }
  for (const node of pr.reviews.nodes) {
    if (!node.submittedAt) continue;
    if (githubMe && node.author?.login === githubMe) continue;
    stamps.push(node.submittedAt);
  }
  for (const thread of pr.reviewThreads.nodes) {
    const last = thread.comments.nodes.at(-1);
    if (!last) continue;
    if (githubMe && last.author?.login === githubMe) continue;
    stamps.push(last.updatedAt);
  }
  const newComments = countNew(stamps, lastSeen, scannedAt);
  const reasons: string[] = [];
  if (newComments > 0) reasons.push(`${newComments} new comment${newComments === 1 ? "" : "s"}`);
  if (pr.reviewDecision === "CHANGES_REQUESTED") reasons.push("changes requested");
  if (pr.mergeable === "CONFLICTING") reasons.push("merge conflict");
  const check = pr.commits.nodes[0]?.commit.statusCheckRollup?.state;
  if (check === "FAILURE" || check === "ERROR") reasons.push("checks failing");
  const reviewRequested = pr.reviewRequests.nodes.some(
    (node) => githubMe && node.requestedReviewer?.login === githubMe,
  );
  if (reviewRequested) reasons.push("review requested");
  const unresolved = pr.reviewThreads.nodes.filter((thread) => !thread.isResolved).length;
  if (unresolved > 0) reasons.push(`${unresolved} unresolved thread${unresolved === 1 ? "" : "s"}`);

  const statusParts = [pr.isDraft ? "draft" : pr.state.toLowerCase()];
  if (pr.reviewDecision) statusParts.push(pr.reviewDecision.toLowerCase().replaceAll("_", " "));

  return {
    id: mentionKey(mention),
    kind: "pr",
    label: `${mention.owner}/${mention.repo}#${mention.number}`,
    title: pr.title,
    url: pr.url,
    status: statusParts.join(" · "),
    needsAttention: reasons.length > 0,
    newComments,
    reasons,
    updatedAt: pr.updatedAt,
    error: null,
  };
}

async function resolveMention(
  mention: Mention,
  lastSeen: string | undefined,
  scannedAt: string,
): Promise<ChatLinkItem | null> {
  try {
    if (mention.kind === "linear") {
      if (!linearToken) {
        return {
          id: mentionKey(mention),
          kind: "linear",
          label: mention.id,
          title: mention.id,
          url: `https://linear.app/issue/${mention.id}`,
          status: "unknown",
          needsAttention: false,
          newComments: 0,
          reasons: [],
          updatedAt: null,
          error: "Linear token missing",
        };
      }
      return await resolveLinear(mention, lastSeen, scannedAt);
    }
    if (!githubToken) {
      return {
        id: mentionKey(mention),
        kind: "pr",
        label: `${mention.owner}/${mention.repo}#${mention.number}`,
        title: `PR #${mention.number}`,
        url: `https://github.com/${mention.owner}/${mention.repo}/pull/${mention.number}`,
        status: "unknown",
        needsAttention: false,
        newComments: 0,
        reasons: [],
        updatedAt: null,
        error: "GitHub token missing",
      };
    }
    return await resolvePr(mention, lastSeen, scannedAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (mention.kind === "linear" && /not found|Entity not found/i.test(message)) return null;
    const label =
      mention.kind === "linear"
        ? mention.id
        : `${mention.owner}/${mention.repo}#${mention.number}`;
    return {
      id: mentionKey(mention),
      kind: mention.kind,
      label,
      title: label,
      url:
        mention.kind === "linear"
          ? `https://linear.app/issue/${mention.id}`
          : `https://github.com/${mention.owner}/${mention.repo}/pull/${mention.number}`,
      status: "error",
      needsAttention: false,
      newComments: 0,
      reasons: [],
      updatedAt: null,
      error: message,
    };
  }
}

export async function listChatLinks(
  input: { agentId: string },
  { paseo }: PluginHandlerContext,
): Promise<{ items: ChatLinkItem[]; scannedAt: string; error: string | null }> {
  const scannedAt = new Date().toISOString();
  await loadSecrets();
  if (githubToken && githubMe === null) {
    try {
      const data = (await githubGraphql(`query { viewer { login } }`, {})) as {
        viewer: { login: string };
      };
      githubMe = data.viewer.login;
    } catch {
      githubMe = "";
    }
  }
  if (linearToken && linearMe === null) {
    try {
      const data = (await linearGraphql(`query { viewer { displayName } }`, {})) as {
        viewer: { displayName: string };
      };
      linearMe = data.viewer.displayName.toLowerCase();
    } catch {
      linearMe = "";
    }
  }

  let thread: Thread;
  try {
    thread = await collectThread(paseo, input.agentId);
  } catch (error) {
    return {
      items: [],
      scannedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const titles = await fetchTitles(threadMentions(thread));
  const picked = await pickSessionLinks(thread, titles);
  console.log(
    `chat-links ${input.agentId} ${thread.lines.length} lines -> ${picked.mentions.map((mention) => mentionKey(mention)).join(",") || "none"}${picked.error ? ` error=${picked.error}` : ""}`,
  );
  const seen = await readSeen();
  const items = (
    await Promise.all(picked.mentions.map((mention) => resolveMention(mention, seen[mentionKey(mention)], scannedAt)))
  ).filter((item): item is ChatLinkItem => item !== null);

  let wrote = false;
  for (const item of items) {
    if (!seen[item.id]) {
      seen[item.id] = scannedAt;
      wrote = true;
    }
  }
  if (wrote) await writeSeen(seen);

  return { items, scannedAt, error: picked.error };
}

export async function markChatLinkSeen(input: { id: string }, _context: PluginHandlerContext): Promise<{ ok: boolean }> {
  const seen = await readSeen();
  seen[input.id] = new Date().toISOString();
  await writeSeen(seen);
  return { ok: true };
}

import type { ChatLinkItem } from "../shared/rpc";

type GithubThread = {
  id: string;
  unread?: boolean;
  reason?: string;
  subject?: { type?: string; url?: string; title?: string };
};

type LinearNote = {
  id: string;
  readAt?: string | null;
  type?: string;
  issue?: { identifier?: string } | null;
};

function githubReason(reason: string | undefined): string | null {
  switch (reason) {
    case "comment":
    case "mention":
    case "team_mention":
      return "new comments";
    case "review_requested":
      return "review requested";
    case "ci_activity":
      return "checks started";
    case "assign":
      return "assigned";
    case "state_change":
      return "status changed";
    default:
      return null;
  }
}

function linearReason(type: string | undefined): string | null {
  const t = (type ?? "").toLowerCase();
  if (!t) return null;
  if (t.includes("comment")) return "new comments";
  if (t.includes("assign")) return "assigned";
  if (t.includes("status") || t.includes("state")) return "status changed";
  if (t.includes("priority")) return "priority changed";
  return null;
}

function prSubject(url: string | undefined, item: ChatLinkItem): boolean {
  if (item.kind !== "pr" || !url) return false;
  const match = item.label.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (!match) return false;
  const [, owner, repo, num] = match;
  const needle = `${owner}/${repo}`;
  return url.includes(needle) && (url.endsWith(`/pulls/${num}`) || url.endsWith(`/issues/${num}`));
}

export function overlayGithub(notes: GithubThread[], items: ChatLinkItem[]): {
  reasons: Map<string, string[]>;
  threads: Map<string, string[]>;
} {
  const reasons = new Map<string, string[]>();
  const threads = new Map<string, string[]>();
  for (const item of items) {
    if (item.kind !== "pr") continue;
    const matched = notes.filter((note) => note.unread !== false && prSubject(note.subject?.url, item));
    const labels = matched.map((note) => githubReason(note.reason)).filter((v): v is string => Boolean(v));
    if (labels.length) reasons.set(item.id, labels);
    const ids = matched.map((note) => note.id).filter(Boolean);
    if (ids.length) threads.set(item.id, ids);
  }
  return { reasons, threads };
}
export async function githubUnread(
  token: string,
  items: ChatLinkItem[],
): Promise<{ reasons: Map<string, string[]>; threads: Map<string, string[]> }> {
  const reasons = new Map<string, string[]>();
  const threads = new Map<string, string[]>();
  if (!token || items.every((item) => item.kind !== "pr")) return { reasons, threads };
  try {
    const response = await fetch("https://api.github.com/notifications?all=false&per_page=50", {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "user-agent": "paseo-chat-links",
      },
    });
    if (!response.ok) return { reasons, threads };
    const notes = (await response.json()) as GithubThread[];
    return overlayGithub(notes, items);
  } catch {
    // overlay is optional
  }
  return { reasons, threads };
}

export async function linearUnread(
  token: string,
  items: ChatLinkItem[],
): Promise<{ reasons: Map<string, string[]>; ids: Map<string, string[]> }> {
  const reasons = new Map<string, string[]>();
  const ids = new Map<string, string[]>();
  if (!token || items.every((item) => item.kind !== "linear")) return { reasons, ids };
  try {
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        authorization: token,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: `query {
          notifications(first: 50) {
            nodes {
              id
              readAt
              type
              issue { identifier }
            }
          }
        }`,
      }),
    });
    const body = (await response.json()) as {
      data?: { notifications?: { nodes?: LinearNote[] } };
      errors?: Array<{ message: string }>;
    };
    if (body.errors?.[0] || !body.data?.notifications?.nodes) return { reasons, ids };
    const notes = body.data.notifications.nodes.filter((note) => !note.readAt);
    for (const item of items) {
      if (item.kind !== "linear") continue;
      const matched = notes.filter((note) => note.issue?.identifier === item.label);
      const labels = matched.map((note) => linearReason(note.type)).filter((v): v is string => Boolean(v));
      if (labels.length) reasons.set(item.id, labels);
      const noteIds = matched.map((note) => note.id).filter(Boolean);
      if (noteIds.length) ids.set(item.id, noteIds);
    }
  } catch {
    // overlay is optional
  }
  return { reasons, ids };
}

export async function markGithubThreads(token: string, threadIds: string[]): Promise<void> {
  await Promise.all(
    threadIds.map((id) =>
      fetch(`https://api.github.com/notifications/threads/${id}`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "user-agent": "paseo-chat-links",
        },
      }).catch(() => undefined),
    ),
  );
}

export async function markLinearNotes(token: string, noteIds: string[]): Promise<void> {
  const at = new Date().toISOString();
  await Promise.all(
    noteIds.map((id) =>
      fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
          authorization: token,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          query: `mutation ($id: String!, $at: DateTime!) {
            notificationUpdate(id: $id, input: { readAt: $at }) { success }
          }`,
          variables: { id, at },
        }),
      }).catch(() => undefined),
    ),
  );
}

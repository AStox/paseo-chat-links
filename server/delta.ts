export type Snapshot = {
  at: string;
  status: string;
  stateType: string | null;
  checks: string | null;
  assignee: string | null;
  priority: string | null;
  legacy?: true;
};

export type SnapshotStore = Record<string, Snapshot | string>;

export function parseSnapshot(raw: Snapshot | string | undefined): Snapshot | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    return { at: raw, status: "", stateType: null, checks: null, assignee: null, priority: null, legacy: true };
  }
  if (!raw.at) return null;
  return raw;
}

export function snapshotFromItem(item: {
  status: string;
  stateType: string | null;
  checks: string | null;
  assignee: string | null;
  priority: string | null;
}, at: string): Snapshot {
  return {
    at,
    status: item.status,
    stateType: item.stateType,
    checks: item.checks,
    assignee: item.assignee,
    priority: item.priority,
  };
}

export function reviewOf(status: string): string | null {
  const parts = status.split(" · ");
  return parts[1]?.trim() || null;
}

function title(word: string): string {
  return word.replace(/\b\w/g, (c) => c.toUpperCase());
}

function lifecycle(stateType: string | null, status: string): string | null {
  const type = (stateType ?? "").toLowerCase();
  const name = status.toLowerCase();
  if (type === "merged" || /\bmerged\b/.test(name)) return "merged";
  if (type === "closed" || /\bclosed\b/.test(name)) return "closed";
  if (type === "completed" || /done|complete|shipped/.test(name)) return "completed";
  if (type === "canceled" || /cancel|duplicate/.test(name)) return "canceled";
  return null;
}

export function namedDeltas(input: {
  snapshot: Snapshot | null;
  now: string;
  status: string;
  stateType: string | null;
  checks: string | null;
  assignee: string | null;
  priority: string | null;
  commentTimes: string[];
}): string[] {
  const snap = input.snapshot;
  if (!snap) return [];
  const reasons: string[] = [];

  const n = input.commentTimes.filter((stamp) => stamp > snap.at && stamp <= input.now).length;
  if (n > 0) reasons.push(`${n} new comment${n === 1 ? "" : "s"}`);
  if (snap.legacy) return reasons;

  if (snap.checks !== input.checks) {
    if (input.checks === "failing") reasons.push("checks failed");
    else if (input.checks === "passing") reasons.push("checks passed");
    else if (input.checks === "pending") reasons.push("checks started");
  }

  const prevReview = reviewOf(snap.status);
  const nextReview = reviewOf(input.status);
  if (prevReview !== nextReview && nextReview) {
    if (nextReview === "review required") reasons.push("review requested");
    else reasons.push(nextReview);
  }

  const prevLife = lifecycle(snap.stateType, snap.status);
  const nextLife = lifecycle(input.stateType, input.status);
  if (prevLife !== nextLife && nextLife) reasons.push(nextLife);
  else if (snap.status !== input.status && !nextLife) {
    const head = input.status.split(" · ")[0]?.trim();
    if (head && head !== snap.status.split(" · ")[0]?.trim()) reasons.push(head);
  }

  if (snap.assignee !== input.assignee) {
    reasons.push(input.assignee ? `assigned ${input.assignee}` : "unassigned");
  }
  if (snap.priority !== input.priority && input.priority) {
    reasons.push(`priority ${title(input.priority)}`);
  }

  return reasons;
}

export function mergeReasons(base: string[], extra: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const comment = (value: string) => /comment/i.test(value);
  for (const reason of [...base, ...extra]) {
    const key = comment(reason) ? "comments" : reason.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(reason);
  }
  return out;
}

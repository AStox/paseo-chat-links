import assert from "node:assert/strict";
import { overlayGithub } from "./inbox";
import type { ChatLinkItem } from "../shared/rpc";

const item = {
  id: "pr:goldsky-io/compose#475",
  kind: "pr" as const,
  label: "goldsky-io/compose#475",
  title: "x",
  url: "https://github.com/goldsky-io/compose/pull/475",
  status: "open",
  stateType: "open",
  avatarUrl: null,
  assignee: null,
  priority: null,
  project: null,
  checks: null,
  needsAttention: false,
  newComments: 0,
  reasons: [],
  updatedAt: null,
  error: null,
} satisfies ChatLinkItem;

const { reasons } = overlayGithub(
  [
    {
      id: "1",
      unread: true,
      reason: "comment",
      subject: { type: "PullRequest", url: "https://api.github.com/repos/goldsky-io/compose/pulls/475" },
    },
    {
      id: "2",
      unread: true,
      reason: "comment",
      subject: { type: "PullRequest", url: "https://api.github.com/repos/goldsky-io/compose/pulls/999" },
    },
  ],
  [item],
);

assert.deepEqual(reasons.get(item.id), ["new comments"]);
assert.equal(overlayGithub([], [item]).reasons.size, 0);
console.log("inbox tests ok");

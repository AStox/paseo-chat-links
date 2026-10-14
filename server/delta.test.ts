import assert from "node:assert/strict";
import { namedDeltas, parseSnapshot, mergeReasons, type Snapshot } from "./delta";

const at = "2026-09-18T12:00:00.000Z";
const later = "2026-09-18T13:00:00.000Z";
const snap: Snapshot = {
  at,
  status: "open",
  stateType: "open",
  checks: "pending",
  assignee: "astx",
  priority: null,
};

function run(partial: Partial<Parameters<typeof namedDeltas>[0]> = {}) {
  return namedDeltas({
    snapshot: snap,
    now: later,
    status: "open",
    stateType: "open",
    checks: "pending",
    assignee: "astx",
    priority: null,
    commentTimes: [],
    ...partial,
  });
}

assert.deepEqual(
  run({ checks: "failing" }),
  ["checks failed"],
  "pending to failing",
);

assert.deepEqual(
  run({
    commentTimes: ["2026-09-18T12:30:00.000Z", "2026-09-18T12:45:00.000Z"],
  }),
  ["2 new comments"],
  "comments after snapshot",
);

assert.deepEqual(
  namedDeltas({
    snapshot: null,
    now: later,
    status: "open",
    stateType: "open",
    checks: "failing",
    assignee: "astx",
    priority: null,
    commentTimes: [later],
  }),
  [],
  "no snapshot means no field deltas",
);

assert.deepEqual(run({ checks: "failing", snapshot: { ...snap, checks: "failing" } }), [], "still failing is quiet");

assert.deepEqual(
  run({ status: "done", stateType: "completed", checks: "pending" }),
  ["completed"],
  "ticket completed",
);

assert.deepEqual(parseSnapshot("2026-09-18T12:00:00.000Z")?.at, at);
assert.equal(parseSnapshot("2026-09-18T12:00:00.000Z")?.checks, null);

assert.deepEqual(
  mergeReasons(["2 new comments"], ["new comments"]),
  ["2 new comments"],
  "dedup comment reasons",
);

assert.deepEqual(
  run({ status: "open · approved", checks: "pending" }),
  ["approved"],
  "review decision changed",
);

assert.deepEqual(
  run({ assignee: "benny", checks: "pending" }),
  ["assigned benny"],
  "assignee changed",
);

const legacy = parseSnapshot(at);
const legacyInput = {
  snapshot: legacy,
  now: later,
  status: "In Progress",
  stateType: "started",
  checks: null,
  assignee: "adam",
  priority: "High",
};
assert.deepEqual(
  namedDeltas({ ...legacyInput, commentTimes: ["2026-09-18T12:30:00.000Z"] }),
  ["1 new comment"],
  "legacy snapshot only reports comments",
);
assert.deepEqual(namedDeltas({ ...legacyInput, commentTimes: [] }), [], "legacy snapshot has no field deltas");

console.log("delta tests ok");

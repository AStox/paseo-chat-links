import assert from "node:assert/strict";
import { namedDeltas, snapshotFromItem } from "./delta";

const item = {
  status: "open · approved",
  stateType: "open",
  checks: "failing",
  assignee: "astx",
  priority: null,
};
const snap = snapshotFromItem(item, "2026-09-18T15:00:00.000Z");
assert.deepEqual(
  namedDeltas({
    snapshot: snap,
    now: "2026-09-18T16:00:00.000Z",
    ...item,
    commentTimes: ["2026-09-18T14:00:00.000Z"],
  }),
  [],
  "after a successful click, unchanged fields and older comments are quiet",
);
console.log("mark-seen tests ok");

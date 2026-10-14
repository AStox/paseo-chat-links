import assert from "node:assert/strict";
import { pickSessionLinks, pickByNoul, threadMentions, type Thread } from "./pick";

assert.deepEqual(
  pickByNoul([
    { item: "a", noul: 0.94 },
    { item: "b", noul: 0.91 },
    { item: "c", noul: 0.87 },
  ]),
  ["a", "b"],
  "all at or above 0.9",
);

assert.deepEqual(
  pickByNoul([
    { item: "a", noul: 0.87 },
    { item: "b", noul: 0.81 },
    { item: "c", noul: 0.76 },
    { item: "d", noul: 0.75 },
  ]),
  ["a", "b", "c"],
  "top 3 at or above 0.75 when none hit 0.9",
);

assert.deepEqual(
  pickByNoul([
    { item: "a", noul: 0.62 },
    { item: "b", noul: 0.51 },
    { item: "c", noul: 0.5 },
  ]),
  ["a", "b"],
  "top 2 at or above 0.5 when none hit 0.75",
);

assert.deepEqual(pickByNoul([{ item: "a", noul: 0.49 }]), [], "below 0.5 is empty");

const realFetch = globalThis.fetch;
const realKey = process.env.TYPESAFE_API_KEY;
process.env.TYPESAFE_API_KEY = "test";
globalThis.fetch = (async () =>
  new Response(JSON.stringify({ error: { message: "Insufficient credits" } }), {
    status: 402,
  })) as typeof fetch;
try {
  const thread: Thread = {
    title: "",
    lines: [
      { role: "user", text: "please look at ENG-123", at: "2026-01-01T00:00:00Z" },
      {
        role: "assistant",
        text: "opened https://github.com/acme/web/pull/42",
        at: "2026-01-01T00:01:00Z",
      },
    ],
  };
  const fallback = await pickSessionLinks(thread);
  assert.deepEqual(fallback.mentions, threadMentions(thread), "jev failure falls back to every mention");
  assert.equal(fallback.mentions.length, 2);
  assert.equal(fallback.jevError, "Jev HTTP 402: Insufficient credits");
} finally {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.TYPESAFE_API_KEY;
  else process.env.TYPESAFE_API_KEY = realKey;
}

console.log("pick tests ok");

import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const ChatLinkItemSchema = z.object({
  id: z.string(),
  kind: z.enum(["linear", "pr"]),
  label: z.string(),
  title: z.string(),
  url: z.string(),
  status: z.string(),
  needsAttention: z.boolean(),
  newComments: z.number().int().nonnegative(),
  reasons: z.array(z.string()),
  updatedAt: z.string().nullable(),
  error: z.string().nullable(),
});

export const listChatLinksRpc = defineRpc({
  name: "chat-links.list",
  input: z.object({ agentId: z.string() }),
  output: z.object({
    items: z.array(ChatLinkItemSchema),
    scannedAt: z.string(),
    error: z.string().nullable(),
  }),
});

export const markChatLinkSeenRpc = defineRpc({
  name: "chat-links.mark-seen",
  input: z.object({ id: z.string() }),
  output: z.object({ ok: z.boolean() }),
});

export type ChatLinkItem = z.infer<typeof ChatLinkItemSchema>;

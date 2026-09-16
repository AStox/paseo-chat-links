import type { PluginServerContext } from "@getpaseo/plugin/server";
import { listChatLinks, markChatLinkSeen } from "./server/scan";
import { listChatLinksRpc, markChatLinkSeenRpc } from "./shared/rpc";

export default function contribute(server: PluginServerContext) {
  server.handle(listChatLinksRpc, listChatLinks);
  server.handle(markChatLinkSeenRpc, markChatLinkSeen);
  return () => {};
}

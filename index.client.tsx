import type { PluginClientContext } from "@getpaseo/plugin/client";
import { contributeChrome } from "./client/chrome";
import { ChatLinksPanel, ChatLinksStatus, ChatLinksWorkspacePanel } from "./client/panel";

export default function contribute(client: PluginClientContext) {
  client.addSettingsScreen({
    id: "chat-links",
    title: "Chat links",
    icon: "Link",
    Component: ChatLinksStatus,
  });
  client.addWorkspacePanel({
    id: "chat-links-workspace",
    title: "Chat links",
    icon: "Link",
    context: "workspace",
    locations: ["explorer"],
    Component: ChatLinksWorkspacePanel,
  });
  client.addWorkspacePanel({
    id: "chat-links",
    title: "Chat links",
    icon: "Link",
    context: "agent",
    locations: ["explorer"],
    Component: ChatLinksPanel,
  });
  client.addCommandCenterItem({
    id: "open-chat-links",
    title: "Open chat links",
    icon: "Link",
    keywords: ["linear", "github", "pr", "ticket", "links"],
    context: "agent",
    onSelect({ openPanel }) {
      openPanel("chat-links", { location: "explorer" });
    },
  });
  client.addSlashCommand({
    name: "links",
    description: "Open Linear tickets and GitHub PRs from this chat",
    argumentHint: "",
    context: "agent",
    onSubmit({ openPanel }) {
      openPanel("chat-links", { location: "explorer" });
    },
  });
  try {
    return contributeChrome(client);
  } catch (error) {
    console.error("Chat links chrome failed", error);
    return () => {};
  }
}

import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { focusedAgentId, setFocusedAgent } from "./focus";
import { LinksIcon } from "./icon";

type AgentRef = { id: string; workspaceId?: string | null };

type AgentsApi = {
  list: (input: unknown) => Promise<{
    entries?: { agent: AgentRef }[];
    subscription?: {
      subscribe: (handlers: {
        snapshot: (page: { entries: { agent: AgentRef }[] }) => void;
        update: (message: {
          type?: string;
          payload?: { kind?: string; agentId?: string; agent?: AgentRef };
        }) => void;
      }) => void;
    };
  }>;
};

function agentsApi(client: PluginClientContext): AgentsApi | undefined {
  return (client as PluginClientContext & { paseo?: { agents?: AgentsApi } }).paseo?.agents;
}

export function contributeChrome(client: PluginClientContext) {
  const agents = agentsApi(client);
  if (!agents?.list) return () => {};

  const pills = new Map<string, { workspaceId: string; registration: PluginButtonRegistration }>();
  const headers = new Map<string, PluginButtonRegistration>();
  let stopped = false;
  const lifetime = new AbortController();

  const openLinks = (workspaceId: string, agentId: string | null) => {
    if (agentId) setFocusedAgent(agentId);
    client.openPanel("chat-links-workspace", { workspaceId, location: "explorer" });
  };

  const register = (agent: AgentRef) => {
    if (stopped || !agent.workspaceId) return;
    const workspaceId = agent.workspaceId;
    const agentId = agent.id;

    if (!headers.has(workspaceId)) {
      headers.set(
        workspaceId,
        client.addHeaderButton({
          id: "chat-links",
          workspaceId,
          button: {
            title: "Chat links",
            icon: LinksIcon,
            label: "Links",
            behavior: {
              kind: "action",
              onPress() {
                openLinks(workspaceId, focusedAgentId());
              },
            },
          },
        }),
      );
    }

    // Re-adding a live pill remounts its icon, which would read as the chat newly coming on screen.
    if (pills.get(agentId)?.workspaceId === workspaceId) return;
    pills.get(agentId)?.registration.remove();
    pills.set(agentId, {
      workspaceId,
      registration: client.addComposerPill({
        id: "chat-links",
        workspaceId,
        agentId,
        button: {
          title: "Chat links",
          icon: LinksIcon,
          label: "Links",
          behavior: {
            kind: "action",
            onPress() {
              openLinks(workspaceId, agentId);
            },
          },
        },
      }),
    });
  };

  const removeAgent = (id: string) => {
    pills.get(id)?.registration.remove();
    pills.delete(id);
  };

  void agents
    .list({
      subscribe: {},
      signal: lifetime.signal,
      filter: { includeArchived: false },
      page: { limit: 200 },
    })
    .then((result) => {
      if (stopped) return;
      if (result.subscription) {
        result.subscription.subscribe({
          snapshot: ({ entries }) => {
            const live = new Set(entries.map(({ agent }) => agent.id));
            for (const id of [...pills.keys()]) if (!live.has(id)) removeAgent(id);
            for (const { agent } of entries) register(agent);
          },
          update: (message) => {
            if (message.type !== "agent_update") return;
            const update = message.payload;
            if (!update) return;
            if (update.kind === "remove" && update.agentId) removeAgent(update.agentId);
            else if (update.agent) register(update.agent);
          },
        });
        return;
      }
      for (const { agent } of result.entries ?? []) register(agent);
    })
    .catch(async () => {
      if (stopped) return;
      try {
        const page = await agents.list({
          filter: { includeArchived: false },
          page: { limit: 200 },
        });
        if (stopped) return;
        for (const { agent } of page.entries ?? []) register(agent);
      } catch (error) {
        if (!stopped) console.error("Chat links agent list failed", error);
      }
    });

  return () => {
    stopped = true;
    lifetime.abort();
    for (const pill of pills.values()) pill.registration.remove();
    pills.clear();
    for (const header of headers.values()) header.remove();
    headers.clear();
  };
}

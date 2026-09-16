import {
  type PluginAgentPanelProps,
  type PluginHostProps,
  type PluginWorkspacePanelProps,
  useRpc,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { listChatLinksRpc, markChatLinkSeenRpc, type ChatLinkItem } from "../shared/rpc";
import { GITHUB_COLOR, GITHUB_ICON_URI, LINEAR_COLOR, LINEAR_ICON_URI } from "./brands";
import { useFocusedAgent } from "./focus";
import { openExternal } from "./web";
type ThemeLayout = Pick<PluginHostProps, "theme" | "layout">;

function statusTone(item: ChatLinkItem): { bg: string; fg: string } {
  const text = `${item.status} ${item.error ?? ""}`.toLowerCase();
  if (item.kind === "pr") {
    if (/merged/.test(text)) return { bg: "#8250df", fg: "#ffffff" };
    if (/closed/.test(text)) return { bg: "#cf222e", fg: "#ffffff" };
    if (/draft/.test(text)) return { bg: "#656d76", fg: "#ffffff" };
    if (/changes requested|fail|conflict|error|missing/.test(text)) {
      return { bg: "#cf222e", fg: "#ffffff" };
    }
    if (/approved|open|review/.test(text)) return { bg: "#1f883d", fg: "#ffffff" };
  }
  if (/block/.test(text)) return { bg: "#eb5757", fg: "#ffffff" };
  if (/cancel|duplicate/.test(text)) return { bg: "#6b6f76", fg: "#ffffff" };
  if (/done|complete|shipped/.test(text)) return { bg: "#4cb782", fg: "#ffffff" };
  if (/review/.test(text)) return { bg: "#5e6ad2", fg: "#ffffff" };
  if (/progress|started|doing/.test(text)) return { bg: "#f2c94c", fg: "#1a1a1a" };
  if (/todo|backlog|triage|unstarted|unknown/.test(text)) return { bg: "#6b6f76", fg: "#ffffff" };
  return { bg: "#6b6f76", fg: "#ffffff" };
}

function useLinkStyles({ theme, layout }: ThemeLayout) {
  const compact = layout.compact;
  const radius = compact ? 12 : 14;
  return useMemo(
    () => ({
      screen: {
        flex: 1,
        backgroundColor: theme.colors.surface0,
      },
      content: {
        padding: compact ? 12 : 16,
        gap: 10,
      },
      card: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 12,
        padding: compact ? 12 : 14,
        borderRadius: radius,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        minHeight: 44,
      },
      cardPressed: {
        backgroundColor: theme.colors.surface2,
      },
      well: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        flexShrink: 0,
      },
      wellLinear: {
        backgroundColor: LINEAR_COLOR,
      },
      wellGithub: {
        backgroundColor: GITHUB_COLOR,
      },
      wellWait: {
        backgroundColor: theme.colors.surface2,
      },
      body: {
        flex: 1,
        minWidth: 0,
        gap: 6,
      },
      ident: {
        color: theme.colors.foreground,
        fontSize: compact ? 14 : 15,
        fontWeight: "600" as const,
        flexShrink: 1,
      },
      title: {
        color: theme.colors.foregroundMuted,
        fontSize: compact ? 13 : 14,
        lineHeight: compact ? 18 : 20,
      },
      statusPill: {
        alignSelf: "flex-start" as const,
        maxWidth: "100%" as const,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
      },
      statusText: {
        fontSize: compact ? 12 : 13,
        fontWeight: "700" as const,
        lineHeight: compact ? 16 : 18,
      },
      reasons: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 6,
      },
      chip: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: theme.colors.surface2,
      },
      chipText: {
        color: theme.colors.statusWarning,
        fontSize: 12,
      },
      empty: {
        color: theme.colors.foregroundMuted,
        fontSize: compact ? 13 : 14,
        lineHeight: compact ? 18 : 20,
      },
      attention: { color: theme.colors.statusDanger, fontSize: 13 },
    }),
    [theme, compact, radius],
  );
}

function ItemRows({
  items,
  theme,
  layout,
  onOpen,
}: {
  items: ChatLinkItem[];
  theme: PluginHostProps["theme"];
  layout: PluginHostProps["layout"];
  onOpen: (item: ChatLinkItem) => void;
}) {
  const styles = useLinkStyles({ theme, layout });
  return (
    <>
      {items.map((item) => {
        const kind = item.kind === "linear" ? "Ticket" : "Pull request";
        const tone = statusTone(item);
        const mark = 18;
        const status = item.error ?? item.status;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="link"
            accessibilityLabel={`${kind} ${item.label} ${status} ${item.title}`}
            onPress={() => onOpen(item)}
            style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
          >
            <View
              style={[
                styles.well,
                item.kind === "linear" ? styles.wellLinear : styles.wellGithub,
              ]}
            >
              <Image
                accessibilityIgnoresInvertColors
                source={{ uri: item.kind === "linear" ? LINEAR_ICON_URI : GITHUB_ICON_URI }}
                style={{ width: mark, height: mark }}
              />
            </View>
            <View style={styles.body}>
              <Text style={styles.ident} numberOfLines={1}>
                {item.label}
              </Text>
              <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
                <Text style={[styles.statusText, { color: tone.fg }]}>{status}</Text>
              </View>
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              {item.reasons.length > 0 || item.newComments > 0 ? (
                <View style={styles.reasons}>
                  {item.newComments > 0 ? (
                    <View style={styles.chip}>
                      <Icon name="MessageCircle" size={12} color={theme.colors.statusWarning} />
                      <Text style={styles.chipText}>{item.newComments} new</Text>
                    </View>
                  ) : null}
                  {item.reasons.map((reason) => (
                    <View key={reason} style={styles.chip}>
                      <Icon name="AlertTriangle" size={12} color={theme.colors.statusWarning} />
                      <Text style={styles.chipText}>{reason}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </>
  );
}

function useOpenItem(queryKey: unknown[]) {
  const markSeen = useRpc(markChatLinkSeenRpc);
  const queryClient = useQueryClient();
  const seen = useMutation({
    mutationFn: (item: ChatLinkItem) => markSeen({ id: item.id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  return (item: ChatLinkItem) => {
    void (async () => {
      await seen.mutateAsync(item);
      try {
        await openExternal(item.url);
      } catch {
        // URL open is best-effort
      }
    })();
  };
}

function LinksForAgent({
  theme,
  layout,
  agentId,
  visit,
}: ThemeLayout & { agentId: string | null | undefined; visit: number }) {
  const list = useRpc(listChatLinksRpc);
  const queryKey = ["chat-links", agentId, visit];
  const query = useQuery({
    queryKey,
    queryFn: () => list({ agentId: agentId as string }),
    enabled: Boolean(agentId),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });
  const styles = useLinkStyles({ theme, layout });
  const ready = Boolean(agentId) && query.isFetchedAfterMount && query.isSuccess;
  const items = ready ? query.data?.items ?? [] : [];
  const onOpen = useOpenItem(queryKey);



  return (
    <>
      {agentId && !ready ? (
        <View style={styles.card}>
          <View style={[styles.well, styles.wellWait]}>
            <ActivityIndicator size="small" color={theme.colors.accent} />
          </View>
          <View style={styles.body}>
            <Text style={styles.ident}>Reading chat</Text>
            <Text style={styles.title}>Finding the ticket and PR…</Text>
          </View>
        </View>
      ) : null}
      {query.data?.error ? (
        <View style={styles.card}>
          <View style={styles.body}>
            <Text style={styles.ident}>Could not load links</Text>
            <Text style={styles.attention}>{query.data.error}</Text>
          </View>
        </View>
      ) : null}
      {query.error ? (
        <View style={styles.card}>
          <View style={styles.body}>
            <Text style={styles.ident}>Could not load links</Text>
            <Text style={styles.attention}>
              {query.error instanceof Error ? query.error.message : String(query.error)}
            </Text>
          </View>
        </View>
      ) : null}
      {!agentId ? (
        <View style={styles.card}>
          <View style={styles.body}>
            <Text style={styles.title}>Switch to a chat to load its ticket and PR.</Text>
          </View>
        </View>
      ) : null}
      {ready && items.length === 0 && !query.data?.error && !query.error && !query.isFetching ? (
        <View style={styles.card}>
          <View style={styles.body}>
            <Text style={styles.title}>No ticket or PR for this chat yet.</Text>
          </View>
        </View>
      ) : null}
      <ItemRows items={items} theme={theme} layout={layout} onOpen={onOpen} />
    </>
  );
}

function LinksScreen({
  theme,
  layout,
  agentId,
  visit = 0,
}: ThemeLayout & { agentId: string | null | undefined; visit?: number }) {
  const styles = useLinkStyles({ theme, layout });
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <LinksForAgent
        key={`${agentId ?? "none"}-${visit}`}
        theme={theme}
        layout={layout}
        agentId={agentId}
        visit={visit}
      />
    </ScrollView>
  );
}

export function ChatLinksPanel({ theme, layout, agentId }: PluginAgentPanelProps) {
  const focused = useFocusedAgent();
  const id = focused.agentId ?? agentId;
  return (
    <LinksScreen
      key={`${id}-${focused.visit}`}
      theme={theme}
      layout={layout}
      agentId={id}
      visit={focused.visit}
    />
  );
}

export function ChatLinksWorkspacePanel({ theme, layout }: PluginWorkspacePanelProps) {
  const focused = useFocusedAgent();
  return (
    <LinksScreen
      key={`${focused.agentId ?? "none"}-${focused.visit}`}
      theme={theme}
      layout={layout}
      agentId={focused.agentId}
      visit={focused.visit}
    />
  );
}

export function ChatLinksStatus({ theme, layout }: PluginHostProps) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
      contentContainerStyle={{ padding: layout.compact ? 16 : 24, gap: 8 }}
    >
      <Text style={{ color: theme.colors.foreground, fontSize: 18 }}>Chat links is loaded.</Text>
      <Text style={{ color: theme.colors.foregroundMuted }}>
        Open a chat, then tap Links. It shows the ticket and PR for that session.
      </Text>
    </ScrollView>
  );
}

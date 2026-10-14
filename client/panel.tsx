import {
  type PluginAgentPanelProps,
  type PluginHostProps,
  type PluginWorkspacePanelProps,
  useRpc,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { listChatLinksRpc, markChatLinkSeenRpc, type ChatLinkItem } from "../shared/rpc";
import { GithubPrRow } from "./github";
import { LinearIssueRow } from "./linear";
import { useFocusedAgent } from "./focus";
import { openExternal } from "./web";
import { TipHost, useTip } from "./tip";
type ThemeLayout = Pick<PluginHostProps, "theme" | "layout">;

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
      attention: { color: theme.colors.statusDanger, fontSize: 13 },
      toolbar: {
        flexDirection: "row" as const,
        justifyContent: "flex-end" as const,
      },
      refresh: {
        alignItems: "center" as const,
        justifyContent: "center" as const,
        width: 28,
        height: 28,
        borderRadius: 6,
      },
      notice: { paddingHorizontal: 4, gap: 2 },
      noticeText: { color: theme.colors.statusWarning, fontSize: 12 },
      noticeDetail: { color: theme.colors.foregroundMuted, fontSize: 12 },
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
      {items.map((item) =>
        item.kind === "linear" ? (
          <LinearIssueRow
            key={item.id}
            item={item}
            theme={theme}
            compact={layout.compact}
            onOpen={onOpen}
          />
        ) : (
          <GithubPrRow
            key={item.id}
            item={item}
            theme={theme}
            compact={layout.compact}
            onOpen={onOpen}
          />
        ),
      )}
    </>
  );
}

function useOpenItem(queryKey: unknown[]) {
  const markSeen = useRpc(markChatLinkSeenRpc);
  const queryClient = useQueryClient();
  const seen = useMutation({
    mutationFn: (item: ChatLinkItem) =>
      markSeen({
        id: item.id,
        kind: item.kind,
        label: item.label,
        url: item.url,
        status: item.status,
        stateType: item.stateType,
        checks: item.checks,
        assignee: item.assignee,
        priority: item.priority,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  return (item: ChatLinkItem) => {
    void (async () => {
      try {
        await openExternal(item.url);
      } catch {
        return;
      }
      await seen.mutateAsync(item);
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
  const [wiping, setWiping] = useState(false);
  const ready = Boolean(agentId) && query.isFetchedAfterMount && query.isSuccess && !wiping;
  const items = ready ? query.data?.items ?? [] : [];
  const onOpen = useOpenItem(queryKey);

  return (
    <>
      {agentId ? (
        <View style={styles.toolbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh links"
            disabled={wiping || query.isFetching}
            onPress={() => {
              setWiping(true);
              void query.refetch().finally(() => setWiping(false));
            }}
            style={({ pressed }) => [styles.refresh, pressed ? styles.cardPressed : null]}
          >
            {wiping || query.isFetching ? (
              <ActivityIndicator size="small" color={theme.colors.accent} />
            ) : (
              <Icon name="RefreshCw" size={14} color={theme.colors.foregroundMuted} />
            )}
          </Pressable>
        </View>
      ) : null}
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
      {ready && query.data?.jevError != null ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Jev unavailable. Showing every link in this chat.</Text>
          {query.data.jevError ? <Text style={styles.noticeDetail}>{query.data.jevError}</Text> : null}
        </View>
      ) : null}
      {query.data?.error && !wiping ? (
        <View style={styles.card}>
          <View style={styles.body}>
            <Text style={styles.ident}>Could not load links</Text>
            <Text style={styles.attention}>{query.data.error}</Text>
          </View>
        </View>
      ) : null}
      {query.error && !wiping ? (
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
    <TipHost theme={theme}>
      <LinksScroll
        theme={theme}
        layout={layout}
        agentId={agentId}
        visit={visit}
        styles={styles}
      />
    </TipHost>
  );
}

function LinksScroll({
  theme,
  layout,
  agentId,
  visit,
  styles,
}: ThemeLayout & {
  agentId: string | null | undefined;
  visit: number;
  styles: ReturnType<typeof useLinkStyles>;
}) {
  const tip = useTip();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      onScrollBeginDrag={() => tip?.hide()}
      scrollEventThrottle={16}
    >
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
  return <LinksScreen key={agentId} theme={theme} layout={layout} agentId={agentId} />;
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

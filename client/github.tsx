import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginHostProps } from "@getpaseo/plugin/client";
import { Image, Pressable, Text, View } from "react-native";
import type { ChatLinkItem } from "../shared/rpc";
import { Tip } from "./tip";

const OPEN = "#3FB950";
const DRAFT = "#8B949E";
const MERGED = "#A371F7";
const CLOSED = "#F85149";
const PENDING = "#D29922";

function prChrome(item: ChatLinkItem): {
  color: string;
  icon: "GitPullRequest" | "GitPullRequestDraft" | "GitPullRequestClosed" | "GitMerge";
  label: string;
} {
  const type = (item.stateType ?? item.status.split(" · ")[0] ?? "").toLowerCase();
  if (item.error || type === "missing") return { color: CLOSED, icon: "GitPullRequestClosed", label: item.error ?? "Missing" };
  if (type === "merged") return { color: MERGED, icon: "GitMerge", label: "Merged" };
  if (type === "closed") return { color: CLOSED, icon: "GitPullRequestClosed", label: "Closed" };
  if (type === "draft") return { color: DRAFT, icon: "GitPullRequestDraft", label: "Draft" };
  return { color: OPEN, icon: "GitPullRequest", label: "Open" };
}

function reviewLabel(item: ChatLinkItem): string | null {
  const parts = item.status.split(" · ").slice(1);
  return parts[0] ? parts[0].replace(/\b\w/g, (c) => c.toUpperCase()) : null;
}

function ChecksMark({ checks }: { checks: string | null }) {
  if (checks === "passing") return <Icon name="CircleCheck" size={14} color={OPEN} />;
  if (checks === "failing") return <Icon name="CircleX" size={14} color={CLOSED} />;
  if (checks === "pending") return <Icon name="CircleDot" size={14} color={PENDING} />;
  return <View style={{ width: 14, height: 14 }} />;
}

function AuthorMark({ name, url }: { name: string | null; url: string | null }) {
  if (!name) {
    return (
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          borderWidth: 1,
          borderColor: DRAFT,
        }}
      />
    );
  }
  if (url) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: url }}
        style={{ width: 18, height: 18, borderRadius: 4 }}
      />
    );
  }
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        backgroundColor: "#21262D",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontSize: 8, fontWeight: "700" }}>{name.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

export function GithubPrRow({
  item,
  theme,
  compact,
  onOpen,
}: {
  item: ChatLinkItem;
  theme: PluginHostProps["theme"];
  compact: boolean;
  onOpen: (item: ChatLinkItem) => void;
}) {
  const chrome = prChrome(item);
  const review = reviewLabel(item);
  const muted = theme.colors.foregroundMuted;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Pull request ${item.label} ${chrome.label} ${review ?? ""} ${item.assignee ?? ""} ${item.title}`}
      onPress={() => onOpen(item)}
      style={({ pressed }) => ({
        paddingVertical: compact ? 8 : 10,
        paddingHorizontal: compact ? 10 : 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: pressed ? theme.colors.surface2 : theme.colors.surface1,
        gap: 6,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Tip text={`${chrome.label} pull request`}>
          <Icon name={chrome.icon} size={16} color={chrome.color} />
        </Tip>
        <Tip text={item.label}>
          <Text
            style={{
              color: muted,
              fontSize: 12,
              fontWeight: "500",
              fontVariant: ["tabular-nums"],
            }}
          >
            {item.label}
          </Text>
        </Tip>
        <View style={{ flex: 1 }} />
        <Tip
          text={
            item.checks === "passing"
              ? "Checks passing"
              : item.checks === "failing"
                ? "Checks failing"
                : item.checks === "pending"
                  ? "Checks pending"
                  : "No checks"
          }
        >
          <ChecksMark checks={item.checks} />
        </Tip>
        <Tip text={item.assignee ? `Author ${item.assignee}` : "No author"}>
          <AuthorMark name={item.assignee} url={item.avatarUrl} />
        </Tip>
      </View>
      <Text
        style={{
          paddingLeft: 24,
          color: theme.colors.foreground,
          fontSize: compact ? 13 : 14,
          lineHeight: compact ? 18 : 20,
        }}
      >
        {item.title}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 24 }}>
        <Tip text={`${chrome.label} pull request`}>
          <Text style={{ color: chrome.color, fontSize: 12, fontWeight: "600" }}>{chrome.label}</Text>
        </Tip>
        {review ? (
          <Tip text={`Review: ${review}`}>
            <Text style={{ color: muted, fontSize: 12 }} numberOfLines={1}>
              · {review}
            </Text>
          </Tip>
        ) : null}
        {item.assignee ? (
          <Tip text={`Author ${item.assignee}`}>
            <Text style={{ color: muted, fontSize: 12 }} numberOfLines={1}>
              · {item.assignee}
            </Text>
          </Tip>
        ) : null}
      </View>
      {item.reasons.length > 0 || item.newComments > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingLeft: 24 }}>
          {item.newComments > 0 ? (
            <Tip text="New comments since you last opened this">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Icon name="MessageCircle" size={11} color={theme.colors.statusWarning} />
                <Text style={{ color: theme.colors.statusWarning, fontSize: 12 }}>
                  {item.newComments} new
                </Text>
              </View>
            </Tip>
          ) : null}
          {item.reasons.map((reason) => (
            <Tip key={reason} text={`New: ${reason}`}>
              <Text style={{ color: theme.colors.statusWarning, fontSize: 12 }}>
                {reason}
              </Text>
            </Tip>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

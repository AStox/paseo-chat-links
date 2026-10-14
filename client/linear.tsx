import { Icon } from "@getpaseo/plugin/client/react-native";
import { Image, Pressable, Text, View } from "react-native";
import type { ChatLinkItem } from "../shared/rpc";
import type { PluginHostProps } from "@getpaseo/plugin/client";
import { Tip } from "./tip";

const URGENT = "#FC7840";
const BAR = "#9CA1A9";
const AVATAR = "#5E6AD2";

function svgUri(inner: string): string {
  return (
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none">${inner}</svg>`,
    )
  );
}

function linearStatus(item: ChatLinkItem): { color: string; uri: string; label: string } {
  const name = `${item.status} ${item.error ?? ""}`.toLowerCase();
  const type = (item.stateType ?? "").toLowerCase();
  const label = item.error ?? item.status;

  if (item.error || /block/.test(name)) {
    const color = "#EB5757";
    return {
      color,
      label,
      uri: svgUri(
        `<circle cx="8" cy="8" r="6.25" stroke="${color}" stroke-width="1.5"/><path d="M8 5v3.2" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.1" r="0.8" fill="${color}"/>`,
      ),
    };
  }
  if (type === "completed" || /done|complete|shipped/.test(name)) {
    const color = "#4CB782";
    return {
      color,
      label,
      uri: svgUri(
        `<circle cx="8" cy="8" r="7" fill="${color}"/><path d="M5.1 8.15l1.9 1.9 3.9-3.9" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
      ),
    };
  }
  if (type === "canceled" || /cancel|duplicate/.test(name)) {
    const color = "#8A8F98";
    return {
      color,
      label,
      uri: svgUri(
        `<circle cx="8" cy="8" r="6.25" stroke="${color}" stroke-width="1.5"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>`,
      ),
    };
  }
  if (/review/.test(name)) {
    const color = "#5E6AD2";
    return {
      color,
      label,
      uri: svgUri(
        `<circle cx="8" cy="8" r="6.25" stroke="${color}" stroke-width="1.5"/><circle cx="8" cy="8" r="2.6" stroke="${color}" stroke-width="1.5"/>`,
      ),
    };
  }
  if (type === "started" || /progress|started|doing/.test(name)) {
    const color = "#F2C94C";
    return {
      color,
      label,
      uri: svgUri(
        `<circle cx="8" cy="8" r="6.25" stroke="${color}" stroke-width="1.5"/><path d="M8 2a6 6 0 1 1-4.24 10.24L8 8Z" fill="${color}"/>`,
      ),
    };
  }
  if (type === "backlog") {
    const color = "#9CA1A9";
    return {
      color,
      label,
      uri: svgUri(
        `<circle cx="8" cy="8" r="6.25" stroke="${color}" stroke-width="1.5" stroke-dasharray="2.4 2.1"/>`,
      ),
    };
  }
  const color = "#9CA1A9";
  return {
    color,
    label,
    uri: svgUri(`<circle cx="8" cy="8" r="6.25" stroke="${color}" stroke-width="1.5"/>`),
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function PriorityMark({ priority }: { priority: string | null }) {
  const key = (priority ?? "").toLowerCase();
  if (!key) {
    return <View style={{ width: 14, height: 16 }} />;
  }
  if (key === "urgent") {
    return (
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          backgroundColor: URGENT,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800", lineHeight: 12 }}>!</Text>
      </View>
    );
  }
  const filled = key === "high" ? 3 : key === "medium" ? 2 : 1;
  const heights = [5, 8, 11];
  return (
    <View style={{ width: 14, height: 14, flexDirection: "row", alignItems: "flex-end", gap: 1.5 }}>
      {heights.map((h, i) => (
        <View
          key={h}
          style={{
            width: 3,
            height: h,
            borderRadius: 1,
            backgroundColor: i < filled ? BAR : "transparent",
            borderWidth: i < filled ? 0 : 1,
            borderColor: BAR,
          }}
        />
      ))}
    </View>
  );
}

function AssigneeMark({ name, url }: { name: string | null; url: string | null }) {
  if (!name) {
    return (
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: 1,
          borderColor: BAR,
          borderStyle: "dashed",
        }}
      />
    );
  }
  if (url) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: url }}
        style={{ width: 18, height: 18, borderRadius: 9 }}
      />
    );
  }
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: AVATAR,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontSize: 8, fontWeight: "700" }}>{initials(name)}</Text>
    </View>
  );
}

export function LinearIssueRow({
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
  const status = linearStatus(item);
  const muted = theme.colors.foregroundMuted;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Ticket ${item.label} ${status.label} ${item.priority ?? ""} ${item.assignee ?? "Unassigned"} ${item.title}`}
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
        <Tip text={`Status: ${status.label}`}>
          <Image
            accessibilityIgnoresInvertColors
            source={{ uri: status.uri }}
            style={{ width: 16, height: 16 }}
          />
        </Tip>
        <Tip text={`Issue ${item.label}`}>
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
        <Tip text={item.priority ? `Priority: ${item.priority}` : "No priority"}>
          <PriorityMark priority={item.priority} />
        </Tip>
        <Tip text={item.assignee ? `Assigned to ${item.assignee}` : "Unassigned"}>
          <AssigneeMark name={item.assignee} url={item.avatarUrl} />
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
        <Tip text={`Status: ${status.label}`}>
          <Text style={{ color: status.color, fontSize: 12, fontWeight: "500" }}>{status.label}</Text>
        </Tip>
        {item.project ? (
          <Tip text={`Project: ${item.project}`}>
            <Text style={{ color: muted, fontSize: 12 }} numberOfLines={1}>
              · {item.project}
            </Text>
          </Tip>
        ) : null}
        <Tip text={item.assignee ? `Assigned to ${item.assignee}` : "Unassigned"}>
          <Text style={{ color: muted, fontSize: 12 }} numberOfLines={1}>
            · {item.assignee ?? "Unassigned"}
          </Text>
        </Tip>
      </View>
      {item.reasons.length > 0 || item.newComments > 0 ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            paddingLeft: 24,
          }}
        >
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

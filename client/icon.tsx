import type { PluginButtonIconProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { View, type LayoutChangeEvent } from "react-native";
import { noteVisibleAgent } from "./focus";

export function LinksIcon(props: PluginButtonIconProps) {
  const agentId = props.context === "agent" ? props.agentId : null;
  const onLayout = agentId
    ? (event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        if (width >= 8 && height >= 8) noteVisibleAgent(agentId);
      }
    : undefined;

  return (
    <View collapsable={false} onLayout={onLayout}>
      <Icon name="Link" size={props.size} color={props.color} />
    </View>
  );
}

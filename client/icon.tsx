import type { PluginButtonIconProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useLayoutEffect, useRef } from "react";
import { Dimensions, View } from "react-native";
import { watchPill } from "./focus";

export function LinksIcon(props: PluginButtonIconProps) {
  const agentId = props.context === "agent" ? props.agentId : null;
  const ref = useRef<View | null>(null);

  useLayoutEffect(() => {
    if (!agentId) return;
    return watchPill({
      agentId,
      visible: false,
      measure(done) {
        const node = ref.current;
        if (!node) return done(false);
        node.measureInWindow((x, y, width, height) => {
          const screen = Dimensions.get("window");
          done(
            width >= 8 &&
              height >= 8 &&
              x + width > 0 &&
              y + height > 0 &&
              x < screen.width &&
              y < screen.height,
          );
        });
      },
    });
  }, [agentId]);

  return (
    <View ref={ref} collapsable={false}>
      <Icon name="Link" size={props.size} color={props.color} />
    </View>
  );
}

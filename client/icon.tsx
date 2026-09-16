import type { PluginButtonIconProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useLayoutEffect, useRef } from "react";
import { Dimensions, View, type View as ViewType } from "react-native";
import { noteVisibleAgent } from "./focus";

export function LinksIcon(props: PluginButtonIconProps) {
  const agentId = props.context === "agent" ? props.agentId : null;
  const ref = useRef<ViewType | null>(null);

  useLayoutEffect(() => {
    if (!agentId) return;

    const report = () => {
      const node = ref.current as
        | (ViewType & {
            measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
          })
        | null;
      if (!node?.measureInWindow) return;
      node.measureInWindow((x, y, w, h) => {
        if (w < 8 || h < 8) return;
        const screen = Dimensions.get("window");
        if (y + h < 0 || x + w < 0 || y > screen.height || x > screen.width) return;
        noteVisibleAgent(agentId);
      });
    };

    report();
    const timer = setInterval(report, 250);
    return () => {
      clearInterval(timer);
    };
  }, [agentId]);

  return (
    <View ref={ref} collapsable={false}>
      <Icon name="Link" size={props.size} color={props.color} />
    </View>
  );
}

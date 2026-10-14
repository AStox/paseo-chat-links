import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Dimensions, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { PluginHostProps } from "@getpaseo/plugin/client";

type TipState = {
  text: string;
  x: number;
  y: number;
};

type TipApi = {
  open: (text: string, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  hide: () => void;
};

const TipCtx = createContext<TipApi | null>(null);
const DELAY_MS = 400;
const OFFSET_X = 14;
const OFFSET_Y = 18;

function point(event: unknown): { x: number; y: number } {
  const e = event as { nativeEvent?: Record<string, number>; pageX?: number; clientX?: number; pageY?: number; clientY?: number };
  const n = e.nativeEvent ?? {};
  return {
    x: n.clientX ?? e.clientX ?? n.pageX ?? e.pageX ?? 0,
    y: n.clientY ?? e.clientY ?? n.pageY ?? e.pageY ?? 0,
  };
}

function viewport(): { w: number; h: number } {
  const g = globalThis as {
    visualViewport?: { width: number; height: number };
    innerWidth?: number;
    innerHeight?: number;
  };
  if (g.visualViewport) return { w: g.visualViewport.width, h: g.visualViewport.height };
  if (g.innerWidth && g.innerHeight) return { w: g.innerWidth, h: g.innerHeight };
  const d = Dimensions.get("window");
  return { w: d.width, h: d.height };
}

function clamp(x: number, y: number, tw: number, th: number): { left: number; top: number } {
  const { w, h } = viewport();
  const pad = 8;
  const bw = tw || 200;
  const bh = th || 40;
  let left = x + OFFSET_X;
  let top = y + OFFSET_Y;
  if (left + bw > w - pad) left = x - OFFSET_X - bw;
  if (left < pad) left = pad;
  if (left + bw > w - pad) left = Math.max(pad, w - bw - pad);
  if (top + bh > h - pad) top = y - OFFSET_Y - bh;
  if (top < pad) top = pad;
  if (top + bh > h - pad) top = Math.max(pad, h - bh - pad);
  return { left, top };
}

export function useTip(): TipApi | null {
  return useContext(TipCtx);
}

export function TipHost({
  theme,
  children,
}: {
  theme: PluginHostProps["theme"];
  children: ReactNode;
}) {
  const [tip, setTip] = useState<TipState | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const hide = useCallback(() => {
    setTip(null);
    setBox({ w: 0, h: 0 });
  }, []);
  const open = useCallback((text: string, x: number, y: number) => setTip({ text, x, y }), []);
  const move = useCallback((x: number, y: number) => {
    setTip((cur) => (cur ? { ...cur, x, y } : cur));
  }, []);
  const api = useMemo(() => ({ open, move, hide }), [open, move, hide]);
  const pos = tip ? clamp(tip.x, tip.y, box.w, box.h) : null;

  return (
    <TipCtx.Provider value={api}>
      <View style={{ flex: 1 }}>
        {children}
        {tip && pos ? (
          <View
            pointerEvents="none"
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              if (width !== box.w || height !== box.h) setBox({ w: width, h: height });
            }}
            style={
              {
                position: "fixed",
                left: pos.left,
                top: pos.top,
                zIndex: 9999,
                maxWidth: 280,
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface1,
                shadowColor: "#000000",
                shadowOpacity: 0.28,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 6 },
                elevation: 16,
              } as unknown as ViewStyle
            }
          >
            <Text style={{ color: theme.colors.foreground, fontSize: 12, lineHeight: 17 }}>{tip.text}</Text>
          </View>
        ) : null}
      </View>
    </TipCtx.Provider>
  );
}

export function Tip({
  text,
  children,
  style,
}: {
  text: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const api = useContext(TipCtx);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const last = useRef({ x: 0, y: 0 });
  const armed = useRef(false);

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    armed.current = false;
    api?.hide();
  }, [api]);

  useEffect(() => () => {
    clearTimeout(timer.current);
  }, []);

  return (
    <View
      accessibilityLabel={text}
      onPointerEnter={(event) => {
        last.current = point(event);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = undefined;
          armed.current = true;
          api?.open(text, last.current.x, last.current.y);
        }, DELAY_MS);
      }}
      onPointerMove={(event) => {
        last.current = point(event);
        if (armed.current) api?.move(last.current.x, last.current.y);
      }}
      onPointerLeave={cancel}
      style={style}
    >
      {children}
    </View>
  );
}

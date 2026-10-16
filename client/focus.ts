import { useSyncExternalStore } from "react";

type FocusSnap = { agentId: string | null; visit: number };

export type PillProbe = {
  agentId: string;
  visible: boolean;
  measure(done: (visible: boolean) => void): void;
};

const POLL_MS = 250;

let snap: FocusSnap = { agentId: null, visit: 0 };
const listeners = new Set<() => void>();
const probes = new Set<PillProbe>();
let shown = new Set<string>();
let stopTimer: (() => void) | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function focus(id: string) {
  if (snap.agentId === id) return;
  snap = { agentId: id, visit: 1 };
  emit();
}

export function focusedAgentId(): string | null {
  return snap.agentId;
}

export function setFocusedAgent(id: string) {
  snap = { agentId: id, visit: snap.agentId === id ? snap.visit + 1 : 1 };
  emit();
}

// Paseo keeps switched-away chats mounted (hidden), so mount and layout events alone cannot tell which chat is on screen.
function tick() {
  const mounted = new Set<string>();
  const visible = new Set<string>();
  for (const probe of probes) {
    mounted.add(probe.agentId);
    if (probe.visible) visible.add(probe.agentId);
  }
  const appeared = [...visible].filter((id) => !shown.has(id));
  shown = visible;

  const current = snap.agentId;
  const next = appeared.at(-1);
  if (next && !(current && appeared.includes(current))) {
    focus(next);
  } else if (current && mounted.has(current) && !visible.has(current)) {
    const fallback = visible.values().next().value;
    if (fallback) focus(fallback);
  }

  for (const probe of probes) {
    probe.measure((isVisible) => {
      probe.visible = isVisible;
    });
  }
}

export function watchPill(probe: PillProbe): () => void {
  probes.add(probe);
  probe.measure((isVisible) => {
    probe.visible = isVisible;
  });
  if (!stopTimer) {
    const id = setInterval(tick, POLL_MS);
    stopTimer = () => clearInterval(id);
  }
  return () => {
    probes.delete(probe);
    if (probes.size === 0 && stopTimer) {
      stopTimer();
      stopTimer = null;
      shown = new Set();
    }
  };
}

export function useFocusedAgent() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => snap,
    () => snap,
  );
}

import { useSyncExternalStore } from "react";

type FocusSnap = { agentId: string | null; visit: number };

let snap: FocusSnap = { agentId: null, visit: 0 };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function focusedAgentId(): string | null {
  return snap.agentId;
}

export function setFocusedAgent(id: string) {
  snap = { agentId: id, visit: snap.agentId === id ? snap.visit + 1 : 1 };
  emit();
}

export function noteVisibleAgent(id: string) {
  if (snap.agentId === id) return;
  snap = { agentId: id, visit: 1 };
  emit();
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

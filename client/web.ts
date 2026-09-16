import { Linking, Platform } from "react-native";

declare const window: {
  open(url: string, target: string, features: string): unknown;
  paseoDesktop?: {
    opener?: {
      openUrl?: (url: string) => Promise<void>;
    };
  };
};

export async function openExternal(url: string): Promise<void> {
  if (Platform.OS === "web") {
    const openUrl = window.paseoDesktop?.opener?.openUrl;
    if (typeof openUrl === "function") {
      await openUrl(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await Linking.openURL(url);
}

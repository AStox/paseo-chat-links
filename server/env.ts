import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ENV_FILE = path.join(process.env.HOME || os.homedir(), ".paseo", "chat-links.env");

let fileEnv: Record<string, string> | null = null;

async function readFileEnv(): Promise<Record<string, string>> {
  if (fileEnv) return fileEnv;
  fileEnv = {};
  try {
    const text = await readFile(ENV_FILE, "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      fileEnv[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    // optional local env file
  }
  return fileEnv;
}

export async function pluginEnv(name: string): Promise<string> {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;
  const fromFile = (await readFileEnv())[name]?.trim();
  return fromFile || "";
}

// Listens for the backend's agent_launch event and runs the real launch via
// launchViaShortcut() — the backend can't RunGame itself (no display session).

import { addEventListener, removeEventListener, toaster } from "@decky/api";
import { launchViaShortcut } from "./steamShortcut";

// Keep in sync with AGENT_LAUNCH_EVENT in defaults/python/agent_control.py.
const AGENT_LAUNCH_EVENT = "agent_launch";

interface AgentLaunchPayload {
  exe: string;
  directory: string;
}

async function onAgentLaunch(payload: AgentLaunchPayload): Promise<void> {
  if (!payload?.exe || !payload?.directory) {
    console.warn("PartyDeck: agent_launch missing exe/directory", payload);
    return;
  }
  console.log("PartyDeck: agent_launch received", payload);
  try {
    const appId = await launchViaShortcut(payload.exe, payload.directory);
    if (appId === null) {
      toaster.toast({ title: "PartyDeck", body: "Agent launch failed to start." });
    }
  } catch (e) {
    console.error("PartyDeck: agent_launch error", e);
    toaster.toast({ title: "PartyDeck", body: `Agent launch failed: ${e}` });
  }
}

export function registerAgentControl(): () => void {
  const listener = addEventListener<[AgentLaunchPayload]>(
    AGENT_LAUNCH_EVENT,
    onAgentLaunch
  );
  return () => removeEventListener(AGENT_LAUNCH_EVENT, listener);
}

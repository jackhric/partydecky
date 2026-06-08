import { useEffect, useState } from "react";
import { getConfig, setConfig, type PartyConfig } from "../lib/partydeckApi";

// Loads PartyConfig and exposes a `patch` that writes one field back through the
// binary (set_config round-trips the whole object) and stores the returned copy.
export function useConfig() {
  const [config, setConfigState] = useState<PartyConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getConfig()
      .then(setConfigState)
      .catch((e) => setError(String(e)));
  }, []);

  const patch = async <K extends keyof PartyConfig>(
    key: K,
    value: PartyConfig[K],
  ) => {
    if (!config) return;
    setBusy(true);
    setError(null);
    try {
      setConfigState(await setConfig({ ...config, [key]: value }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return { config, busy, error, setError, patch };
}

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearPaired,
  heartbeatDeck,
  savePaired,
  type PairedDeck,
} from "../deckApi";
import { HEARTBEAT_MS, reachPairedDeck } from "../lib/deckConnection";
import { useCompanionSettings } from "../stores/companionSettingsStore";

export type DeckConnectionState = "connected" | "reconnecting" | "offline";

interface UseDeckConnectionOptions {
  paired: PairedDeck | null;
  onPairedChange: (deck: PairedDeck | null) => void;
  onAuthLost?: () => void;
}

export function useDeckConnection({
  paired,
  onPairedChange,
  onAuthLost,
}: UseDeckConnectionOptions) {
  const autoReconnect = useCompanionSettings((s) => s.autoReconnect);
  const [online, setOnline] = useState(true);
  const [connectionState, setConnectionState] = useState<DeckConnectionState>("connected");

  const pairedRef = useRef(paired);
  pairedRef.current = paired;

  const reconnectingRef = useRef(false);
  const backoffRef = useRef(2000);

  const handleAuthLost = useCallback(() => {
    clearPaired();
    onPairedChange(null);
    setOnline(false);
    setConnectionState("offline");
    onAuthLost?.();
  }, [onAuthLost, onPairedChange]);

  const attemptReconnect = useCallback(async (): Promise<boolean> => {
    const deck = pairedRef.current;
    if (!deck || reconnectingRef.current) return false;

    reconnectingRef.current = true;
    setConnectionState("reconnecting");
    setOnline(false);

    try {
      const result = await reachPairedDeck(deck);
      if (result.ok) {
        if (
          result.deck.host !== deck.host ||
          result.deck.name !== deck.name
        ) {
          savePaired(result.deck);
          onPairedChange(result.deck);
        }
        setOnline(true);
        setConnectionState("connected");
        backoffRef.current = 2000;
        return true;
      }

      if (result.reason === "auth") {
        handleAuthLost();
        return false;
      }

      setConnectionState("reconnecting");
      return false;
    } finally {
      reconnectingRef.current = false;
    }
  }, [handleAuthLost, onPairedChange]);

  const reconnectNow = useCallback(() => {
    backoffRef.current = 2000;
    void attemptReconnect();
  }, [attemptReconnect]);

  // Heartbeat keepalive + auto-reconnect loop
  useEffect(() => {
    if (!paired) {
      setOnline(true);
      setConnectionState("connected");
      return;
    }

    let cancelled = false;
    let heartbeatTimer: number | undefined;
    let reconnectTimer: number | undefined;

    const scheduleHeartbeat = () => {
      heartbeatTimer = window.setTimeout(() => void beat(), HEARTBEAT_MS);
    };

    const scheduleReconnect = () => {
      if (!autoReconnect || cancelled) return;
      const delay = backoffRef.current;
      backoffRef.current = Math.min(backoffRef.current * 1.5, 30_000);
      reconnectTimer = window.setTimeout(() => {
        void attemptReconnect().then((ok) => {
          if (!cancelled && !ok) scheduleReconnect();
        });
      }, delay);
    };

    const beat = async () => {
      const deck = pairedRef.current;
      if (!deck || cancelled) return;

      const result = await heartbeatDeck(deck);
      if (cancelled) return;

      if (result === "ok") {
        setOnline(true);
        setConnectionState("connected");
        backoffRef.current = 2000;
        scheduleHeartbeat();
        return;
      }

      if (result === "unauthorized") {
        handleAuthLost();
        return;
      }

      setOnline(false);
      if (autoReconnect) {
        setConnectionState("reconnecting");
        void attemptReconnect().then((ok) => {
          if (!cancelled) {
            if (ok) scheduleHeartbeat();
            else scheduleReconnect();
          }
        });
      } else {
        setConnectionState("offline");
        scheduleHeartbeat();
      }
    };

    void beat();

    return () => {
      cancelled = true;
      if (heartbeatTimer !== undefined) window.clearTimeout(heartbeatTimer);
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
    };
  }, [paired, autoReconnect, attemptReconnect, handleAuthLost]);

  // Reconnect immediately when the app returns to the foreground
  useEffect(() => {
    if (!paired) return;

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        const deck = pairedRef.current;
        if (!deck) return;
        const result = await heartbeatDeck(deck);
        if (result === "ok") {
          setOnline(true);
          setConnectionState("connected");
          backoffRef.current = 2000;
          return;
        }
        if (result === "unauthorized") {
          handleAuthLost();
          return;
        }
        if (autoReconnect) void attemptReconnect();
      })();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [paired, autoReconnect, attemptReconnect, handleAuthLost]);

  // Validate stored pairing on first load
  useEffect(() => {
    if (!paired) return;

    let cancelled = false;
    void (async () => {
      const result = await reachPairedDeck(paired);
      if (cancelled) return;

      if (result.ok) {
        if (result.deck.host !== paired.host || result.deck.name !== paired.name) {
          savePaired(result.deck);
          onPairedChange(result.deck);
        }
        setOnline(true);
        setConnectionState("connected");
        return;
      }

      if (result.reason === "auth") {
        handleAuthLost();
        return;
      }

      setOnline(false);
      setConnectionState(autoReconnect ? "reconnecting" : "offline");
    })();

    return () => {
      cancelled = true;
    };
    // Run once when pairing identity changes, not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paired?.host, paired?.port, paired?.token]);

  return { online, connectionState, reconnectNow };
}

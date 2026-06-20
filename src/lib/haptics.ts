import { api } from "@/lib/commands";

export async function triggerHaptic(event: "install" | "error" | "reorder" | "success") {
  try {
    await api.triggerHaptic(event);
  } catch {
    // Best-effort on platforms without haptics
  }
}

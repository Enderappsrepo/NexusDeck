/** Short success pattern — works on Android; iOS Safari often ignores vibrate. */
export function hapticSuccess() {
  try {
    navigator.vibrate?.([40, 60, 40]);
  } catch {
    /* ignore */
  }
}

export function hapticTap() {
  try {
    navigator.vibrate?.(15);
  } catch {
    /* ignore */
  }
}

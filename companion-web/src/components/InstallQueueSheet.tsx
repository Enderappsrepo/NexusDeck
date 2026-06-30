import { Sheet } from "./Sheet";
import {
  useInstallQueueStore,
  type CompanionInstallQueueItem,
} from "../stores/installQueueStore";

function QueueRow({
  item,
  index,
  total,
  processing,
  onRemove,
}: {
  item: CompanionInstallQueueItem;
  index: number;
  total: number;
  processing: boolean;
  onRemove: () => void;
}) {
  const statusLabel =
    item.status === "active"
      ? "Installing…"
      : item.status === "failed"
        ? item.error ?? "Failed"
        : item.status === "done"
          ? "Done"
          : processing
            ? `${index} of ${total} waiting`
            : "Waiting";

  return (
    <li className="cc-queue-row">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{item.modName}</p>
        {item.collectionName && (
          <p className="truncate text-[10px] text-[var(--cc-muted)]">From {item.collectionName}</p>
        )}
        <p className="truncate text-[10px] uppercase tracking-wide text-[var(--cc-muted)]">
          {statusLabel}
        </p>
      </div>
      {item.status !== "active" && item.status !== "done" && (
        <button type="button" className="cc-btn-ghost shrink-0 px-2 py-1 text-xs" onClick={onRemove}>
          Remove
        </button>
      )}
    </li>
  );
}

export function InstallQueueHeaderButton({ onOpen }: { onOpen: () => void }) {
  const count = useInstallQueueStore(
    (s) => s.items.filter((i) => i.status === "queued" || i.status === "failed" || i.status === "active").length
  );

  return (
    <button
      type="button"
      className="cc-install-queue-btn"
      onClick={onOpen}
      aria-label={count > 0 ? `Install queue, ${count} mods` : "Install queue"}
    >
      Queue
      {count > 0 && <span className="cc-install-queue-badge">{count > 99 ? "99+" : count}</span>}
    </button>
  );
}

export function InstallQueueSheet({
  open,
  onClose,
  onStartInstalling,
  starting,
}: {
  open: boolean;
  onClose: () => void;
  onStartInstalling: () => void;
  starting?: boolean;
}) {
  const items = useInstallQueueStore((s) => s.items);
  const processing = useInstallQueueStore((s) => s.processing);
  const remove = useInstallQueueStore((s) => s.remove);
  const clearDone = useInstallQueueStore((s) => s.clearDone);
  const clearFailed = useInstallQueueStore((s) => s.clearFailed);
  const pending = items.filter((i) => i.status === "queued");
  const failed = items.filter((i) => i.status === "failed");
  const done = items.filter((i) => i.status === "done");
  const active = items.find((i) => i.status === "active");
  const canStart = !processing && pending.length > 0 && !starting;

  const subtitle = processing
    ? `Installing · ${pending.length} remaining`
    : pending.length > 0
      ? `${pending.length} ready · install one at a time`
      : "Queue mods or collections, then install when ready.";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      label="Install queue"
      title="Install queue"
      subtitle={subtitle}
      headerActions={
        <>
          {failed.length > 0 && (
            <button type="button" className="cc-btn-ghost text-xs" onClick={clearFailed}>
              Clear failed
            </button>
          )}
          {done.length > 0 && (
            <button type="button" className="cc-btn-ghost text-xs" onClick={clearDone}>
              Clear done
            </button>
          )}
        </>
      }
      footer={
        <>
          {canStart && (
            <button type="button" className="cc-btn w-full" onClick={onStartInstalling}>
              Start installing queued mods
            </button>
          )}
          <button type="button" className="cc-btn-secondary w-full" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      {items.length === 0 ? (
        <p className="py-2 text-sm leading-relaxed text-[var(--cc-muted)]">
          No mods queued yet. Add mods from a mod page, or queue an entire collection from the
          Collections tab.
        </p>
      ) : (
        <ul className="space-y-2">
          {active && (
            <QueueRow
              item={active}
              index={1}
              total={pending.length + 1}
              processing={processing}
              onRemove={() => {}}
            />
          )}
          {pending.map((item, idx) => (
            <QueueRow
              key={item.id}
              item={item}
              index={idx + 1}
              total={pending.length}
              processing={processing}
              onRemove={() => remove(item.id)}
            />
          ))}
          {failed.map((item, idx) => (
            <QueueRow
              key={item.id}
              item={item}
              index={idx + 1}
              total={failed.length}
              processing={processing}
              onRemove={() => remove(item.id)}
            />
          ))}
          {done.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              index={0}
              total={0}
              processing={processing}
              onRemove={() => remove(item.id)}
            />
          ))}
        </ul>
      )}
    </Sheet>
  );
}

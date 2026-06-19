import { Link } from "@tanstack/react-router";
import type { DependencyNode } from "@/lib/nexus/types";
import { Badge } from "@/components/ui/badge";

interface DependencyGraphViewProps {
  nodes: DependencyNode[];
  gameDomain: string;
}

export function DependencyGraphView({ nodes, gameDomain }: DependencyGraphViewProps) {
  if (nodes.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted)]">No dependency information.</p>
    );
  }

  const sorted = [...nodes].sort((a, b) => a.depth - b.depth);

  return (
    <div className="space-y-2">
      {sorted.map((node) => (
        <div
          key={node.mod_id}
          className="rounded-lg bg-[var(--color-secondary)] p-3"
          style={{ marginLeft: `${node.depth * 16}px` }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/games/$domain/mods/$modId"
              params={{ domain: gameDomain, modId: String(node.mod_id) }}
              className="focusable font-medium hover:text-[var(--color-primary)]"
              data-focusable="true"
            >
              Mod #{node.mod_id}
            </Link>
            {node.installed && <Badge variant="success">Installed</Badge>}
            {node.downloaded && !node.installed && (
              <Badge variant="muted">Downloaded</Badge>
            )}
          </div>
          {node.requirements.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-[var(--color-muted)]">
              {node.requirements.map((req) => (
                <li key={`${node.mod_id}-${req.mod_id}`}>
                  {req.optional ? "Optional: " : "Requires: "}
                  <Link
                    to="/games/$domain/mods/$modId"
                    params={{ domain: req.game_domain, modId: String(req.mod_id) }}
                    className="text-[var(--color-primary)] hover:underline"
                  >
                    {req.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

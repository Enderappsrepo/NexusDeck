import { Link } from "@tanstack/react-router";
import { Layers, User } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CollectionSummary } from "@/lib/nexus/types";

interface CollectionCardProps {
  collection: CollectionSummary;
  domain: string;
}

export function CollectionCard({ collection, domain }: CollectionCardProps) {
  return (
    <Link
      to="/games/$domain/collections/$slug"
      params={{ domain, slug: collection.slug }}
      className="focusable block"
      data-focusable="true"
    >
      <Card interactive className="h-full">
        <CardHeader>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-primary)]/15">
            <Layers className="h-6 w-6 text-[var(--color-primary)]" />
          </div>
          <CardTitle className="line-clamp-2">{collection.name}</CardTitle>
          {collection.summary && (
            <p className="line-clamp-2 text-sm leading-relaxed text-[var(--color-muted)]">
              {collection.summary}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <User className="h-4 w-4 shrink-0" />
            <span className="truncate">{collection.author}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="muted">{collection.mod_count} mods</Badge>
            {collection.revision_number > 0 && (
              <Badge variant="muted">Rev {collection.revision_number}</Badge>
            )}
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}

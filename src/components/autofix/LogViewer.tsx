import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LogViewerProps {
  lines: string[];
  title?: string;
}

export function LogViewer({ lines, title = "Recent log lines" }: LogViewerProps) {
  if (lines.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="max-h-64 overflow-auto rounded-lg bg-[var(--color-secondary)] p-4 text-xs whitespace-pre-wrap">
          {lines.join("\n")}
        </pre>
      </CardContent>
    </Card>
  );
}

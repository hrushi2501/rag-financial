export function formatBytes(value?: number): string {
  if (!value || value < 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** index;
  return `${amount.toFixed(index === 0 || amount >= 10 ? 0 : 1)} ${units[index]}`;
}

export function formatDate(value?: string): string {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  }).format(date);
}

export function displayFileType(filename: string, explicitType?: string): string {
  return (explicitType || filename.split(".").pop() || "FILE").toUpperCase();
}

export function stageLabel(stage: string): string {
  const labels: Record<string, string> = {
    preparing: "Preparing upload",
    uploading: "Uploading securely",
    parsing: "Reading document structure",
    chunking: "Building financial context",
    embedding: "Generating embeddings",
    indexing: "Indexing for retrieval",
    verifying: "Verifying citations",
    complete: "Ready to query",
    failed: "Ingestion failed",
  };
  return labels[stage.toLowerCase()] || stage;
}

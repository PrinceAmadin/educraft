import { LuDownload, LuFile } from "react-icons/lu";
import { formatDate } from "@/lib/utils";
import { fileHref } from "@/lib/files/links";
import type { ProjectDetail } from "@/lib/services/projects";

type ProjectFile = ProjectDetail["files"][number];

function humanSize(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `routeBase`: the admin project API path, e.g. /api/admin/projects/EC-00008 (private files download through it). */
export function FileList({ files, routeBase }: { files: ProjectFile[]; routeBase: string }) {
  return (
    <ul className="divide-y divide-border/80">
      {files.map((file) => {
        const size = humanSize(file.fileSize);
        const href = fileHref(file, routeBase);
        return (
          <li key={file.id} className="flex items-center gap-3 py-3">
            <LuFile className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{file.fileName}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(file.createdAt)}
                {size ? ` · ${size}` : ""}
              </p>
            </div>
            {href ? (
              <a
                href={href}
                target={file.storage === "PRIVATE_BLOB" ? undefined : "_blank"}
                rel="noopener noreferrer"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Download ${file.fileName}`}
              >
                <LuDownload className="size-4" aria-hidden />
              </a>
            ) : (
              <span className="shrink-0 text-xs text-danger">Unsafe link hidden</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

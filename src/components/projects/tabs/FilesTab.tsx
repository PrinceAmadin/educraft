import { LuInbox } from "react-icons/lu";
import { FileList } from "@/components/projects/tabs/FileList";
import { EmptyState } from "@/components/shared/EmptyState";
import { FILE_CATEGORY_LABELS } from "@/lib/project-display";
import type { ProjectDetail } from "@/lib/services/projects";

/** Categories always shown, in workflow order, even when empty. */
const PRIMARY_CATEGORIES = ["from_client", "from_worker", "qa_reviewed", "delivered"] as const;

export function FilesTab({ project }: { project: ProjectDetail }) {
  const byCategory = new Map<string, ProjectDetail["files"]>();
  for (const file of project.files.filter((f) => !f.deletedAt)) {
    const list = byCategory.get(file.category) ?? [];
    list.push(file);
    byCategory.set(file.category, list);
  }

  const extraCategories = [...byCategory.keys()].filter(
    (c) => !PRIMARY_CATEGORIES.includes(c as (typeof PRIMARY_CATEGORIES)[number])
  );
  const categories = [...PRIMARY_CATEGORIES, ...extraCategories];

  if (project.files.length === 0) {
    return (
      <EmptyState
        icon={LuInbox}
        title="No files yet"
        description="Client uploads, worker drafts, QA-reviewed versions and the final delivery all collect here."
        className="py-10"
      />
    );
  }

  return (
    <div className="space-y-8">
      {categories.map((category) => {
        const files = byCategory.get(category) ?? [];
        return (
          <section key={category}>
            <h3 className="text-[15px] font-semibold text-foreground">
              {FILE_CATEGORY_LABELS[category] ?? category}
              <span className="ml-2 font-mono text-xs text-muted-foreground">{files.length}</span>
            </h3>
            <div className="mt-2">
              {files.length === 0 ? (
                <p className="rounded-xl bg-zone px-4 py-4 text-[13px] text-muted-foreground">
                  Nothing in this category yet.
                </p>
              ) : (
                <FileList files={files} routeBase={`/api/admin/projects/${encodeURIComponent(project.projectId)}`} />
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

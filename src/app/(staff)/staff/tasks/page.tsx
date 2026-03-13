import { Card, CardHeader } from "@/components/ui/card";
import { listTasksForStaff } from "@/lib/data/activity";
import { formatDate } from "@/lib/utils";

export default async function TasksPage() {
  const tasks = await listTasksForStaff();

  return (
    <Card>
      <CardHeader
        title="Tasks"
        subtitle="Visibility-classified tasks with PII-sensitive controls"
      />
      <div className="space-y-3">
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500">No tasks currently queued.</p>
        ) : (
          tasks.map((task) => (
            <article
              key={task.id}
              className="rounded-md border border-slate-200 px-4 py-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">{task.title}</p>
                <span className="text-xs text-slate-500">
                  Due {formatDate(task.due_date)}
                </span>
              </div>
              <p className="mt-1 text-slate-700">{task.description ?? "-"}</p>
              <div className="mt-2 flex gap-2 text-xs text-slate-500">
                <span>{task.status}</span>
                <span>•</span>
                <span>{task.priority}</span>
                <span>•</span>
                <span>{task.visibility_classification}</span>
              </div>
            </article>
          ))
        )}
      </div>
    </Card>
  );
}

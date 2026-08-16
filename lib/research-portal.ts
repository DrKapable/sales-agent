import { notifyBusinessEvent } from "@/lib/business-notifications";
import type { Lead } from "@/lib/types";

export async function createResearchPortalTask(input: {
  title: string;
  brief: string;
  priority?: "low" | "standard" | "high" | "urgent";
  dueDate?: string;
  program?: string;
  academicLevel?: string;
  lead?: Lead | null;
  notify?: boolean;
}) {
  const secret = process.env.RESEARCH_ASSISTANT_SECRET;
  const url = process.env.RESEARCH_PORTAL_TASK_URL || "https://www.medmindslc.online/api/research/assistant-admin/tasks";
  if (!secret) return { created: false, configured: false, instruction: "Research portal automation is not configured. Do not claim that a task was created." };

  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      brief: input.brief,
      priority: input.priority || "standard",
      dueDate: input.dueDate,
      program: input.program,
      academicLevel: input.academicLevel
    })
  });
  const data = await response.json().catch(() => ({})) as { ok?: boolean; task?: { id?: string; title?: string; status?: string }; error?: string };
  if (!response.ok || !data.ok || !data.task?.id) throw new Error(data.error || `Research portal returned ${response.status}.`);

  if (input.notify !== false) {
    await notifyBusinessEvent({
      type: "research_task_created",
      eventKey: `research_task_created:${data.task.id}`,
      title: "New unassigned research task",
      body: `Task: ${input.title}\nPortal status: Available / unassigned\nNo client or operations member has been assigned. Please review it in the MedMinds Research Portal.`,
      lead: input.lead || null
    }).catch((error) => console.error("Research task notification failed", { taskId: data.task?.id, error }));
  }

  return {
    created: true,
    taskId: data.task.id,
    status: data.task.status || "available",
    assignedToClient: false,
    assignedToOperations: false,
    instruction: "The unassigned research task was created successfully. Do not claim that it has been assigned to a client or staff member."
  };
}

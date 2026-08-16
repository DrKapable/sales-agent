import { upsertExternalBusinessTask, type BusinessTaskPriority } from "@/lib/business-ops";
import { createResearchPortalTask } from "@/lib/research-portal";
import type { Lead } from "@/lib/types";

export type MirroredBusinessTaskInput = {
  leadId?: string;
  title: string;
  assignedTo?: string;
  dueAt?: string;
  notes?: string;
  priority?: BusinessTaskPriority;
};

export function researchPortalTaskFromBusinessTask(input: MirroredBusinessTaskInput, lead?: Lead | null) {
  const brief: string[] = [];
  const notes = input.notes?.trim();
  if (notes) brief.push(notes);
  else brief.push(`Business Intelligence task: ${input.title}.`);

  if (lead) {
    brief.push(`Client: ${lead.name || lead.phone}.`);
    const service = lead.serviceInterest || lead.packageName;
    if (service) brief.push(`Service: ${service}.`);
    if (lead.institution) brief.push(`Institution: ${lead.institution}.`);
  }
  if (input.assignedTo) brief.push(`Business Intelligence assignee: ${input.assignedTo}.`);

  return {
    title: input.title,
    brief: brief.join("\n"),
    priority: input.priority || "standard" as const,
    dueDate: input.dueAt,
    program: lead?.programme || undefined,
    academicLevel: undefined
  };
}

export async function createMirroredBusinessTask(input: MirroredBusinessTaskInput, lead?: Lead | null) {
  const portalPayload = researchPortalTaskFromBusinessTask(input, lead);
  const portalTask = await createResearchPortalTask({
    ...portalPayload,
    lead: lead || null,
    notify: false,
    sourceReference: "business-intelligence"
  });

  if (!portalTask.created || !portalTask.taskId) {
    throw new Error(portalTask.instruction || "Research Portal task creation failed. No Business Intelligence task was created.");
  }

  try {
    const businessTask = await upsertExternalBusinessTask({
      ...input,
      priority: input.priority || "standard",
      source: "research-portal",
      externalId: portalTask.taskId,
      program: lead?.programme || undefined,
      sourceClient: lead ? (lead.name || lead.phone) : undefined
    }) as Record<string, unknown>;
    return {
      ...businessTask,
      researchPortalTaskId: portalTask.taskId,
      researchPortalStatus: portalTask.status,
      mirrored: true
    };
  } catch (error) {
    console.error("Business Intelligence task creation failed after Research Portal task creation", {
      researchPortalTaskId: portalTask.taskId,
      title: input.title,
      error
    });
    throw new Error("The Research Portal task was created, but the Business Intelligence copy could not be saved. Please review the Research Portal before retrying to avoid a duplicate task.");
  }
}

export const leadStatuses = [
  "NEW LEAD",
  "QUALIFIED",
  "INTERESTED",
  "PAYMENT PENDING",
  "CONVERTED",
  "FOLLOW-UP REQUIRED",
  "HUMAN ASSISTANCE REQUIRED",
  "LOST LEAD"
] as const;

export type LeadStatus = (typeof leadStatuses)[number];
export type MessageRole = "user" | "assistant";
export const leadPriorities = ["HOT", "WARM", "STANDARD"] as const;
export type LeadPriority = (typeof leadPriorities)[number];

export type Lead = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  institution: string | null;
  programme: string | null;
  serviceInterest: string | null;
  deadline: string | null;
  packageName: string | null;
  status: LeadStatus;
  handoffReason: string | null;
  aiPaused: boolean;
  assignedTo: string | null;
  internalNote: string | null;
  priority: LeadPriority;
  followUpAt: string | null;
  source: "whatsapp" | "simulator";
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
};

export type ConversationMessage = {
  id: string;
  externalId: string | null;
  phone: string;
  role: MessageRole;
  content: string;
  createdAt: string;
};

export type Offer = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  features: string[];
  priceZmw: number | null;
  rushPriceZmw: number | null;
  paymentInstructions: string | null;
  active: boolean;
  updatedAt: string;
};

export type LeadPatch = Partial<Pick<Lead,
  "name" | "email" | "institution" | "programme" | "serviceInterest" |
  "deadline" | "packageName" | "status" | "handoffReason" | "aiPaused" |
  "assignedTo" | "internalNote" | "priority" | "followUpAt"
>>;

export type StaffAlertKind = "new_client" | "hot_client" | "daily_summary" | "marketing_copy" | "staff";

export const STAFF_ALERT_TEMPLATES: Record<StaffAlertKind, { name: string; text: string; example: [string, string, string] }> = {
  new_client: {
    name: "medminds_new_client_alert_v1",
    text: "MedMinds new-client notification\nFor: {{1}}\nAlert: {{2}}\nClient record: {{3}}\nA new client has contacted MedMinds. This is the client information recorded for your assigned staff notification. Please review the enquiry in the MedMinds staff dashboard.",
    example: ["Dr. Mustafa Juma Phiri", "New client alert", "Name: Amina Banda; contact: +260970000000; service: research proposal support; source: WhatsApp; enquiry: requested service information."]
  },
  hot_client: {
    name: "medminds_hot_client_alert_v1",
    text: "MedMinds priority-client notification\nFor: {{1}}\nAlert: {{2}}\nPriority record: {{3}}\nA client record has been marked as requiring priority follow-up. This is an operational update for your designated staff role. Please review the recorded enquiry and follow-up details in the MedMinds staff dashboard.",
    example: ["Dr. Mustafa Juma Phiri", "Hot MedMinds lead", "Client: Amina Banda (+260970000000); service: research proposal support; status: interested; priority: hot; follow-up: client requested a quotation."]
  },
  daily_summary: {
    name: "medminds_daily_summary_v1",
    text: "MedMinds daily management summary\nFor: {{1}}\nReport: {{2}}\nRecorded activity: {{3}}\nThis is your requested daily operational summary. It reports recorded client activity, pending work and follow-up items from the MedMinds system. Please review the complete records in the staff dashboard where action is needed.",
    example: ["Dr. Mustafa Juma Phiri", "Daily management summary for 10 October 2026", "Total leads: 169; converted: 12; hot unconverted clients: 3; follow-ups due: 5; payments pending: 2."]
  },
  marketing_copy: {
    name: "medminds_marketing_copy_v1",
    text: "MedMinds staff referral copy\nFor: {{1}}\nReferral: {{2}}\nForwarded message details: {{3}}\nA client message has been forwarded for team action. You are receiving this operational copy as a designated staff recipient. Please review the client request, assigned staff member and required action in the MedMinds dashboard.",
    example: ["Dr. Mustafa Juma Phiri", "Marketing client referral (CC)", "Assigned to: Mr Conrad Mununkha Phiri; client: Amina Banda (+260970000000); service: website campaign; request: discuss the campaign requirements and follow up with the client."]
  },
  staff: {
    name: "medminds_staff_notification_v1",
    text: "MedMinds staff notification\nFor: {{1}}\nUpdate: {{2}}\nDetails: {{3}}\nPlease review this operational update in the MedMinds staff dashboard. You receive this because you are a designated staff contact.",
    example: ["Dr. Mustafa Juma Phiri", "Daily management summary", "3 new clients; 2 hot leads; 1 payment awaiting verification."]
  }
};

export function staffAlertKind(heading: string): StaffAlertKind {
  if (/new[\s_-]*client/i.test(heading)) return "new_client";
  if (/hot.*(?:lead|client)/i.test(heading)) return "hot_client";
  if (/daily.*(?:summary|brief)/i.test(heading)) return "daily_summary";
  if (/marketing|referral|hand[\s_-]*(?:off|over)/i.test(heading)) return "marketing_copy";
  return "staff";
}

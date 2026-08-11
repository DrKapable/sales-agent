export const staffNames = [
  "Dr. Mustafa Juma Phiri",
  "Dr Kanyembo Ng'andwe",
  "Chisha",
  "Conrad Mununkha Phiri",
  "Madalitso",
  "Kabosha",
  "Dr Zabibu Nandazi"
] as const;

export type StaffName = (typeof staffNames)[number];

export const teamDirectory: ReadonlyArray<{ name: StaffName; roles: readonly string[] }> = [
  { name: "Dr. Mustafa Juma Phiri", roles: ["Management", "Payments", "Discount approvals"] },
  { name: "Dr Kanyembo Ng'andwe", roles: ["General escalation", "Operations support"] },
  { name: "Chisha", roles: ["Customer support", "Conflict and dispute resolution", "Legal consultant"] },
  { name: "Conrad Mununkha Phiri", roles: ["Digital marketing", "Marketing team", "Secretary"] },
  { name: "Madalitso", roles: ["Operations team", "Research support expert"] },
  { name: "Kabosha", roles: ["Computer scientist", "Cybersecurity expert", "Technical support"] },
  { name: "Dr Zabibu Nandazi", roles: ["Digital marketing", "Marketing team", "Customer support"] }
];

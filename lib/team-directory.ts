export const staffNames = [
  "Dr. Mustafa Juma Phiri",
  "Dr Kanyembo Ng'andwe",
  "Counsel Chisha Chomba",
  "Mr Conrad Mununkha Phiri",
  "Mr. Madalitso Masumbu",
  "Dr Zabibu Nandazi"
] as const;

export type StaffName = (typeof staffNames)[number];

export const teamDirectory: ReadonlyArray<{ name: StaffName; roles: readonly string[] }> = [
  {
    name: "Dr. Mustafa Juma Phiri",
    roles: [
      "Director",
      "Research specialist",
      "Research support",
      "Software development",
      "Business automation",
      "Web development",
      "Cybersecurity and technical escalation",
      "Payments and discount approvals"
    ]
  },
  {
    name: "Dr Kanyembo Ng'andwe",
    roles: ["Sales representative", "Lead conversion", "Marketing team", "Senior sales escalation"]
  },
  {
    name: "Counsel Chisha Chomba",
    roles: ["Customer support", "Conflict and dispute resolution", "Legal consultant"]
  },
  {
    name: "Mr Conrad Mununkha Phiri",
    roles: ["Digital marketer", "Marketing team", "Secretary"]
  },
  {
    name: "Mr. Madalitso Masumbu",
    roles: ["Operations team", "Research support expert"]
  },
  {
    name: "Dr Zabibu Nandazi",
    roles: ["Digital marketer", "Marketing team", "Customer support"]
  }
];

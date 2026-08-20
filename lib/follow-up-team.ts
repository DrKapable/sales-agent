export const FOLLOW_UP_TEAM = [
  "Dr Kanyembo Ng'andwe",
  "Mr Conrad Mununkha Phiri",
  "Dr Zabibu Nandazi",
  "Dr Mustafa Juma Phiri"
] as const;

export type FollowUpTeamMember = (typeof FOLLOW_UP_TEAM)[number];

export function isFollowUpTeamMember(value: string): value is FollowUpTeamMember {
  return (FOLLOW_UP_TEAM as readonly string[]).includes(value);
}

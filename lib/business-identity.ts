export const MEDMINDS_BUSINESS_IDENTITY = {
  brandName: "MedMinds Learning Centre",
  legalName: "MEDMINDS GENERAL DEALERS LIMITED",
  tpin: "2283739464",
  physicalAddress: "424e hornbill / OFF AIRPORT ROAD, Livingstone Southern Province"
} as const;

export function officialBusinessLines() {
  return [
    MEDMINDS_BUSINESS_IDENTITY.legalName,
    `TPIN: ${MEDMINDS_BUSINESS_IDENTITY.tpin}`,
    MEDMINDS_BUSINESS_IDENTITY.physicalAddress
  ];
}

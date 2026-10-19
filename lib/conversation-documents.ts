export function documentDeliveryLabel(status: string) {
  switch (status.toUpperCase()) {
    case "RECEIVED": return "Received from client";
    case "ACCEPTED": return "Delivery pending";
    case "SENT": return "Sent";
    case "DELIVERED": return "Delivered";
    case "READ": return "Read by client";
    case "FAILED": return "Delivery failed";
    default: return "Created · not sent";
  }
}

// Match a stored document, never construct a PDF link from Mary's text alone.
export function matchingCommercialDocument<T extends { documentNumber: string | null }>(content: string, documents: T[]): T | null {
  const references: string[] = content.toUpperCase().match(/\b(?:QUO|INV)-[A-F0-9]{8}\b/g) || [];
  return documents.find((document) => document.documentNumber != null && references.includes(document.documentNumber.toUpperCase())) || null;
}

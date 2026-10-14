import { describe, expect, it } from "vitest";
import { documentDeliveryLabel, matchingCommercialDocument } from "@/lib/conversation-documents";

describe("quotations in the client inbox", () => {
  const documents = [{ id: "stored-quote", documentNumber: "QUO-C55373DF", amountZmw: 800 }, { id: "other-quote", documentNumber: "QUO-12345678", amountZmw: 1200 }];
  it("opens the stored quotation referenced in Mary's existing acknowledgement", () => {
    expect(matchingCommercialDocument("I've prepared and sent your official quotation.\n*Quotation:* QUO-C55373DF\n*Total:* K800", documents)).toBe(documents[0]);
  });
  it("does not attach another client's quote or invent a PDF for a missing reference", () => {
    expect(matchingCommercialDocument("Quotation QUO-C55373DF", [documents[1]])).toBeNull();
    expect(matchingCommercialDocument("Would you like a quotation?", documents)).toBeNull();
    expect(matchingCommercialDocument("Quotation QUO-C55373DF123", documents)).toBeNull();
  });
  it("does not equate created or accepted documents with delivery", () => {
    expect(documentDeliveryLabel("NOT_SENT")).toBe("Created · not sent");
    expect(documentDeliveryLabel("ACCEPTED")).toBe("Delivery pending");
    expect(documentDeliveryLabel("READ")).toBe("Read by client");
    expect(documentDeliveryLabel("FAILED")).toBe("Delivery failed");
  });
});

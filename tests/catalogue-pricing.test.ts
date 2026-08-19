import { describe, expect, it } from "vitest";
import { resolveCataloguePrice } from "@/lib/catalogue-pricing";

const offers = [
  { slug: "proposal-masters", name: "Research Proposal, Master's", category: "Research and Writing", priceZmw: 2500, rushPriceZmw: 3000 },
  { slug: "data-analysis", name: "Quantitative Analysis", category: "Data Analysis", priceZmw: 1700, rushPriceZmw: 1700 },
  { slug: "software-development", name: "Software Development", category: "Digital Services", priceZmw: null, rushPriceZmw: null },
  { slug: "pa-gym", name: "Pa Gym Theory", category: "Pa Gym", priceZmw: 100, rushPriceZmw: 100 }
];

describe("catalogue quotation pricing", () => {
  it("uses the programme level to resolve a research proposal price", () => {
    const result = resolveCataloguePrice(offers, { service: "Research proposal", programme: "Master of Public Health", deadline: "30 days" });
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.offer.slug).toBe("proposal-masters");
      expect(result.amountZmw).toBe(2500);
      expect(result.priceType).toBe("standard");
    }
  });

  it("uses the catalogue rush price when the deadline is under 14 days", () => {
    const result = resolveCataloguePrice(offers, { service: "Research proposal", programme: "Masters", deadline: "7 days" });
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.amountZmw).toBe(3000);
      expect(result.priceType).toBe("rush");
    }
  });

  it("does not invent a price for custom quotation services", () => {
    const result = resolveCataloguePrice(offers, { service: "software development" });
    expect(result.status).toBe("custom");
  });

  it("resolves straightforward fixed catalogue services", () => {
    const result = resolveCataloguePrice(offers, { service: "quantitative data analysis" });
    expect(result.status).toBe("matched");
    if (result.status === "matched") expect(result.amountZmw).toBe(1700);
  });
});

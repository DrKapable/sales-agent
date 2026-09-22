import { describe, expect, it } from "vitest";
import { offerSeeds } from "../lib/catalogue";

describe("approved service catalogue", () => {
  it("uses midpoint and upper-limit research prices", () => {
    const proposal = offerSeeds.find((offer) => offer.slug === "proposal-bachelors");
    const manuscript = offerSeeds.find((offer) => offer.slug === "manuscript-writing");

    expect(proposal).toMatchObject({ priceZmw: 1400, rushPriceZmw: 1600, active: true });
    expect(manuscript).toMatchObject({ priceZmw: 5700, rushPriceZmw: 7700, active: true });
  });

  it("contains the current MedMinds Prep membership prices", () => {
    expect(offerSeeds.find((offer) => offer.slug === "pa-gym")).toMatchObject({ name: "MedMinds Prep QBank, 30 Days", priceZmw: 100 });
    expect(offerSeeds.find((offer) => offer.slug === "pa-gym-osce")).toMatchObject({ name: "MedMinds Exam Prep, 30 Days", priceZmw: 150 });
    expect(offerSeeds.find((offer) => offer.slug === "pa-gym-combined")).toMatchObject({ name: "MedMinds Complete, 30 Days", priceZmw: 200 });
    expect(offerSeeds.find((offer) => offer.slug === "prep-complete-60-days")).toMatchObject({ priceZmw: 250 });
    expect(offerSeeds.find((offer) => offer.slug === "prep-complete-90-days")).toMatchObject({ priceZmw: 500 });
    expect(offerSeeds.find((offer) => offer.slug === "pa-gym-nmcz")).toMatchObject({ priceZmw: 200 });
  });

  it("keeps presentation and human-quoted services", () => {
    expect(offerSeeds.find((offer) => offer.slug === "powerpoint-presentation")).toMatchObject({ priceZmw: 650 });
    expect(offerSeeds.find((offer) => offer.slug === "software-development")).toMatchObject({ priceZmw: null });
  });

  it("contains no em dash in client-facing catalogue text", () => {
    expect(JSON.stringify(offerSeeds)).not.toContain("—");
  });

  it("keeps Prep purchases out of personal and Research Portal payment instructions", () => {
    const prepOffers = offerSeeds.filter((offer) => offer.category === "MedMinds Prep" && (offer.priceZmw ?? 0) > 0);
    expect(prepOffers.length).toBeGreaterThan(0);
    expect(prepOffers.every((offer) => !offer.paymentInstructions?.includes("0977259132"))).toBe(true);
    expect(prepOffers.every((offer) => !offer.paymentInstructions?.includes("Juma Phiri"))).toBe(true);
    expect(prepOffers.every((offer) => !offer.paymentInstructions?.startsWith("Review research pricing"))).toBe(true);
  });

  it("retains the approved account instructions for other directly-paid catalogue services", () => {
    const directPaid = offerSeeds.filter((offer) => offer.category !== "MedMinds Prep" && (offer.priceZmw ?? 0) > 0);
    expect(directPaid.length).toBeGreaterThan(0);
    expect(directPaid.every((offer) => offer.paymentInstructions?.includes("0977259132") || offer.slug === "course-ai-research-writing")).toBe(true);
  });
});

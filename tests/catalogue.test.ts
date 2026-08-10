import { describe, expect, it } from "vitest";
import { offerSeeds } from "../lib/catalogue";

describe("approved service catalogue", () => {
  it("uses midpoint and upper-limit research prices", () => {
    const proposal = offerSeeds.find((offer) => offer.slug === "proposal-bachelors");
    const manuscript = offerSeeds.find((offer) => offer.slug === "manuscript-writing");

    expect(proposal).toMatchObject({ priceZmw: 1400, rushPriceZmw: 1600, active: true });
    expect(manuscript).toMatchObject({ priceZmw: 5700, rushPriceZmw: 7700, active: true });
  });

  it("contains the requested Pa Gym, presentation and human-quoted services", () => {
    expect(offerSeeds.find((offer) => offer.slug === "pa-gym-combined")).toMatchObject({ priceZmw: 200 });
    expect(offerSeeds.find((offer) => offer.slug === "powerpoint-presentation")).toMatchObject({ priceZmw: 650 });
    expect(offerSeeds.find((offer) => offer.slug === "software-development")).toMatchObject({ priceZmw: null });
  });

  it("contains no em dash in client-facing catalogue text", () => {
    expect(JSON.stringify(offerSeeds)).not.toContain("—");
  });
});

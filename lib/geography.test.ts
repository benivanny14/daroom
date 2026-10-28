import { describe, expect, it } from "vitest";
import { canonicalDistrict, canonicalNeighborhood, normalizePlaceName } from "./geography";
import { demoListings, neighborhoodsByDistrict } from "./listings";

describe("illustrative place normalization", () => {
  it("normalizes whitespace and case before district matching", () => {
    expect(normalizePlaceName("  KINONDONI  ")).toBe("kinondoni");
    expect(canonicalDistrict("kinondoni")).toBe("Kinondoni");
    expect(canonicalDistrict("District not on the seed list")).toBeNull();
  });

  it("matches a neighborhood only inside its selected district", () => {
    expect(canonicalNeighborhood(" Kinondoni ", " sinza ")).toBe("Sinza");
    expect(canonicalNeighborhood("Ilala", "Sinza")).toBeNull();
    expect(canonicalNeighborhood("Ilala", "  kariakoo ")).toBe("Kariakoo");
  });

  it("keeps each demo listing in its district's neighborhood list", () => {
    for (const listing of demoListings) {
      expect(neighborhoodsByDistrict[listing.district]).toContain(listing.neighborhood);
    }
  });
});

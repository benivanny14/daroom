import { Prisma } from "@prisma/client";
import { districts, neighborhoodsByDistrict, type District } from "./listings";

export function normalizePlaceName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("sw-TZ");
}

export async function findOrCreateNeighborhood(
  tx: Prisma.TransactionClient,
  districtName: string,
  neighborhoodName: string
): Promise<{ id: string; districtId: string } | null> {
  const normalizedDistrictName = districtName.normalize("NFKC").trim().replace(/\s+/g, " ");
  const normalizedNeighborhoodName = neighborhoodName.normalize("NFKC").trim().replace(/\s+/g, " ");
  const district = await tx.district.findFirst({
    where: {
      name: { equals: normalizedDistrictName, mode: "insensitive" },
      region: { is: { name: "Dar es Salaam" } }
    },
    select: { id: true }
  });
  if (!district) return null;

  const existing = await tx.neighborhood.findFirst({
    where: {
      districtId: district.id,
      name: { equals: normalizedNeighborhoodName, mode: "insensitive" }
    },
    select: { id: true, districtId: true }
  });
  if (existing) return existing;

  return tx.neighborhood.upsert({
    where: {
      districtId_name: {
        districtId: district.id,
        name: normalizedNeighborhoodName
      }
    },
    update: {},
    create: { name: normalizedNeighborhoodName, districtId: district.id },
    select: { id: true, districtId: true }
  });
}

export function canonicalDistrict(value: string): District | null {
  const key = normalizePlaceName(value);
  return districts.find((district) => normalizePlaceName(district) === key) ?? null;
}

export function canonicalNeighborhood(
  districtName: string,
  neighborhoodName: string
): string | null {
  const district = canonicalDistrict(districtName);
  if (!district) return null;
  const key = normalizePlaceName(neighborhoodName);
  return (
    neighborhoodsByDistrict[district].find(
      (neighborhood) => normalizePlaceName(neighborhood) === key
    ) ?? null
  );
}

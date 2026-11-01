import { prisma } from "@/lib/prisma";
import { districts, neighborhoodsByDistrict, type District } from "@/lib/listings";
import { notExpiredFilter } from "@/lib/listing-policy";

export type AreaType = "district" | "neighborhood";

export type Area = {
  slug: string;
  type: AreaType;
  /** Display name exactly as stored, e.g. "Sinza" or "Kinondoni". */
  name: string;
  /** District the area belongs to; for a district this is the district itself. */
  district: string;
  listings: number;
};

/** "Chang'ombe" → "changombe", "Kinondoni" → "kinondoni". */
export function areaSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2018\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Geography = { name: string; district: string }[];

const staticDistricts: Geography = districts.map((district) => ({
  name: district,
  district
}));

const staticNeighborhoods: Geography = districts.flatMap((district) =>
  neighborhoodsByDistrict[district].map((name) => ({ name, district }))
);

/**
 * Every district first, then every neighborhood. A neighborhood whose name is
 * also a district name ("Kigamboni", "Ubungo") keeps the district URL, and its
 * rooms are still listed on the district page.
 */
function buildAreas(
  districtRows: Geography,
  neighborhoodRows: Geography,
  counts: { district: Map<string, number>; neighborhood: Map<string, number> }
): Area[] {
  const used = new Set<string>();
  const areas: Area[] = [];

  for (const row of districtRows) {
    const slug = areaSlug(row.name);
    if (!slug || used.has(slug)) continue;
    used.add(slug);
    areas.push({
      slug,
      type: "district",
      name: row.name,
      district: row.district,
      listings: counts.district.get(row.name) ?? 0
    });
  }

  for (const row of neighborhoodRows) {
    const slug = areaSlug(row.name);
    if (!slug || used.has(slug)) continue;
    used.add(slug);
    areas.push({
      slug,
      type: "neighborhood",
      name: row.name,
      district: row.district,
      listings: counts.neighborhood.get(`${row.district}/${row.name}`) ?? 0
    });
  }

  return areas;
}

async function liveListingCounts() {
  const where = {
    status: "APPROVED" as const,
    priceTzs: { gte: 50_000 },
    AND: [notExpiredFilter()]
  };
  const [byDistrict, byNeighborhood] = await Promise.all([
    prisma.listing.groupBy({ by: ["districtId"], where, _count: { _all: true } }),
    prisma.listing.groupBy({ by: ["neighborhoodId"], where, _count: { _all: true } })
  ]);

  const [districtRows, neighborhoodRows] = await Promise.all([
    prisma.district.findMany({ select: { id: true, name: true } }),
    prisma.neighborhood.findMany({
      select: { id: true, name: true, district: { select: { name: true } } }
    })
  ]);

  const districtNames = new Map(districtRows.map((row) => [row.id, row.name]));
  const neighborhoodInfo = new Map(
    neighborhoodRows.map((row) => [row.id, { name: row.name, district: row.district.name }])
  );

  const district = new Map<string, number>();
  for (const row of byDistrict) {
    const name = districtNames.get(row.districtId);
    if (name) district.set(name, row._count._all);
  }

  const neighborhood = new Map<string, number>();
  for (const row of byNeighborhood) {
    const info = neighborhoodInfo.get(row.neighborhoodId);
    if (info) neighborhood.set(`${info.district}/${info.name}`, row._count._all);
  }

  return { district, neighborhood };
}

/**
 * The catalogue of public area pages with live listing counts. Falls back to the
 * built-in Dar es Salaam geography when the database cannot be reached, so the
 * pages still render instead of failing as a whole.
 */
export async function getAreas(): Promise<Area[]> {
  try {
    const [counts, districtRows, neighborhoodRows] = await Promise.all([
      liveListingCounts(),
      prisma.district.findMany({
        where: { region: { is: { name: "Dar es Salaam" } } },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      }),
      prisma.neighborhood.findMany({
        where: { district: { region: { is: { name: "Dar es Salaam" } } } },
        select: { name: true, district: { select: { name: true } } },
        orderBy: { name: "asc" }
      })
    ]);

    return buildAreas(
      districtRows.map((row) => ({ name: row.name, district: row.name })),
      neighborhoodRows.map((row) => ({ name: row.name, district: row.district.name })),
      counts
    );
  } catch (error) {
    console.error("Area catalogue query failed", error);
    return buildAreas(staticDistricts, staticNeighborhoods, {
      district: new Map(),
      neighborhood: new Map()
    });
  }
}

export async function getArea(slug: string): Promise<Area | null> {
  const target = areaSlug(slug);
  if (!target) return null;
  const areas = await getAreas();
  return areas.find((area) => area.slug === target) ?? null;
}

export function groupAreasByDistrict(areas: Area[]): { district: District | string; areas: Area[] }[] {
  const grouped = new Map<string, Area[]>();
  for (const area of areas) {
    const list = grouped.get(area.district) ?? [];
    list.push(area);
    grouped.set(area.district, list);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([district, list]) => ({
      district,
      areas: list.sort((a, b) => {
        if (a.type !== b.type) return a.type === "district" ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
    }));
}

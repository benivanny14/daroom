import { demoListings, type Listing } from "@/lib/listings";

type PublicReport = {
  id: string;
  listingId: string;
  category: string;
  details: string;
  createdAt: string;
};

const state = globalThis as typeof globalThis & {
  darRoomHiddenListings?: Set<string>;
  darRoomReports?: PublicReport[];
};

const hiddenListings = (state.darRoomHiddenListings ??= new Set<string>());
const reports = (state.darRoomReports ??= []);

export function getPublicListings(): Listing[] {
  return demoListings.filter((listing) => !hiddenListings.has(listing.id));
}

export function addPublicReport(
  listingId: string,
  category: string,
  details: string
): PublicReport | null {
  if (!demoListings.some((listing) => listing.id === listingId)) return null;
  hiddenListings.add(listingId);
  const report = {
    id: `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    listingId,
    category,
    details,
    createdAt: new Date().toISOString()
  };
  reports.push(report);
  return report;
}

export function getDemoReports(): PublicReport[] {
  return [...reports];
}

import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Aggregated numbers behind the admin overview: revenue, subscriptions, listings, users. */
export async function GET() {
  try {
    await requireAdmin();

    const now = new Date();
    const since = new Date(now.getTime() - THIRTY_DAYS_MS);

    const [
      roleGroups,
      newUsers,
      listingGroups,
      availableListings,
      subscriptionGroups,
      revenueByPlan,
      verifiedPayments,
      upcomingAppointments,
      appointmentCount,
      recentPayments
    ] = await Promise.all([
      prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      prisma.user.count({ where: { createdAt: { gte: since } } }),
      prisma.listing.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.listing.count({ where: { status: "APPROVED", isAvailable: true } }),
      prisma.subscription.groupBy({
        by: ["plan"],
        where: { status: "ACTIVE", endsAt: { gt: now } },
        _count: { _all: true }
      }),
      prisma.paymentEvent.groupBy({
        by: ["plan"],
        where: { status: "VERIFIED" },
        _count: { _all: true },
        _sum: { amountTzs: true }
      }),
      prisma.paymentEvent.aggregate({
        where: { status: "VERIFIED" },
        _count: { _all: true },
        _sum: { amountTzs: true }
      }),
      prisma.viewingAppointment.count({ where: { scheduledAt: { gte: now }, status: { not: "CANCELLED" } } }),
      prisma.viewingAppointment.count(),
      prisma.paymentEvent.findMany({
        orderBy: { receivedAt: "desc" },
        take: 10,
        select: {
          id: true,
          plan: true,
          amountTzs: true,
          status: true,
          provider: true,
          receivedAt: true,
          user: { select: { name: true, email: true } }
        }
      })
    ]);

    const countBy = (groups: { _count: { _all: number } }[], keyOf: (group: any) => string) => {
      const result: Record<string, number> = {};
      for (const group of groups) result[keyOf(group)] = group._count._all;
      return result;
    };

    const listingCounts = countBy(listingGroups, (group) => group.status);
    const userCounts = countBy(roleGroups, (group) => group.role);

    const response = NextResponse.json({
      users: {
        total: roleGroups.reduce((sum, group) => sum + group._count._all, 0),
        dalali: userCounts.DALALI || 0,
        tenant: userCounts.TENANT || 0,
        admin: userCounts.ADMIN || 0,
        newLast30Days: newUsers
      },
      listings: {
        total: listingGroups.reduce((sum, group) => sum + group._count._all, 0),
        approved: listingCounts.APPROVED || 0,
        pending: listingCounts.PENDING || 0,
        flagged: listingCounts.FLAGGED || 0,
        hidden: listingCounts.HIDDEN || 0,
        rejected: listingCounts.REJECTED || 0,
        expired: listingCounts.EXPIRED || 0,
        available: availableListings
      },
      subscriptions: {
        active: subscriptionGroups.reduce((sum, group) => sum + group._count._all, 0),
        byPlan: countBy(subscriptionGroups, (group) => group.plan)
      },
      revenue: {
        totalTzs: verifiedPayments._sum.amountTzs || 0,
        verifiedCount: verifiedPayments._count._all,
        byPlan: revenueByPlan.map((group) => ({
          plan: group.plan,
          count: group._count._all,
          totalTzs: group._sum.amountTzs || 0
        }))
      },
      appointments: { total: appointmentCount, upcoming: upcomingAppointments },
      recentPayments
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Admin stats failed", error);
    return NextResponse.json({ error: "The overview is unavailable." }, { status: 503 });
  }
}

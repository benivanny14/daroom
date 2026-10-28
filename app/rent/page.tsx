import Link from "next/link";
import { redirect } from "next/navigation";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { RentPaymentForm } from "@/components/RentPaymentForm";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const statusNames: Record<string, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  FAILED: "Failed",
  CANCELLED: "Cancelled"
};

export default async function RentPaymentPage({
  searchParams
}: {
  searchParams: Promise<{ listing?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/account?next=%2Frent");
  if (user.role === "ADMIN") redirect("/admin");
  if (user.role !== "TENANT") redirect("/dalali");

  const params = await searchParams;
  const favorites = await prisma.favorite.findMany({
    where: { userId: user.id },
    select: { listingId: true }
  });
  const listingIds = new Set(favorites.map((favorite) => favorite.listingId));
  if (params.listing) listingIds.add(params.listing);

  const [rooms, payments] = await Promise.all([
    listingIds.size
      ? prisma.listing.findMany({
          where: { id: { in: [...listingIds] } },
          select: {
            id: true,
            title: true,
            priceTzs: true,
            district: { select: { name: true } },
            neighborhood: { select: { name: true } }
          },
          orderBy: { createdAt: "desc" },
          take: 50
        })
      : Promise.resolve([]),
    prisma.rentPayment.findMany({
      where: { tenantId: user.id },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        amountTzs: true,
        status: true,
        createdAt: true,
        paidAt: true,
        listing: { select: { title: true } }
      }
    })
  ]);

  return (
    <>
      <header className="topbar">
        <div className="shell account-topbar">
          <Link className="brand" href="/">
            <span className="brand-mark">D</span> DarRoom
          </Link>
          <nav className="nav-links">
            <Link href="/account">My account</Link>
            <Link href="/">All rooms</Link>
            <DarkModeToggle />
          </nav>
        </div>
      </header>
      <main className="shell">
        <section className="account-dashboard">
          <div className="account-hero">
            <div>
              <span className="eyebrow">Tenant payments</span>
              <h1>Pay rent with mobile money.</h1>
              <p>
                Use this page when your agent has asked you to pay rent through DarRoom. You approve the
                payment on your own phone; DarRoom never asks for your mobile-money PIN.
              </p>
            </div>
            <div className="account-hero-actions">
              <Link className="table-action" href="/account">Back to my account</Link>
            </div>
          </div>

          <div className="account-grid">
            <RentPaymentForm
              defaultPhone={user.phone}
              initialListingId={params.listing}
              rooms={rooms.map((room) => ({
                id: room.id,
                title: room.title,
                priceTzs: room.priceTzs,
                district: room.district.name,
                neighborhood: room.neighborhood.name
              }))}
            />

            <article className="panel">
              <span className="eyebrow">Recent payments</span>
              <h2>Your rent payments</h2>
              {payments.length ? (
                <div className="appointment-list">
                  {payments.map((payment) => (
                    <div className="appointment-item" key={payment.id}>
                      <div>
                        <h3>TSh {payment.amountTzs.toLocaleString("en-TZ")}</h3>
                        <p>{payment.listing?.title || "General rent payment"}</p>
                        <p className="fine-print">
                          {new Date(payment.paidAt || payment.createdAt).toLocaleString("en-GB", {
                            dateStyle: "medium",
                            timeStyle: "short"
                          })}
                        </p>
                      </div>
                      <span
                        className={`status ${
                          payment.status === "PAID"
                            ? "live"
                            : payment.status === "PENDING"
                              ? "pending"
                              : "flagged"
                        }`}
                      >
                        {statusNames[payment.status] || payment.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty">You have not made a rent payment through DarRoom yet.</p>
              )}
            </article>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="shell footer-inner">
          <p>© 2026 DarRoom · Dar es Salaam, Tanzania</p>
          <span>Payments are processed by SonicPesa.</span>
        </div>
      </footer>
    </>
  );
}

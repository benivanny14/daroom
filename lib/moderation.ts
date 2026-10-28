import { Prisma, PrismaClient } from "@prisma/client";

export async function banDalali(
  prisma: Pick<PrismaClient, "$transaction">,
  input: {
    userId: string;
    normalizedPhone: string;
    normalizedEmail: string | null;
    reason: string;
    moderatorId: string;
  }
): Promise<void> {
  await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    await transaction.blacklistEntry.create({
      data: {
        normalizedPhone: input.normalizedPhone,
        normalizedEmail: input.normalizedEmail,
        reason: input.reason,
        moderatorId: input.moderatorId
      }
    });
    await transaction.listing.deleteMany({ where: { ownerId: input.userId } });
    await transaction.user.delete({ where: { id: input.userId } });
  });
}

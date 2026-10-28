import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse, requireUser } from "@/lib/auth";
import { readJsonBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/rate-limit-middleware";
import { setSecurityHeaders } from "@/lib/security";
import { z } from "zod";

export const dynamic = "force-dynamic";

const action = z.object({ action: z.enum(["cancel"]) });

/**
 * The tenant who booked a viewing can cancel it. Agents use
 * /api/dalali/appointments/[appointmentId] to decline or complete it.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ appointmentId: string }> }
) {
  return withRateLimit(request, async () => {
    try {
      assertSameOrigin(request);
      const user = await requireUser();
      const { appointmentId } = await context.params;

      const rawBody = await readJsonBody(request, 1024);
      if (!rawBody.ok) {
        return NextResponse.json({ error: "The data is invalid or too large." }, { status: rawBody.status });
      }
      const body = action.safeParse(rawBody.value);
      if (!body.success) {
        return NextResponse.json({ error: "Unknown viewing action." }, { status: 400 });
      }

      const appointment = await prisma.viewingAppointment.findFirst({
        where: { id: appointmentId, userId: user.id },
        select: { id: true, status: true }
      });
      if (!appointment) {
        return NextResponse.json({ error: "Viewing not found." }, { status: 404 });
      }
      if (["CANCELLED", "DECLINED", "COMPLETED"].includes(appointment.status)) {
        return NextResponse.json({ error: "This viewing is already closed." }, { status: 400 });
      }

      const updated = await prisma.viewingAppointment.update({
        where: { id: appointment.id },
        data: { status: "CANCELLED" },
        select: { id: true, status: true }
      });

      return setSecurityHeaders(NextResponse.json({
        appointment: { id: updated.id, status: updated.status },
        message: "Your viewing has been cancelled."
      }));
    } catch (error) {
      return authErrorResponse(error);
    }
  });
}

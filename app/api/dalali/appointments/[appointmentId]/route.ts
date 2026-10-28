import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, authErrorResponse, requireAgent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/http";
import { withRateLimit } from "@/lib/rate-limit-middleware";
import { setSecurityHeaders } from "@/lib/security";
import { z } from "zod";

export const dynamic = "force-dynamic";

const statusUpdate = z.object({
  status: z.enum(["CONFIRMED", "DECLINED", "COMPLETED"])
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ appointmentId: string }> }
) {
  return withRateLimit(request, async () => {
    try {
      assertSameOrigin(request);
      const user = await requireAgent();
      const { appointmentId } = await context.params;
      const rawBody = await readJsonBody(request, 1024);
      if (!rawBody.ok) {
        return NextResponse.json({ error: "The data is invalid or too large." }, { status: rawBody.status });
      }
      const body = statusUpdate.safeParse(rawBody.value);
      if (!body.success) {
        return NextResponse.json({ error: "Viewing status is invalid." }, { status: 400 });
      }

      const appointment = await prisma.viewingAppointment.findFirst({
        where: { id: appointmentId, listing: { ownerId: user.id } },
        select: { id: true, status: true }
      });
      if (!appointment) {
        return NextResponse.json({ error: "Viewing not found." }, { status: 404 });
      }
      if (appointment.status === "COMPLETED") {
        return NextResponse.json({ error: "This viewing is already completed." }, { status: 400 });
      }

      const updated = await prisma.viewingAppointment.update({
        where: { id: appointment.id },
        data: { status: body.data.status }
      });

      return setSecurityHeaders(NextResponse.json({
        appointment: { id: updated.id, status: updated.status }
      }));
    } catch (error) {
      return authErrorResponse(error);
    }
  });
}

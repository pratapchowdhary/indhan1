import { z } from "zod";
import { router, adminProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { userInvitations, users } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { notifyOwner } from "../_core/notification";

const INVITE_EXPIRY_HOURS = 72; // 3 days

function generateToken(): string {
  return randomBytes(48).toString("hex");
}

export const invitationsRouter = router({
  // List all invitations (admin only)
  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const invites = await db
      .select()
      .from(userInvitations)
      .orderBy(userInvitations.createdAt);
    return invites;
  }),

  // Create a new invitation (admin only)
  create: adminProcedure
    .input(
      z.object({
        email: z.string().email().max(320),
        role: z.enum(["incharge", "accountant", "pump_attendant", "user"]),
        origin: z.string().url(), // frontend origin for building the invite link
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Check if there's already a pending invite for this email
      const existing = await db
        .select()
        .from(userInvitations)
        .where(
          and(
            eq(userInvitations.email, input.email),
            eq(userInvitations.status, "pending")
          )
        );
      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A pending invitation already exists for this email address.",
        });
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

      await db.insert(userInvitations).values({
        email: input.email,
        role: input.role,
        token,
        invitedBy: ctx.user.id,
        invitedByName: ctx.user.name ?? "Admin",
        status: "pending",
        expiresAt,
      });

      const inviteUrl = `${input.origin}/invite/${token}`;
      const roleLabel = input.role.replace("_", " ");

      // Notify the owner (Kranthi) about the new invite
      await notifyOwner({
        title: `New User Invitation Sent`,
        content: `An invitation was sent to **${input.email}** for the role of **${roleLabel}**.\n\nInvite link: ${inviteUrl}\n\nExpires in ${INVITE_EXPIRY_HOURS} hours.`,
      }).catch(() => {});

      return { success: true, inviteUrl, token };
    }),

  // Revoke a pending invitation (admin only)
  revoke: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db
        .update(userInvitations)
        .set({ status: "revoked" })
        .where(
          and(
            eq(userInvitations.id, input.id),
            eq(userInvitations.status, "pending")
          )
        );
      return { success: true };
    }),

  // Get invite details by token (public — for the accept page)
  getByToken: publicProcedure
    .input(z.object({ token: z.string().length(96) }))
    .query(async ({ input }) => {
      const db = await getDb();
    if (!db) return null;
      const [invite] = await db
        .select()
        .from(userInvitations)
        .where(eq(userInvitations.token, input.token));

      if (!invite) return null;

      // Check expiry
      if (invite.expiresAt < new Date() && invite.status === "pending") {
        await db
          .update(userInvitations)
          .set({ status: "expired" })
          .where(eq(userInvitations.id, invite.id));
        return { ...invite, status: "expired" as const };
      }

      return invite;
    }),

  // Accept an invitation — called after the user logs in via Manus OAuth
  accept: adminProcedure
    .input(z.object({ token: z.string().length(96) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [invite] = await db
        .select()
        .from(userInvitations)
        .where(
          and(
            eq(userInvitations.token, input.token),
            eq(userInvitations.status, "pending")
          )
        );

      if (!invite) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found or already used.",
        });
      }

      if (invite.expiresAt < new Date()) {
        await db
          .update(userInvitations)
          .set({ status: "expired" })
          .where(eq(userInvitations.id, invite.id));
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invitation has expired. Please request a new one.",
        });
      }

      // Update the current user's role to match the invitation
      await db
        .update(users)
        .set({ role: invite.role })
        .where(eq(users.id, ctx.user.id));

      // Mark invitation as accepted
      await db
        .update(userInvitations)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(userInvitations.id, invite.id));

      await notifyOwner({
        title: `Invitation Accepted`,
        content: `**${ctx.user.name ?? ctx.user.email ?? "A user"}** accepted the invitation for the **${invite.role}** role.`,
      }).catch(() => {});

      return { success: true, role: invite.role };
    }),
});

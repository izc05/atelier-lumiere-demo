import { USER_ROLES, isProviderRole } from "../../shared/src/domain.mjs";

export const AUTH_POLICY = Object.freeze({
  invitationTtlHours: 48,
  minimumPasswordLength: 12,
  requireEmailVerification: true,
  requireProviderTwoFactor: true
});

export function invitationExpiresAt(createdAt, ttlHours = AUTH_POLICY.invitationTtlHours) {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) throw new TypeError("Fecha de invitación no válida.");
  return new Date(created.getTime() + ttlHours * 60 * 60 * 1000);
}

export function canAcceptProviderInvitation({ role, emailVerified, twoFactorEnabled }) {
  if (!isProviderRole(role)) return false;
  if (!emailVerified) return false;
  return AUTH_POLICY.requireProviderTwoFactor ? Boolean(twoFactorEnabled) : true;
}

export function canInviteProviders(role) {
  return role === USER_ROLES.ADMIN;
}

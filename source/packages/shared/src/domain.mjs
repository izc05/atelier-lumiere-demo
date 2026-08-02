export const USER_ROLES = Object.freeze({
  ADMIN: "ADMIN",
  PROVIDER_OWNER: "PROVIDER_OWNER",
  PROVIDER_MEMBER: "PROVIDER_MEMBER",
  CUSTOMER: "CUSTOMER"
});

export const PROVIDER_STATUS = Object.freeze({
  INVITED: "INVITED",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED"
});

export const PRODUCT_STATUS = Object.freeze({
  DRAFT: "DRAFT",
  IN_REVIEW: "IN_REVIEW",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED"
});

export const BLOG_STATUS = Object.freeze({
  DRAFT: "DRAFT",
  IN_REVIEW: "IN_REVIEW",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
  SCHEDULED: "SCHEDULED",
  PUBLISHED: "PUBLISHED",
  REJECTED: "REJECTED"
});

export function isProviderRole(role) {
  return role === USER_ROLES.PROVIDER_OWNER || role === USER_ROLES.PROVIDER_MEMBER;
}

export function assertTenantAccess({ actorProviderId, resourceProviderId, role }) {
  if (role === USER_ROLES.ADMIN) return true;
  if (!isProviderRole(role)) return false;
  return Boolean(actorProviderId) && actorProviderId === resourceProviderId;
}

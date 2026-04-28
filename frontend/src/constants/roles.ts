/**
 * Casa Moderna DMS — role constants and permission groups.
 *
 * Seven job-profile roles for the 9-person team.
 * Add ROLES.DIRECTOR, ROLES.ADMIN, and ROLES.SYSTEM_MGR to every group —
 * they are the top-level principals and must always have full access.
 */

export const ROLES = {
  // ── Custom CM roles (one per job profile) ────────────────────────────────
  DIRECTOR:    'CM Director',      // Owner / business principal
  ADMIN:       'CM Admin',         // System administrator (full access, excl. Director-only)
  SALES_MGR:   'CM Sales Manager', // Sales & purchase manager
  OFFICE_ADMIN:'CM Office Admin',  // Office administrator
  ACCOUNTS:    'CM Accounts',      // Accounts manager
  WAREHOUSE:   'CM Warehouse',     // Warehouse person
  SALES:       'CM Sales',         // Sales staff

  // ── ERPNext built-in (kept for system-level desk access) ─────────────────
  SYSTEM_MGR:  'System Manager',
} as const

export function hasRole(userRoles: string[], ...check: string[]): boolean {
  return check.some((r) => userRoles.includes(r))
}

// Shorthand — every group starts with these three principals.
const TOP: string[] = ['CM Director', 'CM Admin', 'System Manager']

/**
 * Permission groups — each maps to a feature area of the application.
 * can('groupName') returns true if the user holds any role in that group.
 *
 * RULE: ROLES.DIRECTOR, ROLES.ADMIN, ROLES.SYSTEM_MGR must be in every group.
 */
export const ROLE_GROUPS: Record<string, string[]> = {
  // ── Sales & CRM ────────────────────────────────────────────────────────────
  canSales:              [...TOP, ROLES.SALES_MGR, ROLES.OFFICE_ADMIN, ROLES.SALES],
  canEditCustomer:       [...TOP, ROLES.SALES_MGR, ROLES.OFFICE_ADMIN, ROLES.SALES],

  // ── Products & Pricing ────────────────────────────────────────────────────
  canEditProduct:        [...TOP, ROLES.SALES_MGR],
  canSeePricing:         [...TOP, ROLES.SALES_MGR, ROLES.ACCOUNTS],
  canManagePriceLists:   [...TOP, ROLES.SALES_MGR],
  canPriceSupervisor:    [...TOP, ROLES.SALES_MGR],  // approve below-floor price overrides

  // ── Purchasing ─────────────────────────────────────────────────────────────
  canPurchasing:         [...TOP, ROLES.SALES_MGR],
  canAutoPR:             [...TOP, ROLES.SALES_MGR],
  canSupplierPerf:       [...TOP, ROLES.SALES_MGR],

  // ── Warehouse & Stock ──────────────────────────────────────────────────────
  canWarehouse:          [...TOP, ROLES.SALES_MGR, ROLES.WAREHOUSE],
  canStockAdmin:         [...TOP, ROLES.SALES_MGR, ROLES.WAREHOUSE],

  // ── Service, Vouchers, Projects, Warranty ────────────────────────────────
  canService:            [...TOP, ROLES.SALES_MGR, ROLES.OFFICE_ADMIN, ROLES.SALES],
  canVouchers:           [...TOP, ROLES.SALES_MGR, ROLES.OFFICE_ADMIN, ROLES.SALES],
  canAuthorizeVouchers:  [...TOP, ROLES.SALES_MGR],
  canWarranty:           [...TOP, ROLES.SALES_MGR, ROLES.OFFICE_ADMIN, ROLES.SALES],
  canProjects:           [...TOP, ROLES.SALES_MGR, ROLES.SALES],

  // ── Operations ────────────────────────────────────────────────────────────
  canOperations:         [...TOP, ROLES.SALES_MGR, ROLES.WAREHOUSE, ROLES.SALES],

  // ── Finance ───────────────────────────────────────────────────────────────
  canFinance:            [...TOP, ROLES.SALES_MGR, ROLES.ACCOUNTS, ROLES.OFFICE_ADMIN],
  canFinanceAccounting:  [...TOP, ROLES.ACCOUNTS],
  canFinanceReports:     [...TOP, ROLES.ACCOUNTS],           // director + accounts only (tight)
  canCashHandover:       [...TOP, ROLES.SALES_MGR, ROLES.ACCOUNTS, ROLES.OFFICE_ADMIN],
  canConfirmDailyReceipt:[ROLES.DIRECTOR],                   // owner receives cash — director only
  canBankRecon:          [...TOP, ROLES.ACCOUNTS],
  canAnalytics:          [...TOP, ROLES.SALES_MGR, ROLES.ACCOUNTS],
  canSeeFinancialTotals: [...TOP, ROLES.SALES_MGR, ROLES.ACCOUNTS, ROLES.OFFICE_ADMIN],

  // ── Credit & SO approvals ─────────────────────────────────────────────────
  canGrantCredit:        [...TOP, ROLES.SALES_MGR, ROLES.ACCOUNTS],
  canConfirmSO:          [...TOP, ROLES.SALES_MGR],          // sales manager or above

  // ── Administration ────────────────────────────────────────────────────────
  canAdmin:              [...TOP],
  canManageUsers:        [...TOP],
}

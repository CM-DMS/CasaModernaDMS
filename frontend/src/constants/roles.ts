// Authoritative role name constants — matches V2 ONE-CasaModernaDMS exactly.
export const ROLES = {
  DIRECTOR:           'Owner / Director',
  SUPER_ADMIN:        'CM Super Admin',
  SALES_CONSOLE:      'CasaModerna Sales Console',
  PRODUCT_MAINT:      'CasaModerna Product Maintainer',
  PRODUCTS_VIEW:      'CasaModerna Products Console',
  SUPPLIER_MAINT:     'CasaModerna Supplier Maintainer',
  SUPPLIERS_VIEW:     'CasaModerna Suppliers Console',
  PRICE_SUPERVISOR:   'CasaModerna Price Supervisor',
  PURCHASING_CONSOLE: 'CasaModerna Purchasing Console',
  CREDIT_MANAGER:     'CasaModerna Credit Manager',
  VOUCHER_AUTHORIZER: 'Voucher Authorizer',
  LOGISTICS:          'CasaModerna Logistics',
  SALES_MANAGER:      'Sales Manager',
  SALES_USER:         'Sales User',
  ACCOUNTS_MGR:       'Accounts Manager',
  ACCOUNTS_USER:      'Accounts User',
  STOCK_MGR:          'Stock Manager',
  STOCK_USER:         'Stock User',
  PURCHASE_MGR:       'Purchase Manager',
  PURCHASE_USER:      'Purchase User',
  SYSTEM_MGR:         'System Manager',
} as const

export function hasRole(userRoles: string[], ...check: string[]): boolean {
  return check.some((r) => userRoles.includes(r))
}

// INVARIANT: ROLES.SYSTEM_MGR, ROLES.DIRECTOR, ROLES.SUPER_ADMIN appear in every group.
export const ROLE_GROUPS: Record<string, string[]> = {
  canSeeFinancialTotals: [ROLES.DIRECTOR, ROLES.SUPER_ADMIN, ROLES.SYSTEM_MGR, ROLES.ACCOUNTS_MGR, ROLES.ACCOUNTS_USER, ROLES.LOGISTICS],
  canSeePricing:        [ROLES.DIRECTOR, ROLES.SUPER_ADMIN, ROLES.SYSTEM_MGR, ROLES.PRODUCT_MAINT, ROLES.SUPPLIER_MAINT, ROLES.PURCHASE_MGR],
  canEditCustomer:      [ROLES.DIRECTOR, ROLES.SUPER_ADMIN, ROLES.SYSTEM_MGR, ROLES.SALES_CONSOLE, ROLES.SALES_MANAGER],
  canEditProduct:       [ROLES.DIRECTOR, ROLES.SUPER_ADMIN, ROLES.SYSTEM_MGR, ROLES.PRODUCT_MAINT, ROLES.SUPPLIER_MAINT],
  canManageUsers:       [ROLES.DIRECTOR, ROLES.SUPER_ADMIN, ROLES.SYSTEM_MGR],
  canSales:             [ROLES.DIRECTOR, ROLES.SUPER_ADMIN, ROLES.SYSTEM_MGR, ROLES.SALES_CONSOLE, ROLES.SALES_MANAGER, ROLES.SALES_USER],
  canWarehouse:         [ROLES.DIRECTOR, ROLES.SUPER_ADMIN, ROLES.SYSTEM_MGR, ROLES.STOCK_MGR, ROLES.STOCK_USER],
  canStockAdmin:        [ROLES.DIRECTOR, ROLES.SUPER_ADMIN, ROLES.SYSTEM_MGR, ROLES.STOCK_MGR],
  canPurchasing:        [ROLES.DIRECTOR, ROLES.SUPER_ADMIN, ROLES.SYSTEM_MGR, ROLES.SUPPLIER_MAINT, ROLES.PURCHASE_MGR, ROLES.PURCHASE_USER, ROLES.PURCHASING_CONSOLE],
  canFinance:           [ROLES.DIRECTOR, ROLES.SUPER_ADMIN, ROLES.SYSTEM_MGR, ROLES.ACCOUNTS_MGR, ROLES.ACCOUNTS_USER, ROLES.SALES_MANAGER, ROLES.LOGISTICS],
  canFinanceAccounting: [ROLES.DIRECTOR, ROLES.SUPER_ADMIN, ROLES.SYSTEM_MGR, ROLES.ACCOUNTS_MGR],
  canFinanceReports:    [ROLES.DIRECTOR, ROLES.SUPER_ADMIN, ROLES.SYSTEM_MGR, ROLES.ACCOUNTS_MGR],
  canAdmin:             [ROLES.DIRECTOR, ROLES.SUPER_ADMIN, ROLES.SYSTEM_MGR],
}

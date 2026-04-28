import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { PermissionsProvider } from './auth/PermissionsProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { Layout } from './components/layout/Layout'
import { LoginPage } from './screens/auth/LoginPage'
import { Dashboard } from './screens/dashboard/Dashboard'
import { ProductList } from './screens/products/ProductList'
import { ProductProfile } from './screens/products/ProductProfile'
import { ProductEditor } from './screens/products/ProductEditor'
import { SupplierList } from './screens/suppliers/SupplierList'
import { SupplierProfile } from './screens/suppliers/SupplierProfile'
import { ConfiguratorPricingList } from './screens/configurator/ConfiguratorPricingList'
import { ConfiguratorPricingDetail } from './screens/configurator/ConfiguratorPricingDetail'
import { CustomerList } from './screens/customers/CustomerList'
import { CustomerProfile } from './screens/customers/CustomerProfile'
import { CustomerEditor } from './screens/customers/CustomerEditor'
import { QuotationList } from './screens/sales/QuotationList'
import { QuotationDetail } from './screens/sales/QuotationDetail'
import { QuotationEditor } from './screens/sales/QuotationEditor'
import { SalesOrderList } from './screens/sales/SalesOrderList'
import { SalesOrderDetail } from './screens/sales/SalesOrderDetail'
import { SalesOrderEditor } from './screens/sales/SalesOrderEditor'
import { SalesInvoiceList } from './screens/sales/SalesInvoiceList'
import { SalesInvoiceDetail } from './screens/sales/SalesInvoiceDetail'
import { SalesInvoiceEditor } from './screens/sales/SalesInvoiceEditor'
import { DeliveryNoteList } from './screens/sales/DeliveryNoteList'
import { DeliveryNoteDetail } from './screens/sales/DeliveryNoteDetail'
import { DeliveryNoteEditor } from './screens/sales/DeliveryNoteEditor'
import { PurchaseOrderList } from './screens/purchases/PurchaseOrderList'
import { PurchaseOrderDetail } from './screens/purchases/PurchaseOrderDetail'
import { GRNList } from './screens/purchases/GRNList'
import { GRNDetail } from './screens/purchases/GRNDetail'
import { StockBalances } from './screens/warehouse/StockBalances'
import { StockLedger } from './screens/warehouse/StockLedger'
import { AgedReceivables } from './screens/finance/AgedReceivables'
import { PaymentEntryList } from './screens/finance/PaymentEntryList'
import { PaymentEntryCreate } from './screens/finance/PaymentEntryCreate'
import { CreditNoteList } from './screens/sales/CreditNoteList'
import { CreditNoteCreate } from './screens/sales/CreditNoteCreate'
import { CreditNoteDetail } from './screens/sales/CreditNoteDetail'
import { SalesSearchScreen } from './screens/sales/SalesSearchScreen'
import { SupervisorOverridePage } from './screens/sales/SupervisorOverridePage'
import { ChangePassword } from './screens/auth/ChangePassword'
import { AdminDeskLogin } from './screens/auth/AdminDeskLogin'
import { ProformaList } from './screens/sales/ProformaList'
import { SalesOrderQueue } from './screens/sales/SalesOrderQueue'
import { CashSaleList } from './screens/sales/CashSaleList'
import { CashSaleEditor } from './screens/sales/CashSaleEditor'
import { DeliveryPrep } from './screens/warehouse/DeliveryPrep'
import { DeliveryPickupScreen } from './screens/warehouse/DeliveryPickupScreen'
import { StockAdjustmentList } from './screens/warehouse/StockAdjustmentList'
import { StockAdjustmentEditor } from './screens/warehouse/StockAdjustmentEditor'
import { StockTransferList } from './screens/warehouse/StockTransferList'
import { StockTransferEditor } from './screens/warehouse/StockTransferEditor'
import { StockPullPlanning } from './screens/warehouse/StockPullPlanning'
import { RegistrationList } from './screens/customers/RegistrationList'
import { RegistrationDetail } from './screens/customers/RegistrationDetail'
import { VoucherList } from './screens/customers/VoucherList'
import { VoucherEditor } from './screens/customers/VoucherEditor'
import { VoucherPayment } from './screens/customers/VoucherPayment'
import { VoucherPrint } from './screens/customers/VoucherPrint'
import { VoucherApprovals } from './screens/customers/VoucherApprovals'
import { CustomerReportList } from './screens/customers/CustomerReportList'
import { CustomerReportEditor } from './screens/customers/CustomerReportEditor'
import { JobCardList } from './screens/service/JobCardList'
import { JobCardDetail } from './screens/service/JobCardDetail'
import { JobCardEditor } from './screens/service/JobCardEditor'
import { WarrantyList } from './screens/service/WarrantyList'
import { WarrantyEditor } from './screens/service/WarrantyEditor'
import { ServiceProviderList } from './screens/service/ServiceProviderList'
import { ServiceProviderProfile } from './screens/service/ServiceProviderProfile'
import { ProjectList }          from './screens/projects/ProjectList'
import { ProjectDetail }        from './screens/projects/ProjectDetail'
import { ProjectEditor }        from './screens/projects/ProjectEditor'
import { OperationsCalendar }   from './screens/operations/OperationsCalendar'
import { AppointmentList }      from './screens/operations/AppointmentList'
import { AppointmentEditor }    from './screens/operations/AppointmentEditor'
import { LeaveRequestList }     from './screens/operations/LeaveRequestList'
import { LeaveRequestEditor }   from './screens/operations/LeaveRequestEditor'
import { SmsLog }               from './screens/operations/SmsLog'
import { UserList }              from './screens/admin/UserList'
import { UserDetail }            from './screens/admin/UserDetail'
import { AuditLog }              from './screens/admin/AuditLog'
import { PermissionsViewer }     from './screens/admin/PermissionsViewer'
import { BackupRestore }         from './screens/admin/BackupRestore'
import { DataReset }             from './screens/admin/DataReset'
import { PriceListAdmin }        from './screens/admin/PriceListAdmin'
import { PriceListEditor }       from './screens/admin/PriceListEditor'
import { PriceCalculatorAdmin }  from './screens/admin/PriceCalculatorAdmin'
import { TilesCalculatorPage }   from './screens/tools/TilesCalculatorPage'
import { SupplierEditor } from './screens/suppliers/SupplierEditor'
import { PurchaseOrderEditor } from './screens/purchases/PurchaseOrderEditor'
import { GRNEditor } from './screens/purchases/GRNEditor'
import { FulfillmentReview } from './screens/sales/FulfillmentReview'
import { BillList } from './screens/finance/BillList'
import { BillDetail } from './screens/finance/BillDetail'
import { BillEditor } from './screens/finance/BillEditor'
import { APDueScreen } from './screens/finance/APDueScreen'
import { DailyCollections } from './screens/finance/DailyCollections'
import { CashHandover } from './screens/finance/CashHandover'
import { JournalEntryList } from './screens/finance/JournalEntryList'
import { BankReconciliation } from './screens/finance/BankReconciliation'
import { FinancialReports } from './screens/finance/FinancialReports'
import { VatReturn } from './screens/finance/VatReturn'
import { ItemsToOrder } from './screens/purchases/ItemsToOrder'
import { ProcurementDispatch } from './screens/purchases/ProcurementDispatch'
import { AutoPRScreen } from './screens/purchases/AutoPRScreen'
import { CfgOrderTracker } from './screens/purchases/CfgOrderTracker'
import { FreeTextReviews } from './screens/purchases/FreeTextReviews'
import { SupplierPerformance } from './screens/purchases/SupplierPerformance'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PermissionsProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin-desk" element={<AdminDeskLogin />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />

              {/* Customers */}
              <Route path="/customers" element={<CustomerList />} />
              <Route path="/customers/new" element={<CustomerEditor />} />
              <Route path="/customers/:name" element={<CustomerProfile />} />
              <Route path="/customers/:name/edit" element={<CustomerEditor />} />

              {/* Sales */}
              <Route path="/sales/quotations" element={<QuotationList />} />
              <Route path="/sales/quotations/new" element={<QuotationEditor />} />
              <Route path="/sales/quotations/:name" element={<QuotationDetail />} />
              <Route path="/sales/quotations/:name/edit" element={<QuotationEditor />} />
              <Route path="/sales/orders" element={<SalesOrderList />} />
              <Route path="/sales/orders/new" element={<SalesOrderEditor />} />
              <Route path="/sales/orders/:name" element={<SalesOrderDetail />} />
              <Route path="/sales/orders/:name/edit" element={<SalesOrderEditor />} />
              <Route path="/sales/invoices" element={<SalesInvoiceList />} />
              <Route path="/sales/invoices/new" element={<SalesInvoiceEditor />} />
              <Route path="/sales/invoices/:name" element={<SalesInvoiceDetail />} />
              <Route path="/sales/invoices/:name/edit" element={<SalesInvoiceEditor />} />
              <Route path="/sales/credit-notes" element={<CreditNoteList />} />
              <Route path="/sales/credit-notes/new" element={<CreditNoteCreate />} />
              <Route path="/sales/credit-notes/:id" element={<CreditNoteDetail />} />
              <Route path="/sales/search" element={<SalesSearchScreen />} />
              <Route path="/sales/proformas" element={<ProformaList />} />
              <Route path="/sales/pending" element={<SalesOrderQueue />} />
              <Route path="/sales/queue" element={<SalesOrderQueue />} />
              <Route path="/sales/cash-sales" element={<CashSaleList />} />
              <Route path="/sales/cash-sales/new" element={<CashSaleEditor />} />
              <Route path="/sales/cash-sales/:id" element={<CashSaleEditor />} />
              <Route path="/sales/delivery-notes" element={<DeliveryNoteList />} />
              <Route path="/sales/delivery-notes/new" element={<DeliveryNoteEditor />} />
              <Route path="/sales/delivery-notes/:name" element={<DeliveryNoteDetail />} />
              <Route path="/sales/delivery-notes/:name/edit" element={<DeliveryNoteEditor />} />

              {/* Catalogue */}
              <Route path="/products" element={<ProductList />} />
              <Route path="/products/new" element={<ProductEditor />} />
              <Route path="/products/:itemCode" element={<ProductProfile />} />
              <Route path="/products/:itemCode/edit" element={<ProductEditor />} />
              <Route path="/suppliers" element={<SupplierList />} />
              <Route path="/suppliers/new" element={<SupplierEditor />} />
              <Route path="/suppliers/:name" element={<SupplierProfile />} />
              <Route path="/suppliers/:name/edit" element={<SupplierEditor />} />
              <Route path="/configurator" element={<ConfiguratorPricingList />} />
              <Route path="/configurator/:name" element={<ConfiguratorPricingDetail />} />

              {/* Purchases */}
              <Route path="/purchases/orders" element={<PurchaseOrderList />} />
              <Route path="/purchases/orders/new" element={<PurchaseOrderEditor />} />
              <Route path="/purchases/orders/:id/edit" element={<PurchaseOrderEditor />} />
              <Route path="/purchases/orders/:name" element={<PurchaseOrderDetail />} />
              <Route path="/purchases/grn" element={<GRNList />} />
              <Route path="/purchases/grn/:name" element={<GRNDetail />} />
              {/* GRN */}
              <Route path="/purchases/grn/new" element={<GRNEditor />} />
              <Route path="/purchases/grn/:id/edit" element={<GRNEditor />} />
              <Route path="/purchasing/items-to-order" element={<ItemsToOrder />} />
              <Route path="/purchases/procurement-dispatch" element={<ProcurementDispatch />} />
              <Route path="/purchases/reorder-suggestions" element={<AutoPRScreen />} />
              <Route path="/purchases/cfg-tracker" element={<CfgOrderTracker />} />
              <Route path="/purchases/freetext-reviews" element={<FreeTextReviews />} />
              <Route path="/purchases/supplier-performance" element={<SupplierPerformance />} />

              {/* Fulfillment */}
              <Route path="/sales/fulfillment-queue" element={<SalesOrderQueue />} />
              <Route path="/sales/orders/:soName/fulfillment" element={<FulfillmentReview />} />

              {/* Warehouse */}
              <Route path="/warehouse/stock-balances" element={<StockBalances />} />
              <Route path="/warehouse/stock-ledger" element={<StockLedger />} />
              <Route path="/warehouse/delivery-prep" element={<DeliveryPrep />} />
              <Route path="/warehouse/pickup" element={<DeliveryPickupScreen />} />
              <Route path="/warehouse/picking" element={<StockPullPlanning />} />
              <Route path="/warehouse/adjustments" element={<StockAdjustmentList />} />
              <Route path="/warehouse/adjustments/new" element={<StockAdjustmentEditor />} />
              <Route path="/warehouse/adjustments/:id" element={<StockAdjustmentEditor />} />
              <Route path="/warehouse/transfers" element={<StockTransferList />} />
              <Route path="/warehouse/transfers/new" element={<StockTransferEditor />} />
              <Route path="/warehouse/transfers/:id" element={<StockTransferEditor />} />

              {/* Customers */}
              <Route path="/customers/registrations" element={<RegistrationList />} />
              <Route path="/customers/registrations/:id" element={<RegistrationDetail />} />
              <Route path="/customers/vouchers" element={<VoucherList />} />
              <Route path="/customers/vouchers/approvals" element={<VoucherApprovals />} />
              <Route path="/customers/vouchers/new" element={<VoucherEditor />} />
              <Route path="/customers/vouchers/:id/print" element={<VoucherPrint />} />
              <Route path="/customers/vouchers/:id" element={<VoucherEditor />} />
              <Route path="/vouchers/redeem" element={<VoucherPayment />} />
              <Route path="/customers/reports" element={<CustomerReportList />} />
              <Route path="/customers/reports/new" element={<CustomerReportEditor />} />
              <Route path="/customers/reports/:id" element={<CustomerReportEditor />} />

              {/* Service */}
              <Route path="/service/job-cards"          element={<JobCardList />} />
              <Route path="/service/job-cards/new"      element={<JobCardEditor />} />
              <Route path="/service/job-cards/:id/edit" element={<JobCardEditor />} />
              <Route path="/service/job-cards/:id"      element={<JobCardDetail />} />
              <Route path="/service/providers"          element={<ServiceProviderList />} />
              <Route path="/service/providers/new"      element={<ServiceProviderProfile />} />
              <Route path="/service/providers/:id"      element={<ServiceProviderProfile />} />
              <Route path="/service/warranties"         element={<WarrantyList />} />
              <Route path="/service/warranties/new"     element={<WarrantyEditor />} />
              <Route path="/service/warranties/:id"     element={<WarrantyEditor />} />

              {/* Projects */}
              <Route path="/projects"           element={<ProjectList />} />
              <Route path="/projects/new"       element={<ProjectEditor />} />
              <Route path="/projects/:id/edit"  element={<ProjectEditor />} />
              <Route path="/projects/:id"       element={<ProjectDetail />} />

              {/* Operations */}
              <Route path="/operations/calendar"              element={<OperationsCalendar />} />
              <Route path="/operations/appointments"          element={<AppointmentList />} />
              <Route path="/operations/appointments/new"      element={<AppointmentEditor />} />
              <Route path="/operations/appointments/:id"      element={<AppointmentEditor />} />
              <Route path="/operations/appointments/:id/edit" element={<AppointmentEditor />} />
              <Route path="/operations/leave"                 element={<LeaveRequestList />} />
              <Route path="/operations/leave/new"             element={<LeaveRequestEditor />} />
              <Route path="/operations/leave/:id"             element={<LeaveRequestEditor />} />
              <Route path="/operations/leave/:id/edit"        element={<LeaveRequestEditor />} />
              <Route path="/operations/sms-log"               element={<SmsLog />} />

              {/* Admin */}
              <Route path="/admin/users"                   element={<UserList />} />
              <Route path="/admin/users/:id"               element={<UserDetail />} />
              <Route path="/admin/audit-log"               element={<AuditLog />} />
              <Route path="/admin/permissions"             element={<PermissionsViewer />} />
              <Route path="/admin/backup-restore"          element={<BackupRestore />} />
              <Route path="/admin/data-reset"              element={<DataReset />} />
              <Route path="/admin/pricing-calculators"     element={<PriceCalculatorAdmin />} />
              <Route path="/admin/price-lists"             element={<PriceListAdmin />} />
              <Route path="/admin/price-lists/new"         element={<PriceListEditor />} />
              <Route path="/admin/price-lists/:id"         element={<PriceListEditor />} />

              {/* Tools */}
              <Route path="/tools/tiles-calculator" element={<TilesCalculatorPage />} />

              {/* Supervisor */}
              <Route path="/supervisor/price-overrides" element={<SupervisorOverridePage />} />

              {/* Auth */}
              <Route path="/auth/change-password" element={<ChangePassword />} />

              {/* Finance */}
              <Route path="/finance/aged" element={<AgedReceivables />} />
              <Route path="/finance/bills" element={<BillList />} />
              <Route path="/finance/bills/new" element={<BillEditor />} />
              <Route path="/finance/bills/:id/edit" element={<BillEditor />} />
              <Route path="/finance/bills/:id" element={<BillDetail />} />
              <Route path="/finance/ap-due" element={<APDueScreen />} />
              <Route path="/finance/collections" element={<DailyCollections />} />
              <Route path="/finance/handover" element={<CashHandover />} />
              <Route path="/finance/journals" element={<JournalEntryList />} />
              <Route path="/finance/bank-reconciliation" element={<BankReconciliation />} />
              <Route path="/finance/reports" element={<FinancialReports />} />
              <Route path="/finance/vat-return" element={<VatReturn />} />
              <Route path="/sales/receipts" element={<PaymentEntryList />} />
              <Route path="/sales/receipts/new" element={<PaymentEntryCreate />} />
              <Route path="/sales/receipts/:name" element={<PaymentEntryCreate />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </PermissionsProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

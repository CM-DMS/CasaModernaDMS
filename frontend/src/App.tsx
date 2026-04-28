import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { Layout } from './components/layout/Layout'
import { LoginPage } from './screens/auth/LoginPage'
import { Dashboard } from './screens/dashboard/Dashboard'
import { ProductList } from './screens/products/ProductList'
import { ProductProfile } from './screens/products/ProductProfile'
import { SupplierList } from './screens/suppliers/SupplierList'
import { SupplierProfile } from './screens/suppliers/SupplierProfile'
import { ConfiguratorPricingList } from './screens/configurator/ConfiguratorPricingList'
import { ConfiguratorPricingDetail } from './screens/configurator/ConfiguratorPricingDetail'
import { CustomerList } from './screens/customers/CustomerList'
import { CustomerProfile } from './screens/customers/CustomerProfile'
import { QuotationList } from './screens/sales/QuotationList'
import { QuotationDetail } from './screens/sales/QuotationDetail'
import { SalesOrderList } from './screens/sales/SalesOrderList'
import { SalesOrderDetail } from './screens/sales/SalesOrderDetail'
import { SalesInvoiceList } from './screens/sales/SalesInvoiceList'
import { SalesInvoiceDetail } from './screens/sales/SalesInvoiceDetail'
import { DeliveryNoteList } from './screens/sales/DeliveryNoteList'
import { DeliveryNoteDetail } from './screens/sales/DeliveryNoteDetail'
import { PurchaseOrderList } from './screens/purchases/PurchaseOrderList'
import { PurchaseOrderDetail } from './screens/purchases/PurchaseOrderDetail'
import { GRNList } from './screens/purchases/GRNList'
import { GRNDetail } from './screens/purchases/GRNDetail'
import { StockBalances } from './screens/warehouse/StockBalances'
import { StockLedger } from './screens/warehouse/StockLedger'
import { AgedReceivables } from './screens/finance/AgedReceivables'
import { PaymentEntryList } from './screens/finance/PaymentEntryList'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />

              {/* Customers */}
              <Route path="/customers" element={<CustomerList />} />
              <Route path="/customers/:name" element={<CustomerProfile />} />

              {/* Sales */}
              <Route path="/sales/quotations" element={<QuotationList />} />
              <Route path="/sales/quotations/:name" element={<QuotationDetail />} />
              <Route path="/sales/orders" element={<SalesOrderList />} />
              <Route path="/sales/orders/:name" element={<SalesOrderDetail />} />
              <Route path="/sales/invoices" element={<SalesInvoiceList />} />
              <Route path="/sales/invoices/:name" element={<SalesInvoiceDetail />} />
              <Route path="/sales/delivery-notes" element={<DeliveryNoteList />} />
              <Route path="/sales/delivery-notes/:name" element={<DeliveryNoteDetail />} />

              {/* Catalogue */}
              <Route path="/products" element={<ProductList />} />
              <Route path="/products/:itemCode" element={<ProductProfile />} />
              <Route path="/suppliers" element={<SupplierList />} />
              <Route path="/suppliers/:name" element={<SupplierProfile />} />
              <Route path="/configurator" element={<ConfiguratorPricingList />} />
              <Route path="/configurator/:name" element={<ConfiguratorPricingDetail />} />

              {/* Purchases */}
              <Route path="/purchases/orders" element={<PurchaseOrderList />} />
              <Route path="/purchases/orders/:name" element={<PurchaseOrderDetail />} />
              <Route path="/purchases/grn" element={<GRNList />} />
              <Route path="/purchases/grn/:name" element={<GRNDetail />} />

              {/* Warehouse */}
              <Route path="/warehouse/stock-balances" element={<StockBalances />} />
              <Route path="/warehouse/stock-ledger" element={<StockLedger />} />

              {/* Finance */}
              <Route path="/finance/aged" element={<AgedReceivables />} />
              <Route path="/sales/receipts" element={<PaymentEntryList />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

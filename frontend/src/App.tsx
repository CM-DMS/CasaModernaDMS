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
              <Route path="/products" element={<ProductList />} />
              <Route path="/products/:itemCode" element={<ProductProfile />} />
              <Route path="/suppliers" element={<SupplierList />} />
              <Route path="/suppliers/:name" element={<SupplierProfile />} />
              <Route path="/configurator" element={<ConfiguratorPricingList />} />
              <Route path="/configurator/:name" element={<ConfiguratorPricingDetail />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

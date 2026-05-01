/**
 * ProductProfile — 4-tab product detail screen (V3).
 *
 * Tabs:
 *   General         — always
 *   Suppliers & Pricing — canPurchasing || canSeePricing || canAdmin
 *   Stock           — canStock || canAdmin
 *   Transactions    — canSales || canPurchasing || canAdmin
 */
import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePermissions } from '../../auth/PermissionsProvider'
import { PageHeader, BackLink } from '../../components/shared/ui'
import { productsApi } from '../../api/products'
import type { CMProductDoc } from '../../api/products'
import { ProductGeneralTab } from './ProductGeneralTab'
import { ProductSuppliersPricingTab } from './ProductSuppliersPricingTab'
import { ProductStockTab } from './ProductStockTab'
import { ProductTransactionsTab } from './ProductTransactionsTab'

type Tab = 'general' | 'pricing' | 'stock' | 'transactions'

interface TabDef {
  id: Tab
  label: string
}

export function ProductProfile() {
  const { itemCode } = useParams<{ itemCode: string }>()
  const navigate = useNavigate()
  const { can } = usePermissions()

  const canPurchasing = can('canPurchasing') || can('canAdmin')
  const canSeePricing = can('canSeePricing') || can('canAdmin')
  const canStock = can('canStock') || can('canAdmin')
  const canSales = can('canSales') || can('canAdmin')
  const canAdmin = can('canAdmin')

  const [item, setItem] = useState<CMProductDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('general')

  const tabs: TabDef[] = [
    { id: 'general', label: 'General' },
    ...(canPurchasing || canSeePricing || canAdmin
      ? [{ id: 'pricing' as Tab, label: 'Suppliers & Pricing' }]
      : []),
    ...(canStock || canAdmin ? [{ id: 'stock' as Tab, label: 'Stock' }] : []),
    ...(canSales || canPurchasing || canAdmin
      ? [{ id: 'transactions' as Tab, label: 'Transactions' }]
      : []),
  ]

  const loadItem = useCallback(
    (code: string) => {
      setLoading(true)
      setError('')
      productsApi
        .get(code)
        .then((d) => setItem(d))
        .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load product'))
        .finally(() => setLoading(false))
    },
    [],
  )

  useEffect(() => {
    if (itemCode) loadItem(decodeURIComponent(itemCode))
  }, [itemCode, loadItem])

  const onRefresh = useCallback(() => {
    if (itemCode) loadItem(decodeURIComponent(itemCode))
  }, [itemCode, loadItem])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 rounded-full border-4 border-cm-green border-t-transparent animate-spin" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    )
  }
  if (!item) return null

  const displayName = item.cm_given_name || item.item_name || item.name

  return (
    <div className="space-y-4">
      <BackLink label="Products" onClick={() => navigate('/products')} />

      <PageHeader
        title={displayName}
        subtitle={item.name !== displayName ? item.name : undefined}
      />

      {/* Tab bar */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={[
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab.id
                ? 'border-cm-green text-cm-green'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className="space-y-5">
        {activeTab === 'general' && (
          <ProductGeneralTab item={item} onRefresh={onRefresh} />
        )}
        {activeTab === 'pricing' && (canPurchasing || canSeePricing || canAdmin) && (
          <ProductSuppliersPricingTab item={item} onRefresh={onRefresh} />
        )}
        {activeTab === 'stock' && (canStock || canAdmin) && (
          <ProductStockTab item={item} />
        )}
        {activeTab === 'transactions' && (canSales || canPurchasing || canAdmin) && (
          <ProductTransactionsTab item={item} />
        )}
      </div>
    </div>
  )
}


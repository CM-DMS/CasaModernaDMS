import { useParams, useNavigate } from 'react-router-dom'
import { SalesDocEditor } from './SalesDocEditor'

export function SalesInvoiceEditor() {
  const { name } = useParams<{ name?: string }>()
  const navigate = useNavigate()

  return (
    <SalesDocEditor
      doctype="Sales Invoice"
      name={name}
      onSaved={(doc) => {
        if (doc.name && name !== doc.name) {
          navigate(`/sales/invoices/${encodeURIComponent(doc.name as string)}/edit`, {
            replace: true,
          })
        }
      }}
      onNavigate={(path) => navigate(path)}
    />
  )
}

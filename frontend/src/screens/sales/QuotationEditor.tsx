/**
 * QuotationEditor — route wrapper for SalesDocEditor with Quotation doctype.
 * Routes: /sales/quotations/new  and  /sales/quotations/:name/edit
 */
import { useParams, useNavigate } from 'react-router-dom'
import { SalesDocEditor } from './SalesDocEditor'

export function QuotationEditor() {
  const { name } = useParams<{ name?: string }>()
  const navigate = useNavigate()

  return (
    <SalesDocEditor
      doctype="Quotation"
      name={name}
      onSaved={(doc) => {
        if (doc.name && name !== doc.name) {
          navigate(`/sales/quotations/${encodeURIComponent(doc.name as string)}/edit`, {
            replace: true,
          })
        }
      }}
      onNavigate={(path) => navigate(path)}
    />
  )
}

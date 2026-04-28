import { useParams, useNavigate } from 'react-router-dom'
import { SalesDocEditor } from './SalesDocEditor'

export function SalesOrderEditor() {
  const { name } = useParams<{ name?: string }>()
  const navigate = useNavigate()

  return (
    <SalesDocEditor
      doctype="Sales Order"
      name={name}
      onSaved={(doc) => {
        if (doc.name && name !== doc.name) {
          navigate(`/sales/orders/${encodeURIComponent(doc.name as string)}/edit`, {
            replace: true,
          })
        }
      }}
      onNavigate={(path) => navigate(path)}
    />
  )
}

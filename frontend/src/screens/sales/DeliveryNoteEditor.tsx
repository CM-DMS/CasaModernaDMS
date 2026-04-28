import { useParams, useNavigate } from 'react-router-dom'
import { SalesDocEditor } from './SalesDocEditor'

export function DeliveryNoteEditor() {
  const { name } = useParams<{ name?: string }>()
  const navigate = useNavigate()

  return (
    <SalesDocEditor
      doctype="Delivery Note"
      name={name}
      onSaved={(doc) => {
        if (doc.name && name !== doc.name) {
          navigate(`/sales/delivery-notes/${encodeURIComponent(doc.name as string)}/edit`, {
            replace: true,
          })
        }
      }}
      onNavigate={(path) => navigate(path)}
    />
  )
}

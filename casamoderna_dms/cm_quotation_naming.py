import re
import frappe

_QT_RE = re.compile(r'^QT\s+0*(\d+)$')
_PI_RE = re.compile(r'^PI\s+0*(\d+)$')


def sync_quotation_counter(doc, method=None):
	"""Keep all QT / PI naming counters in sync with the actual document number.

	Fires on after_insert so every successfully saved quotation self-corrects
	both the Document Naming Rule counter and the legacy tabSeries entry.
	Using GREATEST() means the update is a no-op if counters are already ahead,
	and self-heals if they were manually set too low (e.g. after a DB restore or
	manual reset that leaves the counter behind the highest existing document).
	"""
	m = _QT_RE.match(doc.name or '')
	if m:
		n = int(m.group(1))
		frappe.db.sql(
			"UPDATE `tabDocument Naming Rule` SET counter = GREATEST(counter, %s)"
			" WHERE document_type='Quotation' AND prefix='QT '",
			(n,),
		)
		frappe.db.sql(
			"UPDATE `tabSeries` SET current = GREATEST(current, %s) WHERE name='QT '",
			(n,),
		)
		return

	m = _PI_RE.match(doc.name or '')
	if m:
		n = int(m.group(1))
		frappe.db.sql(
			"UPDATE `tabDocument Naming Rule` SET counter = GREATEST(counter, %s)"
			" WHERE document_type='Quotation' AND prefix='PI '",
			(n,),
		)
		frappe.db.sql(
			"UPDATE `tabSeries` SET current = GREATEST(current, %s) WHERE name='PI '",
			(n,),
		)

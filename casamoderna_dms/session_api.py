"""
session_api.py — Whitelisted endpoints for the CasaModerna DMS frontend session.

Why this exists
---------------
The Frappe REST endpoint GET /api/resource/User/{name} does NOT reliably
serialise the 'roles' child table in all Frappe v15 builds — it can return
null or [] even for a fully-authenticated session.  The React frontend
therefore calls get_my_roles() instead of trying to parse the User document.

frappe.get_roles() is the authoritative Python API: it reads directly from
the session cache / DB and always returns the correct list for the current
logged-in user.

CSRF note
---------
This endpoint is intentionally GET-only so it requires no CSRF token.  The
response includes the session's csrf_token so the React SPA can store it in
window.csrf_token before issuing any POST requests.  This is the same pattern
Frappe uses in its own /app page (www/app.py).

If a user has previously visited the Frappe Desk (/app), Frappe will have
already generated a CSRF token for that session.  The React app must read this
token from here (not from window.csrf_token, which the Desk's boot script sets)
and use it for subsequent POSTs — otherwise every POST returns HTTP 400.
"""

import frappe
import frappe.sessions


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_my_roles():
    """Return session info for the currently logged-in user.

    Returns a dict with:
        user       — current Frappe session user (email, or 'Guest')
        roles      — list of role name strings
        csrf_token — current session CSRF token (may be None for Guest)

    allow_guest=True so the React SPA can call this on the login page to
    pre-seed window.csrf_token before the first POST.  This prevents HTTP 400
    (CSRFTokenError) that would otherwise occur when the browser is reopened
    with a persistent Frappe session (sid cookie) but an expired user_id cookie.

    This endpoint is GET-only so it requires no CSRF token itself.
    """
    if frappe.session.user == "Guest":
        return {"user": "Guest", "roles": [], "csrf_token": None, "sales_person": None}

    full_name = frappe.db.get_value("User", frappe.session.user, "full_name") or ""
    sales_person = frappe.db.get_value(
        "Sales Person", {"sales_person_name": full_name}, "name"
    ) if full_name else None

    # CSRF token retrieval can fail if session_obj isn't initialised yet
    # (e.g. first request after login).  Never let this crash role resolution.
    try:
        csrf_token = frappe.sessions.get_csrf_token()
    except Exception:
        csrf_token = frappe.local.session.data.get("csrf_token")

    return {
        "user": frappe.session.user,
        "roles": frappe.get_roles(frappe.session.user),
        "csrf_token": csrf_token,
        "sales_person": sales_person or None,
    }


@frappe.whitelist(methods=["GET"])
def get_dashboard_kpis():
	"""Return all dashboard KPI metrics for the DMS React frontend.

	Uses direct SQL throughout so it works for users without full DocPerm
	on all doctypes (e.g. warehouse-only users).
	"""
	if frappe.session.user == "Guest":
		frappe.throw("Authentication required", frappe.PermissionError)

	today = frappe.utils.today()

	# ── Financial KPIs ────────────────────────────────────────────────────

	# Orders placed today (submitted SOs)
	today_orders = frappe.db.sql(
		"""
		SELECT COUNT(*) AS cnt, IFNULL(SUM(grand_total), 0) AS total
		FROM `tabSales Order`
		WHERE docstatus = 1
		  AND DATE(transaction_date) = %s
		""",
		(today,),
		as_dict=True,
	)[0]

	# Invoiced today — Sales Invoice + POS Invoice (submitted, not returns)
	today_invoiced = frappe.db.sql(
		"""
		SELECT IFNULL(SUM(grand_total), 0) AS total
		FROM (
		    SELECT grand_total FROM `tabSales Invoice`
		    WHERE docstatus = 1 AND is_return = 0
		      AND DATE(posting_date) = %s
		    UNION ALL
		    SELECT grand_total FROM `tabPOS Invoice`
		    WHERE docstatus = 1 AND is_return = 0
		      AND DATE(posting_date) = %s
		) t
		""",
		(today, today),
		as_list=True,
	)[0][0]

	# Receivables — outstanding balance on submitted, unpaid Sales Invoices
	receivables = frappe.db.sql(
		"""
		SELECT IFNULL(SUM(outstanding_amount), 0)
		FROM `tabSales Invoice`
		WHERE docstatus = 1
		  AND outstanding_amount > 0
		""",
		as_list=True,
	)[0][0]

	# Pending SO value — grand_total of open SOs
	pending_so_value = frappe.db.sql(
		"""
		SELECT IFNULL(SUM(grand_total), 0)
		FROM `tabSales Order`
		WHERE docstatus = 1
		  AND status IN ('To Deliver and Bill', 'To Deliver', 'To Bill')
		""",
		as_list=True,
	)[0][0]

	# ── Operational KPIs ──────────────────────────────────────────────────

	open_so_count = frappe.db.sql(
		"""
		SELECT COUNT(*)
		FROM `tabSales Order`
		WHERE docstatus = 1
		  AND status IN ('To Deliver and Bill', 'To Deliver', 'To Bill')
		""",
		as_list=True,
	)[0][0]

	open_po_count = frappe.db.sql(
		"""
		SELECT COUNT(*)
		FROM `tabPurchase Order`
		WHERE docstatus = 1
		  AND status IN ('To Receive and Bill', 'To Receive', 'To Bill')
		""",
		as_list=True,
	)[0][0]

	low_stock_count = frappe.db.sql(
		"""
		SELECT COUNT(*)
		FROM `tabBin` b
		INNER JOIN `tabItem Reorder` ir
		    ON ir.parent = b.item_code
		   AND ir.parenttype = 'Item'
		   AND ir.warehouse = b.warehouse
		WHERE IFNULL(ir.warehouse_reorder_level, 0) > 0
		  AND IFNULL(b.actual_qty, 0) <= IFNULL(ir.warehouse_reorder_level, 0)
		""",
		as_list=True,
	)[0][0]

	draft_doc_count = frappe.db.sql(
		"""
		SELECT
		    (SELECT COUNT(*) FROM `tabQuotation`      WHERE docstatus = 0)
		  + (SELECT COUNT(*) FROM `tabSales Order`    WHERE docstatus = 0)
		  + (SELECT COUNT(*) FROM `tabPurchase Order` WHERE docstatus = 0)
		""",
		as_list=True,
	)[0][0]

	# ── Sales trend — last 7 days ──────────────────────────────────────────

	sales_trend = frappe.db.sql(
		"""
		SELECT DATE(transaction_date) AS day, IFNULL(SUM(grand_total), 0) AS total
		FROM `tabSales Order`
		WHERE docstatus = 1
		  AND transaction_date >= DATE_SUB(%s, INTERVAL 6 DAY)
		GROUP BY DATE(transaction_date)
		ORDER BY day ASC
		""",
		(today,),
		as_dict=True,
	)
	# Convert date objects to strings for JSON serialisation
	for row in sales_trend:
		if hasattr(row.get("day"), "strftime"):
			row["day"] = row["day"].strftime("%Y-%m-%d")

	# ── Top 5 products (all time, by submitted SO value) ──────────────────

	top_products = frappe.db.sql(
		"""
		SELECT
		    soi.item_code,
		    soi.item_name,
		    IFNULL(SUM(soi.amount), 0) AS total_sales
		FROM `tabSales Order Item` soi
		INNER JOIN `tabSales Order` so ON so.name = soi.parent
		WHERE so.docstatus = 1
		  AND soi.item_code NOT LIKE 'CM-%'
		GROUP BY soi.item_code, soi.item_name
		ORDER BY total_sales DESC
		LIMIT 5
		""",
		as_dict=True,
	)

	# ── Recent Sales Orders ────────────────────────────────────────────────

	recent_orders = frappe.db.sql(
		"""
		SELECT name, customer_name, transaction_date, grand_total, status
		FROM `tabSales Order`
		WHERE docstatus != 2
		ORDER BY modified DESC
		LIMIT 10
		""",
		as_dict=True,
	)

	# ── MTD / YTD sales ───────────────────────────────────────────────────

	month_start = frappe.utils.get_first_day(today).strftime("%Y-%m-%d")
	year_start  = today[:4] + "-01-01"

	# First day of last month / last day of last month
	last_month_end   = frappe.utils.add_days(month_start, -1)
	last_month_start = frappe.utils.get_first_day(last_month_end).strftime("%Y-%m-%d")

	mtd_orders = frappe.db.sql(
		"""
		SELECT COUNT(*) AS cnt, IFNULL(SUM(grand_total), 0) AS total
		FROM `tabSales Order`
		WHERE docstatus = 1
		  AND transaction_date >= %s AND transaction_date <= %s
		""",
		(month_start, today),
		as_dict=True,
	)[0]

	mtd_invoiced = frappe.db.sql(
		"""
		SELECT IFNULL(SUM(grand_total), 0) AS total
		FROM `tabSales Invoice`
		WHERE docstatus = 1 AND is_return = 0
		  AND posting_date >= %s AND posting_date <= %s
		""",
		(month_start, today),
		as_list=True,
	)[0][0]

	mtd_quotations = frappe.db.sql(
		"""
		SELECT COUNT(*) AS cnt, IFNULL(SUM(grand_total), 0) AS total
		FROM `tabQuotation`
		WHERE docstatus IN (0, 1)
		  AND transaction_date >= %s AND transaction_date <= %s
		""",
		(month_start, today),
		as_dict=True,
	)[0]

	ytd_order_value = frappe.db.sql(
		"""
		SELECT IFNULL(SUM(grand_total), 0)
		FROM `tabSales Order`
		WHERE docstatus = 1
		  AND transaction_date >= %s AND transaction_date <= %s
		""",
		(year_start, today),
		as_list=True,
	)[0][0]

	last_month_value = frappe.db.sql(
		"""
		SELECT IFNULL(SUM(grand_total), 0)
		FROM `tabSales Order`
		WHERE docstatus = 1
		  AND transaction_date >= %s AND transaction_date <= %s
		""",
		(last_month_start, last_month_end),
		as_list=True,
	)[0][0]

	# ── Top customers (MTD by order value) ────────────────────────────────

	top_customers = frappe.db.sql(
		"""
		SELECT
		    customer_name,
		    COUNT(*) AS order_count,
		    IFNULL(SUM(grand_total), 0) AS total_value
		FROM `tabSales Order`
		WHERE docstatus = 1
		  AND transaction_date >= %s AND transaction_date <= %s
		GROUP BY customer_name
		ORDER BY total_value DESC
		LIMIT 5
		""",
		(month_start, today),
		as_dict=True,
	)

	# ── Latest CM Products ─────────────────────────────────────────────────

	latest_products = frappe.db.sql(
		"""
		SELECT name, item_name, cm_given_name, cm_supplier_name, creation
		FROM `tabCM Product`
		WHERE disabled = 0
		ORDER BY creation DESC
		LIMIT 6
		""",
		as_dict=True,
	)
	for row in latest_products:
		if hasattr(row.get("creation"), "strftime"):
			row["creation"] = row["creation"].strftime("%Y-%m-%d %H:%M:%S")

	return {
		# Today
		"today_order_count":    int(today_orders.cnt or 0),
		"today_order_value":    float(today_orders.total or 0),
		"today_invoiced":       float(today_invoiced or 0),
		"receivables":          float(receivables or 0),
		"pending_so_value":     float(pending_so_value or 0),
		# MTD / YTD
		"mtd_order_count":      int(mtd_orders.cnt or 0),
		"mtd_order_value":      float(mtd_orders.total or 0),
		"mtd_invoiced":         float(mtd_invoiced or 0),
		"mtd_quotation_count":  int(mtd_quotations.cnt or 0),
		"mtd_quotation_value":  float(mtd_quotations.total or 0),
		"ytd_order_value":      float(ytd_order_value or 0),
		"last_month_value":     float(last_month_value or 0),
		# Operational
		"open_so_count":        int(open_so_count or 0),
		"open_po_count":        int(open_po_count or 0),
		"low_stock_count":      int(low_stock_count or 0),
		"draft_doc_count":      int(draft_doc_count or 0),
		# Charts
		"sales_trend":          sales_trend,
		"top_products":         top_products,
		"top_customers":        top_customers,
		# Tables
		"recent_orders":        recent_orders,
		"latest_products":      latest_products,
	}


@frappe.whitelist(methods=["GET"])
def get_sales_persons():
    """Return all non-group Sales Person records.

    Used by the React Typeahead dropdown so that sales users can pick a
    salesperson without needing REST read-permission on the Sales Person
    doctype (which Custom DocPerm may restrict).
    """
    if frappe.session.user == "Guest":
        frappe.throw("Authentication required", frappe.PermissionError)

    rows = frappe.db.sql(
        """
        SELECT name, sales_person_name
        FROM `tabSales Person`
        WHERE is_group = 0 AND enabled = 1
        ORDER BY sales_person_name
        """,
        as_dict=True,
    )
    return rows


@frappe.whitelist(methods=["GET"])
def get_my_notifications():
        """Return the last 30 Notification Log entries for the current user."""
        user = frappe.session.user
        rows = frappe.db.sql(
                """
                SELECT name, subject, document_type, document_name,
                       `read`, creation, from_user
                FROM `tabNotification Log`
                WHERE for_user = %s
                ORDER BY creation DESC
                LIMIT 30
                """,
                (user,),
                as_dict=True,
        )
        unread = sum(1 for r in rows if not r.get("read"))
        return {"notifications": rows, "unread_count": unread}


@frappe.whitelist()
def mark_notifications_read(names):
        """Mark a list of notification names as read (only if they belong to current user)."""
        import json
        if isinstance(names, str):
                names = json.loads(names)
        if not names:
                return {"ok": True}
        user = frappe.session.user
        frappe.db.sql(
                "UPDATE `tabNotification Log` SET `read`=1 WHERE name IN %s AND for_user=%s",
                (tuple(names), user),
        )
        frappe.db.commit()
        return {"ok": True}


@frappe.whitelist()
def mark_all_notifications_read():
        """Mark all unread notifications as read for the current user."""
        user = frappe.session.user
        frappe.db.sql(
                "UPDATE `tabNotification Log` SET `read`=1 WHERE for_user=%s AND `read`=0",
                (user,),
        )
        frappe.db.commit()
        return {"ok": True}


@frappe.whitelist()
def delete_read_notifications():
        """Permanently delete all read notifications for the current user."""
        user = frappe.session.user
        frappe.db.sql(
                "DELETE FROM `tabNotification Log` WHERE for_user=%s AND `read`=1",
                (user,),
        )
        frappe.db.commit()
        return {"ok": True}

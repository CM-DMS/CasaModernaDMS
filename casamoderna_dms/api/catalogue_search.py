"""catalogue_search.py

Unified Product Catalogue Search API — returns matching CM Products with
free-stock data joined from tabBin in a single SQL query, supporting
full-text search, multi-group filtering, supplier filtering, sorting and
pagination.

Used by the DMS React frontend ProductList catalogue page.
"""

from __future__ import annotations

import json
from datetime import date, timedelta

import frappe


# ── Field list returned for every CM Product row ─────────────────────────────

_CM_PRODUCT_COLS = [
    "name", "item_name", "cm_given_name", "item_group", "stock_uom",
    "disabled", "cm_hidden_from_catalogue", "cm_product_type",
    "cm_supplier_name", "cm_supplier_code",
    "cm_rrp_ex_vat", "cm_rrp_inc_vat",
    "cm_offer_tier1_inc_vat", "cm_offer_tier1_ex_vat", "cm_offer_tier1_discount_pct",
    "is_stock_item", "creation",
]

# Allowed ORDER BY columns — validated against this set to prevent injection.
_SORT_COLS = {
    "item_name":              "i.item_name",
    "name":                   "i.name",
    "cm_given_name":          "COALESCE(NULLIF(i.cm_given_name,''), i.item_name)",
    "cm_offer_tier1_inc_vat": "i.cm_offer_tier1_inc_vat",
    "free_stock":             "free_stock",
    "creation":               "i.creation",
}


def _parse_list_param(value) -> list:
    """Accept either a Python list or a JSON-encoded string; always return a list."""
    if value is None:
        return []
    if isinstance(value, list):
        return [v for v in value if v]
    if isinstance(value, str):
        if not value.strip():
            return []
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else [parsed]
        except (json.JSONDecodeError, ValueError):
            return [value]
    return []


@frappe.whitelist()
def search_catalogue(
    q="",
    item_groups=None,
    supplier_code="",
    supplier_name="",
    disabled=None,
    show_hidden=0,
    product_type="Primary",
    sort_by="cm_given_name",
    sort_dir="asc",
    limit=50,
    offset=0,
    in_stock_only=0,
    min_price=None,
    max_price=None,
    barcode="",
):
    """Search the CM Product catalogue.

    Returns ``{"rows": [...], "total": N}`` where ``rows`` includes all
    ``_CM_PRODUCT_COLS`` fields plus a computed ``free_stock`` column
    (actual_qty - reserved_qty, summed across all warehouses).

    Parameters
    ----------
    q            : free-text search (item_name, cm_given_name, name, cm_supplier_name, cm_supplier_code)
    item_groups  : JSON array of item_group names to include (empty = all)
    supplier_code: exact cm_supplier_code filter
    supplier_name: partial cm_supplier_name filter (LIKE %value%)
    disabled     : 0/1 to include only active/inactive; omit for active-only
    show_hidden  : include cm_hidden_from_catalogue=1 items
    product_type : 'Primary', 'All', or any cm_product_type value
    sort_by      : one of name | item_name | cm_given_name | cm_offer_tier1_inc_vat | free_stock | creation
    sort_dir     : 'asc' or 'desc'
    limit        : page size (max 200)
    offset       : pagination offset
    in_stock_only: 1 = only items with free_stock > 0
    min_price    : minimum cm_offer_tier1_inc_vat (inclusive)
    max_price    : maximum cm_offer_tier1_inc_vat (inclusive)
    barcode      : ignored (CM Product has no barcode child table — kept for API compat)
    """

    # ── Validate / coerce params ──────────────────────────────────────────────
    groups = _parse_list_param(item_groups)
    sort_col = _SORT_COLS.get(str(sort_by), "COALESCE(NULLIF(i.cm_given_name,''), i.item_name)")
    sort_direction = "ASC" if str(sort_dir).lower() == "asc" else "DESC"
    limit = max(1, min(int(limit), 200))
    offset = max(0, int(offset))

    # ── Build WHERE conditions ────────────────────────────────────────────────
    conditions = []
    values: list = []

    # Catalogue visibility
    if not int(show_hidden or 0):
        conditions.append("i.cm_hidden_from_catalogue = 0")

    # Active / disabled
    if disabled is not None:
        conditions.append("i.disabled = %s")
        values.append(1 if int(disabled) else 0)
    else:
        conditions.append("i.disabled = 0")

    # Product type
    if product_type and str(product_type) != "All":
        conditions.append("i.cm_product_type = %s")
        values.append(str(product_type))

    # Item group(s)
    if groups:
        placeholders = ", ".join(["%s"] * len(groups))
        conditions.append(f"i.item_group IN ({placeholders})")
        values.extend(groups)

    # Exact supplier code filter
    if supplier_code:
        conditions.append("i.cm_supplier_code = %s")
        values.append(str(supplier_code))

    # Partial supplier name filter
    if supplier_name:
        conditions.append("i.cm_supplier_name LIKE %s")
        values.append(f"%{supplier_name}%")

    # Free-text search (OR across searchable fields)
    if q:
        like = f"%{q}%"
        conditions.append(
            "(i.item_name LIKE %s OR i.cm_given_name LIKE %s"
            " OR i.name LIKE %s OR i.cm_supplier_name LIKE %s"
            " OR i.cm_supplier_code LIKE %s)"
        )
        values.extend([like, like, like, like, like])

    # Price range filter on Tier 1 offer price (inc VAT)
    if min_price is not None and str(min_price).strip() not in ("", "None"):
        conditions.append("i.cm_offer_tier1_inc_vat >= %s")
        values.append(float(min_price))
    if max_price is not None and str(max_price).strip() not in ("", "None"):
        conditions.append("i.cm_offer_tier1_inc_vat <= %s")
        values.append(float(max_price))

    # In-stock filter — uses the subquery alias resolved at WHERE time
    if int(in_stock_only or 0):
        conditions.append("IFNULL(b.free_stock, 0) > 0")

    where = "WHERE " + " AND ".join(conditions) if conditions else ""

    # ── Build SQL fragments ───────────────────────────────────────────────────
    item_cols_sql = ", ".join(f"i.`{c}`" for c in _CM_PRODUCT_COLS)

    stock_subquery = """(
        SELECT item_code,
               SUM(IFNULL(actual_qty, 0) - IFNULL(reserved_qty, 0)) AS free_stock
        FROM `tabBin`
        GROUP BY item_code
    )"""

    count_sql = f"""
        SELECT COUNT(*) AS total
        FROM `tabCM Product` i
        LEFT JOIN {stock_subquery} b ON b.item_code = i.name
        {where}
    """

    data_sql = f"""
        SELECT
            {item_cols_sql},
            IFNULL(b.free_stock, 0) AS free_stock
        FROM `tabCM Product` i
        LEFT JOIN {stock_subquery} b ON b.item_code = i.name
        {where}
        ORDER BY {sort_col} {sort_direction}
        LIMIT %s OFFSET %s
    """

    # ── Execute ───────────────────────────────────────────────────────────────
    count_result = frappe.db.sql(count_sql, values, as_dict=True)
    total = int(count_result[0].total) if count_result else 0

    rows = frappe.db.sql(data_sql, values + [limit, offset], as_dict=True)

    for row in rows:
        row["free_stock"] = float(row.get("free_stock") or 0)
        if row.get("creation"):
            row["creation"] = str(row["creation"])

    return {"rows": rows, "total": total}


@frappe.whitelist()
def get_catalogue_groups():
    """Return distinct item_group values present in the active CM Product catalogue."""
    rows = frappe.db.sql(
        """
        SELECT DISTINCT item_group
        FROM `tabCM Product`
        WHERE disabled = 0
          AND item_group IS NOT NULL
          AND item_group != ''
        ORDER BY item_group
        """,
        as_dict=True,
    )
    return [r.item_group for r in rows]


@frappe.whitelist()
def get_catalogue_suppliers():
    """Return distinct supplier names present in the active CM Product catalogue."""
    rows = frappe.db.sql(
        """
        SELECT DISTINCT cm_supplier_name
        FROM `tabCM Product`
        WHERE disabled = 0
          AND cm_supplier_name IS NOT NULL
          AND cm_supplier_name != ''
        ORDER BY cm_supplier_name
        """,
        as_dict=True,
    )
    return [r.cm_supplier_name for r in rows]


@frappe.whitelist()
def get_catalogue_brands():
    """Deprecated — proxies to get_catalogue_suppliers() for backward compat."""
    return get_catalogue_suppliers()


@frappe.whitelist()
def get_item_sales_velocity(item_code):
    """Return sold qty for an item over 30 / 90 / 365 days (from submitted Sales Orders)."""
    today = date.today()
    cutoffs = {
        "qty_30d":  today - timedelta(days=30),
        "qty_90d":  today - timedelta(days=90),
        "qty_365d": today - timedelta(days=365),
    }
    result = {}
    for key, cutoff in cutoffs.items():
        rows = frappe.db.sql(
            """
            SELECT IFNULL(SUM(soi.qty), 0) AS total_qty
            FROM `tabSales Order Item` soi
            JOIN `tabSales Order` so ON so.name = soi.parent
            WHERE soi.item_code = %s
              AND so.docstatus = 1
              AND so.transaction_date >= %s
              AND so.status NOT IN ('Cancelled')
            """,
            (item_code, str(cutoff)),
            as_dict=True,
        )
        result[key] = float(rows[0].total_qty) if rows else 0.0
    return result


@frappe.whitelist()
def get_item_price_history(name):
    """Return a list of pricing-field changes from the Version audit log for a CM Product."""
    PRICING_FIELDS = {
        "cm_rrp_ex_vat", "cm_rrp_inc_vat",
        "cm_offer_tier1_inc_vat", "cm_offer_tier2_inc_vat", "cm_offer_tier3_inc_vat",
        "cm_purchase_price_ex_vat", "cm_cost_ex_vat_calculated",
    }
    versions = frappe.db.sql(
        """
        SELECT creation, owner, data
        FROM `tabVersion`
        WHERE ref_doctype = 'CM Product' AND docname = %s
        ORDER BY creation DESC
        LIMIT 30
        """,
        name,
        as_dict=True,
    )
    result = []
    for v in versions:
        try:
            data = json.loads(v.data or "{}")
            changed = data.get("changed", [])
            pricing = [
                {"field": c[0], "old": c[1], "new": c[2]}
                for c in changed
                if isinstance(c, (list, tuple)) and len(c) >= 3 and c[0] in PRICING_FIELDS
            ]
            if pricing:
                result.append({
                    "date": str(v.creation),
                    "by": v.owner,
                    "changes": pricing,
                })
        except (json.JSONDecodeError, TypeError, AttributeError):
            pass
    return result

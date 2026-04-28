from __future__ import annotations

"""slice038b — Backfill description from cm_description_line_1/2 for existing Items.

Idempotent: only writes when computed description differs from stored description,
and only when at least one DMS line is non-blank.
"""

import frappe


def execute():
    rows = frappe.get_all(
        "Item",
        fields=["name", "description", "cm_description_line_1", "cm_description_line_2"],
        limit_page_length=0,
    )

    updated = 0
    for row in rows:
        line1 = (row.cm_description_line_1 or "").strip()
        line2 = (row.cm_description_line_2 or "").strip()
        parts = [p for p in [line1, line2] if p]
        if not parts:
            continue
        computed = "\n".join(parts)
        if (row.description or "").strip() == computed:
            continue
        frappe.db.set_value("Item", row.name, "description", computed, update_modified=False)
        updated += 1

    if updated:
        frappe.db.commit()

    frappe.logger().info(f"slice038b: backfilled description for {updated} items")

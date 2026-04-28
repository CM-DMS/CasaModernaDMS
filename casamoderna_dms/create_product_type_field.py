"""Temporary migration: create cm_product_type custom field on Item.
Run once via:
  cd /home/frappe/frappe/casamoderna-bench
  bench --site two.casamodernadms.eu execute casamoderna_dms.create_product_type_field.run
"""
import frappe


def run():
    if frappe.db.exists("Custom Field", "Item-cm_product_type"):
        print("cm_product_type already exists — skipping create.")
    else:
        frappe.get_doc({
            "doctype": "Custom Field",
            "dt": "Item",
            "module": "Stock",
            "fieldname": "cm_product_type",
            "label": "Product Type",
            "fieldtype": "Select",
            "options": "Primary\nSecondary",
            "default": "Primary",
            "insert_after": "cm_hidden_from_catalogue",
            "in_list_view": 0,
            "in_standard_filter": 1,
            "name": "Item-cm_product_type",
        }).insert(ignore_permissions=True)
        print("Created cm_product_type custom field.")

    # Data migration: items with an image → Primary, items without → Secondary
    updated_primary = frappe.db.sql("""
        UPDATE `tabItem`
        SET cm_product_type = 'Primary'
        WHERE (cm_product_type IS NULL OR cm_product_type = '')
          AND image IS NOT NULL AND image != ''
    """)
    updated_secondary = frappe.db.sql("""
        UPDATE `tabItem`
        SET cm_product_type = 'Secondary'
        WHERE (cm_product_type IS NULL OR cm_product_type = '')
          AND (image IS NULL OR image = '')
    """)
    frappe.db.commit()

    counts = frappe.db.sql("""
        SELECT cm_product_type, COUNT(*) as cnt
        FROM `tabItem`
        GROUP BY cm_product_type
    """, as_dict=True)
    print("Item type distribution after migration:")
    for row in counts:
        print(f"  {row.cm_product_type or '(blank)'}: {row.cnt}")

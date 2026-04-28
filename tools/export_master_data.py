"""Export master data from V2 production DB to JSON files.

Connects READ-ONLY to V2 MariaDB (port 3306) and exports the following
layers in dependency order:

  1. item_groups.json        — Item Group tree
  2. territories.json        — Territory records
  3. warehouses.json         — Warehouse records
  4. cm_localities.json      — CM Locality records
  5. suppliers.json          — Supplier + Address + Contact
  6. price_lists.json        — Price List records
  7. items.json              — Item records (with all custom fields)
  8. item_prices.json        — Item Price records
  9. item_suppliers.json     — Item Supplier child rows (supplier ladders)
 10. configurator_pricing.json — CM Configurator Pricing + Matrix + Tiers
 11. users.json              — User + Sales Person + Role assignments

NOT exported (transaction data):
  Customer, Quotation, Sales Order, Sales Invoice, Delivery Note,
  Payment Entry, Purchase Order, Purchase Receipt, Stock Entry,
  CM Voucher, CM Warranty, CM Customer Appointment, etc.

Usage (read-only, safe to run multiple times):
    python3 /home/frappe/CasaModernaDMS/tools/export_master_data.py \
        --out-dir /home/frappe/cm_export

The V2 DB credentials are hard-coded below (they are read-only usage
of a local DB; not a security risk in this context).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pymysql
import pymysql.cursors

# ---------------------------------------------------------------------------
# V2 DB connection (READ-ONLY usage)
# ---------------------------------------------------------------------------
V2_DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 3306,
    "user": "root",
    "password": "Kalkara1031",  # noqa: S106  — local DB, not public
    "db": "_f34a597d4aee1881",
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def connect() -> pymysql.Connection:
    cfg = V2_DB_CONFIG.copy()
    db = cfg.pop("db")
    conn = pymysql.connect(**cfg, database=db)
    return conn


def write_json(out_dir: Path, filename: str, records: list[dict]) -> None:
    path = out_dir / filename
    path.write_text(json.dumps(records, indent=2, default=str), encoding="utf-8")
    print(f"  Wrote {len(records):>5} records → {path.name}")


def fetch_all(conn: pymysql.Connection, sql: str, params: tuple = ()) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


# ---------------------------------------------------------------------------
# Layer exporters
# ---------------------------------------------------------------------------

def export_item_groups(conn: pymysql.Connection, out_dir: Path) -> None:
    print("Exporting Item Groups …")
    rows = fetch_all(conn, """
        SELECT name, item_group_name, parent_item_group, is_group,
               lft, rgt, modified
        FROM `tabItem Group`
        ORDER BY lft
    """)
    write_json(out_dir, "item_groups.json", rows)


def export_territories(conn: pymysql.Connection, out_dir: Path) -> None:
    print("Exporting Territories …")
    rows = fetch_all(conn, """
        SELECT name, territory_name, parent_territory, is_group
        FROM `tabTerritory`
        ORDER BY lft
    """)
    write_json(out_dir, "territories.json", rows)


def export_warehouses(conn: pymysql.Connection, out_dir: Path) -> None:
    print("Exporting Warehouses …")
    rows = fetch_all(conn, """
        SELECT name, warehouse_name, warehouse_type, parent_warehouse,
               is_group, company, disabled
        FROM `tabWarehouse`
        ORDER BY lft
    """)
    write_json(out_dir, "warehouses.json", rows)


def export_localities(conn: pymysql.Connection, out_dir: Path) -> None:
    print("Exporting CM Localities …")
    rows = fetch_all(conn, """
        SELECT name, locality_name, postcode, district, country
        FROM `tabCM Locality`
        ORDER BY locality_name
    """)
    write_json(out_dir, "cm_localities.json", rows)


def export_suppliers(conn: pymysql.Connection, out_dir: Path) -> None:
    print("Exporting Suppliers …")
    suppliers = fetch_all(conn, """
        SELECT s.name, s.supplier_name, s.supplier_group, s.supplier_type,
               s.country, s.website, s.disabled, s.is_internal_supplier,
               s.default_currency, s.modified,
               s.cm_supplier_code, s.cm_payment_terms, s.cm_notes
        FROM `tabSupplier` s
        ORDER BY s.name
    """)

    # Fetch linked addresses
    addresses = fetch_all(conn, """
        SELECT dl.link_name AS supplier, a.name, a.address_title,
               a.address_type, a.address_line1, a.address_line2,
               a.city, a.county, a.state, a.pincode, a.country,
               a.phone, a.fax, a.email_id, a.is_primary_address,
               a.is_shipping_address
        FROM `tabDynamic Link` dl
        JOIN `tabAddress` a ON a.name = dl.parent
        WHERE dl.link_doctype = 'Supplier'
        ORDER BY dl.link_name
    """)

    # Fetch linked contacts
    contacts = fetch_all(conn, """
        SELECT dl.link_name AS supplier, c.name, c.first_name, c.last_name,
               c.email_id, c.phone, c.mobile_no, c.is_primary_contact
        FROM `tabDynamic Link` dl
        JOIN `tabContact` c ON c.name = dl.parent
        WHERE dl.link_doctype = 'Supplier'
        ORDER BY dl.link_name
    """)

    # Group addresses and contacts by supplier
    addr_map: dict[str, list] = {}
    for a in addresses:
        addr_map.setdefault(a["supplier"], []).append(a)

    contact_map: dict[str, list] = {}
    for c in contacts:
        contact_map.setdefault(c["supplier"], []).append(c)

    for s in suppliers:
        s["addresses"] = addr_map.get(s["name"], [])
        s["contacts"] = contact_map.get(s["name"], [])

    write_json(out_dir, "suppliers.json", suppliers)


def export_price_lists(conn: pymysql.Connection, out_dir: Path) -> None:
    print("Exporting Price Lists …")
    rows = fetch_all(conn, """
        SELECT name, price_list_name, currency, buying, selling, enabled,
               cm_configurator_type
        FROM `tabPrice List`
        ORDER BY name
    """)
    write_json(out_dir, "price_lists.json", rows)


def export_items(conn: pymysql.Connection, out_dir: Path) -> None:
    print("Exporting Items (this may take a moment) …")
    # Fetch all item fields including all known custom fields
    rows = fetch_all(conn, """
        SELECT
            i.name, i.item_code, i.item_name, i.item_group,
            i.description, i.stock_uom, i.sales_uom, i.purchase_uom,
            i.has_variants, i.variant_of, i.disabled, i.is_sales_item,
            i.is_purchase_item, i.is_stock_item, i.include_item_in_manufacturing,
            i.opening_stock, i.standard_rate, i.valuation_rate,
            i.weight_per_unit, i.weight_uom,
            i.country_of_origin, i.customs_tariff_number,
            i.last_purchase_rate, i.modified,
            -- Custom fields (cm_* prefix)
            i.cm_product_code, i.cm_product_type, i.cm_display_name,
            i.cm_catalogue_description, i.cm_is_tile,
            i.cm_box_sqm, i.cm_sqm_per_box, i.cm_pieces_per_box,
            i.cm_tile_finish, i.cm_tile_size, i.cm_tile_collection,
            i.cm_lead_time_days, i.cm_min_order_qty,
            i.cm_configurator_type, i.cm_configurator_model,
            i.cm_rrp_inc_vat, i.cm_selling_price_inc_vat,
            i.cm_cost_price, i.cm_supplier_code,
            i.cm_is_freetext_placeholder, i.cm_freetext_category,
            i.cm_warranty_months, i.cm_notes
        FROM `tabItem` i
        WHERE i.disabled = 0 OR i.disabled IS NULL
        ORDER BY i.item_code
    """)
    write_json(out_dir, "items.json", rows)


def export_item_prices(conn: pymysql.Connection, out_dir: Path) -> None:
    print("Exporting Item Prices …")
    rows = fetch_all(conn, """
        SELECT name, item_code, price_list, buying, selling,
               price_list_rate, currency, uom, valid_from, valid_upto,
               modified
        FROM `tabItem Price`
        ORDER BY item_code, price_list
    """)
    write_json(out_dir, "item_prices.json", rows)


def export_item_suppliers(conn: pymysql.Connection, out_dir: Path) -> None:
    print("Exporting Item Supplier rows (supplier ladders) …")
    rows = fetch_all(conn, """
        SELECT isp.parent AS item_code, isp.name, isp.supplier,
               isp.supplier_part_no, isp.lead_time_days,
               isp.min_order_qty, isp.idx,
               -- custom supplier pricing fields
               isp.cm_cost_price_a, isp.cm_cost_price_b, isp.cm_cost_price_c,
               isp.cm_tier_a_min_qty, isp.cm_tier_b_min_qty, isp.cm_tier_c_min_qty,
               isp.cm_supplier_sku, isp.cm_notes
        FROM `tabItem Supplier` isp
        ORDER BY isp.parent, isp.idx
    """)
    write_json(out_dir, "item_suppliers.json", rows)


def export_configurator_pricing(conn: pymysql.Connection, out_dir: Path) -> None:
    print("Exporting CM Configurator Pricing …")
    configs = fetch_all(conn, """
        SELECT name, price_list, configurator_type, enabled, modified
        FROM `tabCM Configurator Pricing`
        ORDER BY name
    """)

    # Fetch matrix rows
    matrices = fetch_all(conn, """
        SELECT parent, name, tier_name, role_name, option_code,
               offer_price_inc_vat, rrp_inc_vat, cost_price, idx
        FROM `tabCM Configurator Pricing Matrix`
        ORDER BY parent, idx
    """)

    matrix_map: dict[str, list] = {}
    for m in matrices:
        matrix_map.setdefault(m["parent"], []).append(m)

    for c in configs:
        c["matrix"] = matrix_map.get(c["name"], [])

    write_json(out_dir, "configurator_pricing.json", configs)


def export_users(conn: pymysql.Connection, out_dir: Path) -> None:
    print("Exporting Users …")
    users = fetch_all(conn, """
        SELECT name, email, first_name, last_name, full_name,
               username, mobile_no, phone, language, time_zone,
               enabled, role_profile_name, user_type, modified
        FROM `tabUser`
        WHERE user_type = 'System User'
          AND name NOT IN ('Administrator', 'Guest')
          AND enabled = 1
        ORDER BY name
    """)

    # Fetch user roles
    user_roles = fetch_all(conn, """
        SELECT parent, role
        FROM `tabHas Role`
        WHERE parenttype = 'User'
          AND parent NOT IN ('Administrator', 'Guest')
        ORDER BY parent
    """)

    # Fetch Sales Person records
    salespeople = fetch_all(conn, """
        SELECT name, sales_person_name, parent_sales_person,
               enabled, employee
        FROM `tabSales Person`
        WHERE is_group = 0
        ORDER BY name
    """)

    role_map: dict[str, list] = {}
    for r in user_roles:
        role_map.setdefault(r["parent"], []).append(r["role"])

    for u in users:
        u["roles"] = role_map.get(u["name"], [])

    write_json(out_dir, "users.json", users)
    write_json(out_dir, "salespeople.json", salespeople)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

EXPORTERS = [
    ("item_groups", export_item_groups),
    ("territories", export_territories),
    ("warehouses", export_warehouses),
    ("cm_localities", export_localities),
    ("suppliers", export_suppliers),
    ("price_lists", export_price_lists),
    ("items", export_items),
    ("item_prices", export_item_prices),
    ("item_suppliers", export_item_suppliers),
    ("configurator_pricing", export_configurator_pricing),
    ("users", export_users),
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Export V2 master data to JSON")
    parser.add_argument(
        "--out-dir",
        default="/home/frappe/cm_export",
        help="Directory to write JSON files into",
    )
    parser.add_argument(
        "--only",
        default="",
        help="Comma-separated list of layer names to export (default: all)",
    )
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    only = {s.strip() for s in args.only.split(",") if s.strip()} if args.only else set()

    print(f"Connecting to V2 DB at 127.0.0.1:3306 …")
    try:
        conn = connect()
    except Exception as e:
        print(f"ERROR: Cannot connect to V2 DB: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Connected. Writing to {out_dir}/\n")

    for name, exporter in EXPORTERS:
        if only and name not in only:
            continue
        try:
            exporter(conn, out_dir)
        except Exception as e:
            print(f"  ERROR exporting {name}: {e}", file=sys.stderr)

    conn.close()
    print(f"\nExport complete. Files in {out_dir}/")


if __name__ == "__main__":
    main()

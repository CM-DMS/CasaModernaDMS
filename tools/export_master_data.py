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
    "user": "_f34a597d4aee1881",
    "password": "qAMPzjsZULDoyX7r",  # noqa: S106  — local DB, not public
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
        SELECT name, locality_name, sort_order
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
               s.cm_abbr, s.cm_bank_name, s.cm_bank_iban, s.cm_bank_bic,
               s.cm_bank_address, s.cm_internal_notes, s.cm_supplier_ref_3
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
            i.cm_product_code, i.cm_product_type, i.cm_display_name,
            i.cm_description_line_1, i.cm_description_line_2,
            i.cm_given_name, i.cm_family_code, i.cm_finish_code,
            i.cm_role_name, i.cm_variant, i.cm_dimensions,
            i.cm_tiles_per_box, i.cm_sqm_per_box,
            i.cm_supplier_name, i.cm_supplier_code, i.cm_supplier_item_code,
            i.cm_supplier_item_name, i.cm_supplier_currency, i.cm_supplier_pack,
            i.cm_supplier_variant_description,
            i.cm_rrp_ex_vat, i.cm_rrp_inc_vat, i.cm_discounted_inc_vat,
            i.cm_final_offer_inc_vat, i.cm_final_offer_ex_vat,
            i.cm_purchase_price_ex_vat, i.cm_cost_ex_vat_calculated,
            i.cm_vat_rate_percent, i.cm_discount_percent,
            i.cm_discount_1_percent, i.cm_discount_2_percent, i.cm_discount_3_percent,
            i.cm_increase_before_percent, i.cm_increase_after_percent,
            i.cm_discount_target_percent, i.cm_shipping_percent,
            i.cm_shipping_fee, i.cm_handling_fee, i.cm_other_landed,
            i.cm_landed_additions_total_ex_vat, i.cm_rounding_delta,
            i.cm_pricing_rounding_mode, i.cm_pricing_mode_ui,
            i.cm_margin_percent, i.cm_markup_percent, i.cm_profit_ex_vat,
            i.cm_weight_factor, i.cm_delivery_installation_fee,
            i.cm_hidden_from_catalogue
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
               isp.supplier_part_no, isp.idx
        FROM `tabItem Supplier` isp
        ORDER BY isp.parent, isp.idx
    """)
    write_json(out_dir, "item_suppliers.json", rows)


def export_configurator_pricing(conn: pymysql.Connection, out_dir: Path) -> None:
    print("Exporting CM Configurator Pricing …")
    configs = fetch_all(conn, """
        SELECT name, price_list, configurator_type, valid_from, valid_to, modified
        FROM `tabCM Configurator Pricing`
        ORDER BY name
    """)

    # Fetch matrix rows
    matrices = fetch_all(conn, """
        SELECT parent, name, tier_name, role_name, mode, option_code,
               handle_variant, finish_code, seat_count,
               extra_key_1, extra_key_2,
               offer_price_inc_vat, rrp_inc_vat, cost_price, notes, idx
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

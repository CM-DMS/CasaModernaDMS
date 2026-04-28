"""
seed_lorella_collection_configurator_process.py
================================================
One-time Frappe migration patch for the Lorella Collection (Lorena & Lety range).

Pass 1 — Create or update Item master records for all ~980 GDOM codes:
  - cm_supplier_name, cm_supplier_item_code, cm_supplier_item_name, supplier_items child row
  - Items that do not yet exist are created (item_group = "Night Collection")

Pass 2 — Create or gap-fill "Lorella Supplier Price List" buying prices.

The patch is idempotent: re-running it will update stale prices and metadata
without duplicating records.
"""
from __future__ import annotations

import frappe

ARES_SUPPLIER = "Ares Mobilificio S.r.l."
PRICE_LIST_NAME = "Lorella Supplier Price List"

# =============================================================================
# CODE SYSTEM
# =============================================================================
# Lorena & Lety uses a positional code system:
#
#   1 LE OD A 001 CM
#   |  |  |  |  |   +-- Front finish code
#   |  |  |  |  +------ Product number
#   |  |  |  +--------- Product category
#   |  |  +------------ Structure finish: OD/PG/NS/NG
#   |  +--------------- Collection: LE = Lorena & Lety
#   +------------------ Individual item prefix
#
# Structure codes:  OD=Olmo Delicato, PG=Frassino Ghiaccio,
#                   NS=Noce Stelvio,  NG=Noce Tortora Stelvio
#
# Front finish codes:
#   Tier 1 (CM/BS/CH): Cemento, Basalt, Cachemire
#   Tier 2 (PS/BM/AM/SP/SC): Pietra Scura, Metallo Bronzo, Metallo Argento,
#                              Sofia Perla, Sofia Cuoio
#   Tier 3 (BL): Bianco Lucido
#
# Handle rule: handle colour ALWAYS matches structure colour
#
# Listino: GDOM AGG. NOVEMBRE 2024

# =============================================================================
# HELPER MAPS
# =============================================================================

STRUCT_NAMES = {
    'OD': 'Olmo Delicato',
    'PG': 'Frassino Ghiaccio',
    'NS': 'Noce Stelvio',
    'NG': 'Noce Tortora Stelvio',
}

FRONT_NAMES = {
    'CM': 'Cemento',
    'BS': 'Basalt',
    'CH': 'Cachemire',
    'PS': 'Pietra Scura',
    'BM': 'Metallo Bronzo',
    'AM': 'Metallo Argento',
    'SP': 'Sofia Perla',
    'SC': 'Sofia Cuoio',
    'BL': 'Bianco Lucido',
}

STRUCT_PREFIX = {
    'OD': 'LEOD',
    'PG': 'LEPG',
    'NS': 'LENS',
    'NG': 'LENG',
}

STRUCTS = ['OD', 'PG', 'NS', 'NG']
TIER1 = ['CM', 'BS', 'CH']
TIER2 = ['PS', 'BM', 'AM', 'SP', 'SC']
TIER3 = ['BL']
ALL_FRONTS = TIER1 + TIER2 + TIER3


# =============================================================================
# GDOM_ITALIAN — Italian descriptions for all ~980 items
# =============================================================================

def _build_italian():
    italian = {}

    # ------------------------------------------------------------------
    # ARMADI BATTENTI
    # ------------------------------------------------------------------
    armadi_configs = {
        'A001': ('Armadio 1 Anta', 'L.45 P.55 H.238'),
        'A003': ('Armadio 2 Ante', 'L.88 P.55 H.238'),
        'A005': ('Armadio 3 Ante', 'L.130 P.55 H.238'),
        'A006': ('Armadio 4 Ante', 'L.173 P.55 H.238'),
        'A025': ('Armadio 4 Ante con 2 Specchi', 'L.173 P.55 H.238'),
        'A007': ('Armadio 5 Ante', 'L.216 P.55 H.238'),
        'A008': ('Armadio 6 Ante', 'L.258 P.55 H.238'),
        'A009': ('Armadio 6 Ante con 2 Specchi', 'L.258 P.55 H.238'),
    }
    for num, (desc, dims) in armadi_configs.items():
        for s in STRUCTS:
            sn = STRUCT_NAMES[s]
            prefix = f'1{STRUCT_PREFIX[s]}{num}'
            for f in ALL_FRONTS:
                fn = FRONT_NAMES[f]
                code = f'{prefix}{f}'
                italian[code] = (
                    f'{desc} Lorena & Lety - Struttura {sn} / Frontale {fn} '
                    f'- Maniglia {sn} - {dims} - cerniere ammortizzate'
                )

    # ------------------------------------------------------------------
    # CABINE — 1 Anta e 2 Ante con frontali
    # ------------------------------------------------------------------
    cabine_configs = {
        'E003': ('Cabina 1 Anta', 'L.85 P.85 H.238'),
        'E001': ('Cabina 2 Ante', 'L.115 P.115 H.238'),
    }
    for num, (desc, dims) in cabine_configs.items():
        for s in STRUCTS:
            sn = STRUCT_NAMES[s]
            prefix = f'1{STRUCT_PREFIX[s]}{num}'
            for f in ALL_FRONTS:
                fn = FRONT_NAMES[f]
                code = f'{prefix}{f}'
                italian[code] = (
                    f'{desc} Lorena & Lety - Struttura {sn} / Frontale {fn} '
                    f'- Maniglia {sn} - {dims} - cerniere ammortizzate'
                )

    # ------------------------------------------------------------------
    # CABINE SPECCHIO — struttura only
    # ------------------------------------------------------------------
    for s in STRUCTS:
        sn = STRUCT_NAMES[s]
        italian[f'1{STRUCT_PREFIX[s]}E006'] = (
            f'Cabina 1/A Specchio Lorena & Lety - Struttura {sn} '
            f'- L.85 P.85 H.238 - cerniere ammortizzate'
        )
        italian[f'1{STRUCT_PREFIX[s]}E002'] = (
            f'Cabina 2/A Specchi Lorena & Lety - Struttura {sn} '
            f'- L.115 P.115 H.238 - cerniere ammortizzate'
        )

    # ------------------------------------------------------------------
    # TERMINALI SX e DX
    # ------------------------------------------------------------------
    for s in STRUCTS:
        sn = STRUCT_NAMES[s]
        prefix = f'1{STRUCT_PREFIX[s]}C001'
        for f in ALL_FRONTS:
            fn = FRONT_NAMES[f]
            italian[f'{prefix}{f}S'] = (
                f'Terminale SX Lorena & Lety - Struttura {sn} / Frontale {fn} '
                f'- L.39,9 P.55 H.238 - cerniere ammortizzate'
            )
            italian[f'{prefix}{f}D'] = (
                f'Terminale DX Lorena & Lety - Struttura {sn} / Frontale {fn} '
                f'- L.39,9 P.55 H.238 - cerniere ammortizzate'
            )

    # ------------------------------------------------------------------
    # TERMINALE SCARPIERA CON SPECCHIO
    # ------------------------------------------------------------------
    for s in STRUCTS:
        sn = STRUCT_NAMES[s]
        prefix = f'1{STRUCT_PREFIX[s]}C008'
        for f in ALL_FRONTS:
            fn = FRONT_NAMES[f]
            italian[f'{prefix}{f}'] = (
                f'N\u00b01 Terminale Scarpiera con Specchio + 2 Mensole Esterne Lorena & Lety '
                f'- Struttura {sn} / Frontale {fn} '
                f'- L.53 P.38,8 H.238 - Reversibile - cerniere ammortizzate'
            )

    # ------------------------------------------------------------------
    # PONTI BATTENTI
    # ------------------------------------------------------------------
    ponti_configs = {
        'K101': ('Ponte 6 Ante', 'L.327 P.55 H.238'),
        'W101': ('Ponte 7 Ante', 'L.370 P.55 H.238'),
    }
    for num, (desc, dims) in ponti_configs.items():
        for s in STRUCTS:
            sn = STRUCT_NAMES[s]
            prefix = f'1{STRUCT_PREFIX[s]}{num}'
            for f in ALL_FRONTS:
                fn = FRONT_NAMES[f]
                italian[f'{prefix}{f}'] = (
                    f'{desc} Lorena & Lety - Struttura {sn} / Frontale {fn} '
                    f'- Maniglia {sn} - {dims} - cerniere ammortizzate'
                )

    # ------------------------------------------------------------------
    # VANO ARMADIO TV
    # ------------------------------------------------------------------
    for s in STRUCTS:
        sn = STRUCT_NAMES[s]
        prefix = f'1{STRUCT_PREFIX[s]}A073'
        for f in ALL_FRONTS:
            fn = FRONT_NAMES[f]
            italian[f'{prefix}{f}'] = (
                f'Vano Armadio TV 2 Ante e Cassetti Lorena & Lety '
                f'- Struttura {sn} / Frontale {fn} '
                f'- Maniglia {sn} - L.88 P.55 H.238 - cerniere ammortizzate'
            )

    # ------------------------------------------------------------------
    # MOBILE A GIORNO (struttura only)
    # ------------------------------------------------------------------
    struct_suffix = {'OD': 'OD', 'PG': 'PG', 'NS': 'NS', 'NG': 'NG'}
    for s in STRUCTS:
        sn = STRUCT_NAMES[s]
        code = f'1{STRUCT_PREFIX[s]}C003{struct_suffix[s]}'
        italian[code] = (
            f'Mobile a Giorno Lorena & Lety - Solo Finitura Struttura {sn} '
            f'- L.45 P.35 H.238'
        )

    # ------------------------------------------------------------------
    # GRIGLIA SOTTOPONTE
    # ------------------------------------------------------------------
    for s in STRUCTS:
        sn = STRUCT_NAMES[s]
        italian[f'1{STRUCT_PREFIX[s]}U005'] = (
            f'Griglia Sottoponte x Ponte Lorena & Lety '
            f'- Solo Finitura Struttura {sn} - L.238 P.26 H.141'
        )

    # ------------------------------------------------------------------
    # COLONNA C/RIPIANI x PONTE
    # ------------------------------------------------------------------
    for s in STRUCTS:
        sn = STRUCT_NAMES[s]
        italian[f'1{STRUCT_PREFIX[s]}U016'] = (
            f'N\u00b01 Colonna c/Ripiani x Ponte Lorena & Lety '
            f'- Solo Finitura Struttura {sn} - L.24 P.26 H.150 - Reversibile'
        )

    # ------------------------------------------------------------------
    # GRUPPI — maniglia standard
    # ------------------------------------------------------------------
    gruppi_std = {
        'L020': ('Comodino 2 Cassetti', 'L.51 P.39 H.43', 'Maniglia Standard'),
        'M020': ('Como\u0300 3 Cassetti', 'L.112 P.48 H.76', 'Maniglia Standard'),
        'N020': ('Settimino 6 Cassetti', 'L.51 P.39 H.120', 'Maniglia Standard'),
        'T010': ('Cassettiera 2 Cassetti con Ruote', 'L.51 P.39 H.49', 'Maniglia Standard'),
    }
    for num, (desc, dims, man) in gruppi_std.items():
        for s in STRUCTS:
            sn = STRUCT_NAMES[s]
            prefix = f'1{STRUCT_PREFIX[s]}{num}'
            for f in ALL_FRONTS:
                fn = FRONT_NAMES[f]
                italian[f'{prefix}{f}'] = (
                    f'{desc} Lorena & Lety - {man} - '
                    f'Struttura {sn} / Frontale {fn} - {dims}'
                )

    # ------------------------------------------------------------------
    # GRUPPI — maniglia laterale
    # ------------------------------------------------------------------
    gruppi_lat = {
        'M014': ('Comodino 2 Cassetti', 'L.51 P.39 H.43', 'Maniglia Laterale'),
        'M015': ('Como\u0300 3 Cassetti', 'L.112 P.48 H.76', 'Maniglia Laterale'),
        'M016': ('Settimino 6 Cassetti', 'L.51 P.39 H.120', 'Maniglia Laterale'),
        'T046': ('Cassettiera 2 Cassetti con Ruote', 'L.51 P.39 H.49', 'Maniglia Laterale'),
    }
    for num, (desc, dims, man) in gruppi_lat.items():
        for s in STRUCTS:
            sn = STRUCT_NAMES[s]
            prefix = f'1{STRUCT_PREFIX[s]}{num}'
            for f in ALL_FRONTS:
                fn = FRONT_NAMES[f]
                italian[f'{prefix}{f}'] = (
                    f'{desc} Lorena & Lety - {man} - '
                    f'Struttura {sn} / Frontale {fn} - {dims}'
                )

    # Settimino Multicolor special
    italian['1LEPGM016MC'] = (
        'Settimino 6 Cassetti Lorena & Lety - Maniglia Laterale - Multicolor '
        '- Struttura Frassino Ghiaccio / Cassetti: 1 Cachemire, 1 Basalt, 1 Cemento, '
        '1 Sofia Perla, 1 Metallo Argento, 1 Metallo Bronzo - L.51 P.39 H.120'
    )

    # ------------------------------------------------------------------
    # SCRIVANIA — struttura only
    # ------------------------------------------------------------------
    for s in STRUCTS:
        sn = STRUCT_NAMES[s]
        italian[f'1{STRUCT_PREFIX[s]}T001'] = (
            f'Scrivania Lorena & Lety - Solo Finitura Struttura {sn} '
            f'- L.120 P.60 H.76'
        )

    # ------------------------------------------------------------------
    # LETTI con PANNELLO FRONTALE con LED (Tier1+Tier2 only, no BL)
    # ------------------------------------------------------------------
    letti_led = {
        'S013': ('Letto da 160 c/Pannello Frontale con LED - con Contenitore', 'L.172 P.213 H.113'),
        'S014': ('Letto da 160 c/Pannello Frontale con LED - senza Contenitore', 'L.172 P.213 H.113'),
    }
    for num, (desc, dims) in letti_led.items():
        for s in STRUCTS:
            sn = STRUCT_NAMES[s]
            prefix = f'1{STRUCT_PREFIX[s]}{num}'
            for f in TIER1 + TIER2:
                fn = FRONT_NAMES[f]
                italian[f'{prefix}{f}'] = (
                    f'{desc} Lorena & Lety - Struttura {sn} / Frontale {fn} - {dims}'
                )

    # ------------------------------------------------------------------
    # LETTI STANDARD — struttura only
    # ------------------------------------------------------------------
    letti_std = {
        'R011': ('Letto da 120 con Contenitore', 'L.136 P.207 H.109'),
        'R012': ('Letto da 120 senza Contenitore', 'L.136 P.207 H.109'),
        'S011': ('Letto da 160 con Contenitore', 'L.176 P.207 H.109'),
        'S012': ('Letto da 160 senza Contenitore', 'L.176 P.207 H.109'),
    }
    for num, (desc, dims) in letti_std.items():
        for s in STRUCTS:
            sn = STRUCT_NAMES[s]
            italian[f'1{STRUCT_PREFIX[s]}{num}'] = (
                f'{desc} Lorena & Lety - Solo Finitura Struttura {sn} - {dims}'
            )

    # ------------------------------------------------------------------
    # PENSILI A GIORNO — struttura only
    # ------------------------------------------------------------------
    pensili = {
        'Z001': ('Pensile 1 Vano a Giorno', 'L.36 P.28 H.36'),
        'Z002': ('Pensile 2 Vani a Giorno', 'L.72 P.28 H.36'),
    }
    for num, (desc, dims) in pensili.items():
        for s in STRUCTS:
            sn = STRUCT_NAMES[s]
            italian[f'1{STRUCT_PREFIX[s]}{num}'] = (
                f'{desc} Lorena & Lety - Solo Finitura Struttura {sn} - {dims}'
            )

    # ------------------------------------------------------------------
    # SPECCHIERE
    # ------------------------------------------------------------------
    italian['1CNSPEGR003'] = 'Specchiera Sagomata con LED - Lorena & Lety'
    italian['1VRCI0506'] = 'Specchiera Rettangolare Lorena & Lety - L.60 H.90'
    italian['1BPBFP002'] = 'Specchio Interno Lorena & Lety - L.32 H.140'

    return italian


GDOM_ITALIAN = _build_italian()


# =============================================================================
# GDOM_PRICES — all ~980 items
# =============================================================================

def _build_prices():
    prices = {}

    def add(prefix_pattern, structs, t1, t2, t3, suffix=''):
        for s in structs:
            base = f'1{STRUCT_PREFIX[s]}{prefix_pattern}'
            for f in TIER1:
                prices[f'{base}{f}{suffix}'] = t1
            for f in TIER2:
                prices[f'{base}{f}{suffix}'] = t2
            if t3 is not None:
                prices[f'{base}BL{suffix}'] = t3

    def add_struct(num, structs, price):
        for s in structs:
            prices[f'1{STRUCT_PREFIX[s]}{num}'] = price

    # ARMADI BATTENTI
    add('A001', STRUCTS, 143, 150, 153)
    add('A003', STRUCTS, 183, 192, 200)
    add('A005', STRUCTS, 290, 304, 314)
    add('A006', STRUCTS, 329, 345, 363)
    add('A025', STRUCTS, 363, 383, 380)
    add('A007', STRUCTS, 414, 431, 468)
    add('A008', STRUCTS, 455, 474, 505)
    add('A009', STRUCTS, 462, 513, 494)

    # CABINE
    add('E003', STRUCTS, 262, 272, 275)
    add_struct('E006', STRUCTS, 262)   # mirror cabin struct only
    add('E001', STRUCTS, 315, 329, 333)
    add_struct('E002', STRUCTS, 315)   # 2A mirror struct only

    # TERMINALI SX/DX
    add('C001', STRUCTS, 168, 175, 175, suffix='S')
    add('C001', STRUCTS, 168, 175, 175, suffix='D')

    # SCARPIERA TERMINALE
    add('C008', STRUCTS, 154, 165, 176)

    # PONTI
    add('K101', STRUCTS, 502, 527, 537)
    add('W101', STRUCTS, 543, 584, 577)

    # VANO TV
    add('A073', STRUCTS, 229, 244, 269)

    # MOBILE A GIORNO
    prices['1LEODC003OD'] = 80
    prices['1LEPGC003PG'] = 80
    prices['1LENSC003NS'] = 80
    prices['1LENGC003NG'] = 80

    # GRIGLIA SOTTOPONTE
    add_struct('U005', STRUCTS, 109)

    # COLONNA
    add_struct('U016', STRUCTS, 51)

    # GRUPPI STANDARD
    add('L020', STRUCTS, 49, 52, 58)
    add('M020', STRUCTS, 133, 145, 142)
    add('N020', STRUCTS, 137, 146, 145)
    add('T010', STRUCTS, 59, 63, 67)

    # GRUPPI LATERALE
    add('M014', STRUCTS, 56, 60, 75)
    add('M015', STRUCTS, 160, 171, 191)
    add('M016', STRUCTS, 155, 166, 186)
    add('T046', STRUCTS, 66, 70, 85)
    prices['1LEPGM016MC'] = 186

    # SCRIVANIA
    add_struct('T001', STRUCTS, 63)

    # LETTI con LED (no BL)
    add('S013', STRUCTS, 369, 393, None)
    add('S014', STRUCTS, 238, 254, None)

    # LETTI STANDARD
    add_struct('R011', STRUCTS, 259)
    add_struct('R012', STRUCTS, 132)
    add_struct('S011', STRUCTS, 273)
    add_struct('S012', STRUCTS, 133)

    # PENSILI
    add_struct('Z001', STRUCTS, 38)
    add_struct('Z002', STRUCTS, 54)

    # SPECCHIERE
    prices['1CNSPEGR003'] = 85
    prices['1VRCI0506'] = 35
    prices['1BPBFP002'] = 40

    return prices


GDOM_PRICES = _build_prices()


# =============================================================================
# SHARED ACCESSORIES — already in ERPNext from Night Collection
# Listed for reference only; NOT re-imported here.
# =============================================================================

SHARED_ACCESSORIES = {
    '1CNACCTX001': 13.0,   # Ripiano da 45
    '1CNACCTX002': 18.0,   # Ripiano da 90
    '1CNACCTX003': 25.0,   # Ripiano Mod. Cabina 2/A
    '1CNACCTX015': 23.0,   # Ripiano Mod. Cabina 1/A
    '1SPTX2117':   67.0,   # Cassettiera Interna
    '1SPTX2120':   60.0,   # Porta Pantaloni
    '1SPTX2119':   72.0,   # Porta Cravatte
    '1SPTX2121':   59.0,   # Servetto Moka
    '1SPTX2125':   34.0,   # LED per Armadi
}


# =============================================================================
# EXECUTE
# =============================================================================

ITEM_GROUP = "Lorella Collection"

# Item-code guard for Pass 1: all 1LE… codes plus this one 1CN% Lorella specchiera
LORELLA_ALLOWED_PREFIXES = ("1LE",)
LORELLA_EXCEPTIONS = {"1CNSPEGR003"}

def _ensure_dependencies():
    """
    Create prerequisite records that must exist before Items can be inserted:
      - Item Group: "Lorella Collection" (sibling of Night Collection / Notte Collection)
      - Brand:      "Ares Mobilificio"
    """
    # Resolve the parent group — use whatever parent Night Collection uses;
    # fall back to None (top-level) if it doesn't exist on this site.
    if not frappe.db.exists("Item Group", ITEM_GROUP):
        night_parent = frappe.db.get_value("Item Group", "Night Collection", "parent_item_group") or None
        frappe.db.sql("""
            INSERT INTO `tabItem Group`
            (name, item_group_name, parent_item_group, is_group,
             modified, modified_by, owner, creation, docstatus, idx)
            VALUES
            (%(n)s, %(n)s, %(p)s, 1,
             NOW(), 'Administrator', 'Administrator', NOW(), 0, 0)
        """, {"n": ITEM_GROUP, "p": night_parent})
        print(f"Created Item Group: {ITEM_GROUP}")

    if not frappe.db.exists("Brand", "Ares Mobilificio"):
        frappe.db.sql("""
            INSERT INTO `tabBrand`
            (name, brand, modified, modified_by, owner, creation, docstatus, idx)
            VALUES
            ('Ares Mobilificio', 'Ares Mobilificio',
             NOW(), 'Administrator', 'Administrator', NOW(), 0, 0)
        """)
        print("Created Brand: Ares Mobilificio")

    frappe.db.commit()


def execute():
    # ------------------------------------------------------------------
    # Ensure prerequisite records exist
    # ------------------------------------------------------------------
    _ensure_dependencies()

    # ------------------------------------------------------------------
    # Ensure the Lorella Supplier Price List exists
    # ------------------------------------------------------------------
    if not frappe.db.exists("Price List", PRICE_LIST_NAME):
        frappe.get_doc({
            "doctype": "Price List",
            "price_list_name": PRICE_LIST_NAME,
            "currency": "EUR",
            "buying": 1,
            "selling": 0,
            "cm_configurator_type": "Lorella Collection",
        }).insert(ignore_permissions=True)
        frappe.db.commit()
        print(f"Created Price List: {PRICE_LIST_NAME}")
    else:
        # Ensure the cm_configurator_type is set (in case it was created manually)
        frappe.db.set_value(
            "Price List", PRICE_LIST_NAME, "cm_configurator_type", "Lorella Collection"
        )

    # ------------------------------------------------------------------
    # Counters
    # ------------------------------------------------------------------
    meta_inserted = 0
    meta_updated = 0
    meta_skipped = 0
    price_created = 0
    price_updated = 0
    price_ok = 0
    corrections = []
    errors = []

    # Count 1LE% items before the run (to prove Night Collection is not touched)
    lorella_before = frappe.db.sql(
        "SELECT COUNT(*) FROM tabItem WHERE item_code LIKE '1LE%'"
    )[0][0]
    night_before = frappe.db.sql(
        "SELECT COUNT(*) FROM tabItem WHERE item_code LIKE '1N%'"
    )[0][0]

    total_items = len([c for c in GDOM_ITALIAN
                        if c.startswith(LORELLA_ALLOWED_PREFIXES) or c in LORELLA_EXCEPTIONS])
    print(f"\nLorella Collection — Ares GDOM Listino Import")
    print(f"Items to process (1LE% codes): {total_items}")
    print(f"Price list: {PRICE_LIST_NAME}")
    print(f"Lorella items before run : {lorella_before}")
    print(f"Night items before run   : {night_before}")

    # ------------------------------------------------------------------
    # Pass 1 — Create or update Item master records
    # Only processes codes starting with 1LE — 1CN% and other shared
    # accessory codes that appear in GDOM_ITALIAN are intentionally skipped
    # to avoid touching Night Collection items.
    # ------------------------------------------------------------------
    for code, italian in GDOM_ITALIAN.items():
        # SAFETY GUARD: only process Lorella item codes
        if not (code.startswith(LORELLA_ALLOWED_PREFIXES) or code in LORELLA_EXCEPTIONS):
            continue
        try:
            if frappe.db.exists("Item", code):
                doc = frappe.get_doc("Item", code)
                doc.item_group = ITEM_GROUP
                doc.cm_supplier_name = ARES_SUPPLIER
                doc.cm_supplier_item_code = code
                doc.cm_supplier_item_name = italian[:140]
                doc.cm_product_type = "Secondary"

                existing = [r for r in doc.supplier_items if r.supplier == ARES_SUPPLIER]
                if existing:
                    existing[0].supplier_part_no = code
                else:
                    doc.append("supplier_items", {
                        "supplier": ARES_SUPPLIER,
                        "supplier_part_no": code,
                    })

                doc.save(ignore_permissions=True)
                meta_updated += 1

            else:
                item_name = _derive_english_name(code, italian)

                frappe.get_doc({
                    "doctype": "Item",
                    "item_code": code,
                    "item_name": item_name,
                    "item_group": ITEM_GROUP,
                    "stock_uom": "EA",
                    "is_stock_item": 0,
                    "brand": "Ares Mobilificio",
                    "disabled": 0,
                    "cm_product_type": "Secondary",
                    "cm_supplier_name": ARES_SUPPLIER,
                    "cm_supplier_item_code": code,
                    "cm_supplier_item_name": italian[:140],
                    "supplier_items": [{
                        "supplier": ARES_SUPPLIER,
                        "supplier_part_no": code,
                    }],
                }).insert(ignore_permissions=True)
                meta_inserted += 1

        except Exception as e:
            errors.append(f"[META] {code}: {str(e)}")
            meta_skipped += 1

    frappe.db.commit()

    # ------------------------------------------------------------------
    # Pass 2 — Create or update Item Prices
    # ------------------------------------------------------------------
    for code, listino_price in GDOM_PRICES.items():
        try:
            existing_prices = frappe.get_all(
                "Item Price",
                filters={"item_code": code, "price_list": PRICE_LIST_NAME},
                fields=["name", "price_list_rate"],
            )

            if not existing_prices:
                frappe.get_doc({
                    "doctype": "Item Price",
                    "item_code": code,
                    "price_list": PRICE_LIST_NAME,
                    "currency": "EUR",
                    "price_list_rate": listino_price,
                    "buying": 1,
                    "selling": 0,
                }).insert(ignore_permissions=True)
                price_created += 1

            else:
                existing_rate = float(existing_prices[0]["price_list_rate"])
                if existing_rate != listino_price:
                    price_doc = frappe.get_doc("Item Price", existing_prices[0]["name"])
                    price_doc.price_list_rate = listino_price
                    price_doc.save(ignore_permissions=True)
                    price_updated += 1
                    corrections.append(
                        f"[PRICE CORRECTED] {code}: "
                        f"was \u20ac{existing_rate}, now \u20ac{listino_price}"
                    )
                else:
                    price_ok += 1

        except Exception as e:
            errors.append(f"[PRICE] {code}: {str(e)}")

    frappe.db.commit()

    # ------------------------------------------------------------------
    # After counts
    # ------------------------------------------------------------------
    lorella_after = frappe.db.sql(
        "SELECT COUNT(*) FROM tabItem WHERE item_code LIKE '1LE%'"
    )[0][0]
    night_after = frappe.db.sql(
        "SELECT COUNT(*) FROM tabItem WHERE item_code LIKE '1N%'"
    )[0][0]

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    print(f"\n{'='*65}")
    print(f"  Lorella Collection — Ares GDOM Listino Import")
    print(f"{'='*65}")
    print(f"\n  ITEM MASTER  (item_group = '{ITEM_GROUP}')")
    print(f"    Newly created   : {meta_inserted}")
    print(f"    Updated         : {meta_updated}")
    print(f"    Errors/skipped  : {meta_skipped}")
    print(f"\n  PRICES  ({PRICE_LIST_NAME})")
    print(f"    Already correct : {price_ok}")
    print(f"    Newly created   : {price_created}")
    print(f"    Corrected       : {price_updated}")
    if corrections:
        print(f"\n  PRICE CORRECTIONS ({len(corrections)}):")
        for c in corrections:
            print(f"    {c}")
    if errors:
        print(f"\n  ERRORS ({len(errors)}):")
        for e in errors:
            print(f"    {e}")
    print(f"\n  SCOPE CHECK (1LE% only — Night Collection must be unchanged)")
    print(f"    Lorella (1LE%) before : {lorella_before}")
    print(f"    Lorella (1LE%) after  : {lorella_after}")
    print(f"    Night (1N%)   before  : {night_before}")
    print(f"    Night (1N%)   after   : {night_after}")
    if night_before != night_after:
        print(f"  *** WARNING: Night Collection item count changed! ***")
    print(f"\n  NOTE: {len(SHARED_ACCESSORIES)} shared accessory codes (e.g. 1CNACCTX001)")
    print(f"        already exist from Night Collection — skipped in this patch.")
    print(f"{'='*65}\n")


def _derive_english_name(code, italian):
    """
    Produce a concise English item_name for DMS display.
    Falls back to 'Lorella {code}' if pattern not matched.
    """
    mapping = [
        ('Armadio 1 Anta', 'Hinged Wardrobe 1 Door'),
        ('Armadio 2 Ante', 'Hinged Wardrobe 2 Door'),
        ('Armadio 3 Ante', 'Hinged Wardrobe 3 Door'),
        ('Armadio 4 Ante con 2 Specchi', 'Hinged Wardrobe 4 Door 2 Mirror'),
        ('Armadio 4 Ante', 'Hinged Wardrobe 4 Door'),
        ('Armadio 5 Ante', 'Hinged Wardrobe 5 Door'),
        ('Armadio 6 Ante con 2 Specchi', 'Hinged Wardrobe 6 Door 2 Mirror'),
        ('Armadio 6 Ante', 'Hinged Wardrobe 6 Door'),
        ('Cabina 1/A Specchio', 'Walk-in Cabin 1 Door Mirror'),
        ('Cabina 2/A Specchi', 'Walk-in Cabin 2 Door Mirror'),
        ('Cabina 1 Anta', 'Walk-in Cabin 1 Door'),
        ('Cabina 2 Ante', 'Walk-in Cabin 2 Door'),
        ('Terminale SX', 'Terminal Left'),
        ('Terminale DX', 'Terminal Right'),
        ('Terminale Scarpiera', 'Shoe Cabinet Terminal'),
        ('Ponte 6 Ante', 'Bridge Wardrobe 6 Door'),
        ('Ponte 7 Ante', 'Bridge Wardrobe 7 Door'),
        ('Vano Armadio TV', 'TV Wardrobe Unit'),
        ('Mobile a Giorno', 'Open Shelf Unit'),
        ('Griglia Sottoponte', 'Under-Bridge Grille'),
        ('N\u00b01 Colonna c/Ripiani', 'Bridge Column with Shelves'),
        ('Comodino 2 Cassetti', 'Bedside 2 Drawer'),
        ('Como\u0300 3 Cassetti', 'Chest of Drawers 3 Drawer'),
        ('Settimino 6 Cassetti Lorena & Lety - Maniglia Laterale - Multicolor', 'Tallboy 6 Drawer Multicolor Lateral Handle'),
        ('Settimino 6 Cassetti', 'Tallboy 6 Drawer'),
        ('Cassettiera 2 Cassetti con Ruote', 'Chest 2 Drawer on Wheels'),
        ('Scrivania', 'Desk'),
        ('Letto da 160 c/Pannello Frontale con LED - con Contenitore', 'Bed 160 Frontpanel LED with Storage'),
        ('Letto da 160 c/Pannello Frontale con LED - senza Contenitore', 'Bed 160 Frontpanel LED without Storage'),
        ('Letto da 120 con Contenitore', 'Bed 120 with Storage'),
        ('Letto da 120 senza Contenitore', 'Bed 120 without Storage'),
        ('Letto da 160 con Contenitore', 'Bed 160 with Storage'),
        ('Letto da 160 senza Contenitore', 'Bed 160 without Storage'),
        ('Pensile 1 Vano a Giorno', 'Open Wall Unit 1 Bay'),
        ('Pensile 2 Vani a Giorno', 'Open Wall Unit 2 Bay'),
        ('Specchiera Sagomata con LED', 'Shaped Mirror with LED'),
        ('Specchiera Rettangolare', 'Rectangular Mirror'),
        ('Specchio Interno', 'Internal Mirror'),
    ]

    struct_en = {
        'Olmo Delicato': 'Olmo Delicato',
        'Frassino Ghiaccio': 'Frassino Ghiaccio',
        'Noce Stelvio': 'Noce Stelvio',
        'Noce Tortora Stelvio': 'Noce Tortora',
    }
    front_en = {
        'Cemento': 'Cement', 'Basalt': 'Basalt', 'Cachemire': 'Cachemire',
        'Pietra Scura': 'Dark Stone', 'Metallo Bronzo': 'Bronze Metal',
        'Metallo Argento': 'Silver Metal', 'Sofia Perla': 'Sofia Pearl',
        'Sofia Cuoio': 'Sofia Leather', 'Bianco Lucido': 'Gloss White',
    }

    cat_en = None
    for it_kw, en_kw in mapping:
        if it_kw in italian:
            cat_en = en_kw
            break

    if not cat_en:
        return f'Lorella {code}'

    parts = [cat_en, '\u2013 Lorella']
    for sn, se in struct_en.items():
        if sn in italian:
            parts.append(se)
            break
    for fn, fe in front_en.items():
        if fn in italian:
            parts.append(f'/ {fe}')
            break

    return ' '.join(parts)

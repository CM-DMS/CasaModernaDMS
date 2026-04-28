"""One-time backfill: populate config_json + pricing_json for all existing
CM Custom Lines created before BOM capture was implemented, or that were
saved with an incomplete BOM.

Run with:
  bench --site two.casamodernadms.eu execute \
    casamoderna_dms.backfill_cfg_bom.backfill_night_collection_bom
  bench --site two.casamodernadms.eu execute \
    casamoderna_dms.backfill_cfg_bom.backfill_sofa_configs
"""

import json
import frappe

# ---------------------------------------------------------------------------
# Shared BOM templates keyed by CM Custom Line name.
# Covers Quotation-linked and Sales Order-linked versions of each config.
# ---------------------------------------------------------------------------

_PONTE_CE_P6 = {
    "configurator_type": "Night Collection",
    "gozo_delivery": False,
    "wardrobes": [
        {
            "mode": "PONTE",
            "option": "P6",
            "optionLabel": "6 Door Ponte  (L327)",
            "structure": {
                "sku": "1CNSTRCE011",
                "finish": "CE",
                "qty": 1,
                "weight": 2.50,
                "name": "Ponte Structure L327 — Grigio Cenere",
            },
            "doors": [
                # NS-finish outer side doors (structure CE, doors NS — mixed finish chosen by customer)
                {"sku": "1CNFRONS001", "finish": "NS", "type": "single", "qty": 1, "weight": 0.20, "name": "Side Door — Left"},
                {"sku": "1CNFRONS001", "finish": "NS", "type": "single", "qty": 1, "weight": 0.20, "name": "Side Door — Right"},
                # Centre ponte bridge (4 small doors, no handles)
                {"sku": "MISSING-DOOR-4", "finish": "NS", "type": "ponte", "qty": 1, "weight": 0.50, "name": "4 Small Centre Doors (no handles)"},
            ],
            "handles": [
                # 1 handle per door group (single or pair), not per leaf — 2 outer singles → qty 2
                {"sku": "1CNMANCE004", "finish": "CE", "type": "HANDLE-BG", "qty": 2, "weight": 0.05, "name": "Big Handle"},
            ],
            "accessories": [
                # Under-Ponte framing shelf — always included with Ponte wardrobes
                {"code": "UNDER_PONTE", "sku": "1CNACCCE014", "name": "Under-Ponte Framing Shelf", "qty": 1, "weight": 0.15},
            ],
        }
    ],
    "furniture": [],
}

_HINGED_CE_W4 = {
    "configurator_type": "Night Collection",
    "gozo_delivery": False,
    "wardrobes": [
        {
            "mode": "HINGED",
            "option": "W4",
            "optionLabel": "4 Door  (L173)",
            "structure": {
                "sku": "1CNSTRCE004",
                "finish": "CE",
                "qty": 1,
                "weight": 1.80,
                "name": "Hinged Structure 4-Door L173 — Grigio Cenere",
            },
            "doors": [
                {"sku": "1CNFROCE002", "finish": "CE", "type": "pair", "qty": 1, "weight": 0.30, "name": "Door Pair 1"},
                {"sku": "1CNFROCE002", "finish": "CE", "type": "pair", "qty": 1, "weight": 0.30, "name": "Door Pair 2"},
            ],
            "handles": [
                {"sku": "1CNMANCE001", "finish": "CE", "type": "HANDLE-SM", "qty": 2, "weight": 0.05, "name": "Small Handle"},
            ],
            "accessories": [],
        }
    ],
    "furniture": [],
}

_CASTOR_NS = {
    "configurator_type": "Night Collection",
    "gozo_delivery": False,
    "wardrobes": [],
    "furniture": [
        {
            "sku": "1CNCMDNS002NS",
            "name": "Castor Drawers — Noce Stelvio",
            "finish": "NS",
            "qty": 1,
            "weight": 0.50,
            "role": "FURNITURE_ACC",
            "catCode": "ACC",
        }
    ],
}

# CFG-2026-00028: Ponte L327 CE + Bed 160 with Storage NS
# The original backfill used _PONTE_CE_P6 (furniture=[]).  This version adds
# the bed that was actually part of the SO000011-2 configuration.
_PONTE_CE_P6_WITH_BED = {
    "configurator_type": "Night Collection",
    "gozo_delivery": False,
    "wardrobes": _PONTE_CE_P6["wardrobes"],
    "furniture": [
        {
            "sku":     "1CNLETNS003",
            "name":    "Bed 160cm w/ Storage \u2014 Noce Stelvio",
            "finish":  "NS",
            "qty":     1,
            "weight":  1.50,
            "role":    "FURNITURE_BED",
            "catCode": "BED",
        }
    ],
}

BOMS = {
    # Ponte L327 CE: QT version (no bed) + SO version (with bed)
    "CFG-2026-00025": _PONTE_CE_P6,
    "CFG-2026-00028": _PONTE_CE_P6_WITH_BED,
    # Hinged L173 CE: QT version + SO version
    "CFG-2026-00026": _HINGED_CE_W4,
    "CFG-2026-00029": _HINGED_CE_W4,
    # Castor Drawers NS: QT version + SO version
    "CFG-2026-00022": _CASTOR_NS,
    "CFG-2026-00023": _CASTOR_NS,
}


def backfill_night_collection_bom():
    from casamoderna_dms.configurator_pricing_api import (
        resolve_night_collection_bom_price,
    )

    results = []
    for cl_name, bom in BOMS.items():
        try:
            existing = frappe.db.get_value("CM Custom Line", cl_name, "config_json")
            if existing:
                results.append(f"  ⏭ {cl_name}  (already has data — skipped)")
                continue

            pricing = resolve_night_collection_bom_price(bom)

            frappe.db.set_value(
                "CM Custom Line",
                cl_name,
                {
                    "config_json":  json.dumps(bom),
                    "pricing_json": json.dumps(pricing),
                },
            )
            frappe.db.commit()

            offer = pricing.get("offer_price_inc_vat", "?")
            results.append(
                f"  ✓ {cl_name}  offer={offer:.2f}"
                if isinstance(offer, float)
                else f"  ✓ {cl_name}"
            )
        except Exception as exc:
            results.append(f"  ✗ {cl_name}: {exc}")

    print("\nBackfill Night Collection BOM — results:")
    for r in results:
        print(r)
    print()


# ---------------------------------------------------------------------------
# SOFA backfill — config_json + pricing_json for SOFA CM Custom Lines that
# were created before config capture was reliable.
#
# config_json mirrors what SalesDocEditor stores for type='SOFA'.
# pricing_json uses the actual rates saved on the sales document item.
# ---------------------------------------------------------------------------

# Each entry: (cl_name, config_dict, pricing_dict)
_SOFA_RECORDS = [
    # CFG-2026-00024: Clara Three Seater · ROMA — Roma 28 - Dark grey (QT 000009)
    # Saved at a manually negotiated rate; use A-tier rrp for reference.
    (
        "CFG-2026-00024",
        {
            "type":           "SOFA",
            "modelKey":       "CLARA_THREE_SEATER",
            "displayName":    "Clara Three Seater",
            "orientation":    None,
            "fabricRange":    "ROMA",
            "colourKey":      "ROMA_28",
            "colourName":     "Roma 28 - Dark grey",
            "finishCategory": "A",
            "options":        {"STORAGE_POUFFE": False, "EXTRA_SEAT": False, "ELEC_RECLINER": None},
            "sofa_image_url": "/sofa-measurements/LINEAR/CLARA_THREE_SEATER.jpg",
        },
        {"offer_price_inc_vat": 595, "rrp_inc_vat": 1315, "vat_rate": 18},
    ),
    # CFG-2026-00030: Primo Corner (2×71cm) · LHF · NORA — Nora 06 - Amber (QT 000010)
    (
        "CFG-2026-00030",
        {
            "type":           "SOFA",
            "modelKey":       "PRIMO_CORNER_2X71CM",
            "displayName":    "Primo Corner (2\u00d771cm)",
            "orientation":    "L",
            "fabricRange":    "NORA",
            "colourKey":      "NORA_06",
            "colourName":     "Nora 06 - Amber",
            "finishCategory": "C",
            "options":        {"STORAGE_POUFFE": False, "EXTRA_SEAT": False, "ELEC_RECLINER": None},
            "sofa_image_url": "/sofa-measurements/PRIMO/PRIMO_CORNER/2_PRIMO_CORNER_71_LH-SX.jpg",
        },
        {"offer_price_inc_vat": 1520, "rrp_inc_vat": 2172, "vat_rate": 18},
    ),
    # CFG-2026-00031: Isabel Corner (2×71cm) · LHF · NORA — Nora 02 - Light Linen (QT 000011)
    (
        "CFG-2026-00031",
        {
            "type":           "SOFA",
            "modelKey":       "ISABEL_CORNER_2X71CM",
            "displayName":    "Isabel Corner (2\u00d771cm)",
            "orientation":    "L",
            "fabricRange":    "NORA",
            "colourKey":      "NORA_02",
            "colourName":     "Nora 02 - Light Linen",
            "finishCategory": "C",
            "options":        {"STORAGE_POUFFE": False, "EXTRA_SEAT": False, "ELEC_RECLINER": None},
            "sofa_image_url": "/sofa-measurements/ISABEL/ISABEL_CORNER/2_ISABEL_CORNER_71_LH-SX.jpg",
        },
        {"offer_price_inc_vat": 1569, "rrp_inc_vat": 2244, "vat_rate": 18},
    ),
    # CFG-2026-00032: Isabel Three Seater (2×71cm) · NORA — Nora 01 - Cream · +Extra Seat (QT 000012-1)
    # finishCategory C: base C offer=1058 + EXTRA_SEAT offer=314 = 1372; rrp 1512+449 = 1961
    (
        "CFG-2026-00032",
        {
            "type":           "SOFA",
            "modelKey":       "ISABEL_THREE_SEATER_2X71CM",
            "displayName":    "Isabel Three Seater (2\u00d771cm)",
            "orientation":    None,
            "fabricRange":    "NORA",
            "colourKey":      "NORA_01",
            "colourName":     "Nora 01 - Cream",
            "finishCategory": "C",
            "options":        {"STORAGE_POUFFE": False, "EXTRA_SEAT": True, "ELEC_RECLINER": None},
            "sofa_image_url": "/sofa-measurements/ISABEL/ISABEL_SEATER/3_ISABEL_SEATER_71+EXTRA.jpg",
        },
        {"offer_price_inc_vat": 1372, "rrp_inc_vat": 1961, "vat_rate": 18},
    ),
]


def backfill_sofa_configs():
    """Write config_json + pricing_json for SOFA CM Custom Lines missing that data."""
    results = []
    for cl_name, config, pricing in _SOFA_RECORDS:
        try:
            existing = frappe.db.get_value("CM Custom Line", cl_name, "config_json")
            if existing:
                results.append(f"  ⏭ {cl_name}  (already has data — skipped)")
                continue

            frappe.db.set_value(
                "CM Custom Line",
                cl_name,
                {
                    "config_json":  json.dumps(config),
                    "pricing_json": json.dumps(pricing),
                },
            )
            frappe.db.commit()
            results.append(f"  ✓ {cl_name}")
        except Exception as exc:
            results.append(f"  ✗ {cl_name}: {exc}")

    print("\nBackfill SOFA configs — results:")
    for r in results:
        print(r)
    print()

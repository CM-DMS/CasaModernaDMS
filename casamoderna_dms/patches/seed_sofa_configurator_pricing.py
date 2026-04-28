"""seed_sofa_configurator_pricing.py — Phase D seed patch.

Migrates the static sofaPricingData.js BASE_PRICES into the CM Configurator
Pricing matrix so sofa prices are admin-maintainable without code changes.

Creates:
  - Price List  "Sofa Standard"  (selling=1, currency=EUR, configurator_type=Sofa)
  - CM Configurator Pricing  CFGP-SOFA-0001  (type=Sofa, no validity end)
    └─ Tier:       Standard  (min_order_value = 0)
    └─ Matrix rows: one per (modelKey × finishCategory)
                    dimension fields: mode=modelKey, finish_code=finishCategory

Idempotent: skips silently if a Sofa CM Configurator Pricing doc already exists.
"""

from __future__ import annotations

import frappe

# ---------------------------------------------------------------------------
# Pricing data — exact mirror of frontend/src/components/configurators/sofaPricingData.js BASE_PRICES
# Keys: model_key → { 'A'|'B'|'C' → (rrp_inc_vat, offer_inc_vat) }
# ---------------------------------------------------------------------------
_BASE_PRICES: dict[str, dict[str, tuple[int, int]]] = {
    # ── Linear──────────────────────────────────────────────────────────────
    "AMANDA_ELECTRIC_RECLINER": {
        "A": (1743, 1220), "B": (1920, 1344), "C": (2005, 1403),
    },
    "CLARA_TWO_SEATER": {
        "A": (680, 476),   "B": (750, 525),   "C": (790, 553),
    },
    "CLARA_THREE_SEATER": {
        "A": (850, 595),   "B": (936, 655),   "C": (980, 686),
    },
    "PRIMO_TWO_SEATER_2X61CM": {
        "A": (1245, 825),  "B": (1300, 910),  "C": (1358, 950),
    },
    "PRIMO_THREE_SEATER_2X71CM": {
        "A": (1315, 852),  "B": (1343, 940),  "C": (1400, 980),
    },
    "TALENTO_TWO_SEATER_2X61CM": {
        "A": (1740, 1217), "B": (1914, 1338), "C": (2001, 1399),
    },
    "TALENTO_THREE_SEATER_2X71CM": {
        "A": (1315, 920),  "B": (1447, 1012), "C": (1512, 1058),
    },
    "ISABEL_TWO_SEATER_2X61CM": {
        "A": (1245, 870),  "B": (1368, 957),  "C": (1430, 1000),
    },
    "ISABEL_THREE_SEATER_2X71CM": {
        "A": (1315, 920),  "B": (1447, 1012), "C": (1512, 1058),
    },
    "MELISSA_TWO_SEATER_2X61CM": {
        "A": (1245, 870),  "B": (1368, 957),  "C": (1430, 1000),
    },
    "MELISSA_THREE_SEATER_2X71CM": {
        "A": (1315, 920),  "B": (1447, 1012), "C": (1512, 1058),
    },
    "VIOLA_TWO_SEATER_2X61CM": {
        "A": (1245, 870),  "B": (1368, 957),  "C": (1430, 1000),
    },
    "VIOLA_THREE_SEATER_2X71CM": {
        "A": (1315, 920),  "B": (1447, 1012), "C": (1512, 1058),
    },
    "MILANO_TWO_SEATER_2X61CM": {
        "A": (1245, 870),  "B": (1368, 957),  "C": (1430, 1000),
    },
    "MILANO_THREE_SEATER_2X71CM": {
        "A": (1315, 920),  "B": (1447, 1012), "C": (1512, 1058),
    },
    # ── Chaise Lounge───────────────────────────────────────────────────────
    "PRIMO_CHAISE_LOUNGE_2X61CM": {
        "A": (1681, 1176), "B": (1850, 1295), "C": (1932, 1352),
    },
    "PRIMO_CHAISE_LOUNGE_2X71CM": {
        "A": (1730, 1210), "B": (1908, 1335), "C": (1993, 1395),
    },
    "TALENTO_CHAISE_LOUNGE_2X61CM": {
        "A": (1740, 1217), "B": (1969, 1377), "C": (2058, 1439),
    },
    "TALENTO_CHAISE_LOUNGE_2X71CM": {
        "A": (1790, 1252), "B": (2145, 1500), "C": (2244, 1569),
    },
    "ISABEL_CHAISE_LOUNGE_2X61CM": {
        "A": (1740, 1217), "B": (1914, 1338), "C": (2001, 1399),
    },
    "ISABEL_CHAISE_LOUNGE_2X71CM": {
        "A": (1790, 1252), "B": (1969, 1377), "C": (2058, 1439),
    },
    "MELISSA_CHAISE_LOUNGE_2X61CM": {
        "A": (1740, 1217), "B": (1914, 1338), "C": (2001, 1399),
    },
    "MELISSA_CHAISE_LOUNGE_2X71CM": {
        "A": (1790, 1252), "B": (1969, 1377), "C": (2058, 1439),
    },
    "VIOLA_CHAISE_LOUNGE_2X61CM": {
        "A": (1740, 1217), "B": (1914, 1338), "C": (2001, 1399),
    },
    "VIOLA_CHAISE_LOUNGE_2X71CM": {
        "A": (1790, 1252), "B": (1969, 1377), "C": (2058, 1439),
    },
    "MILANO_CHAISE_LOUNGE_2X61CM": {
        "A": (1740, 1217), "B": (1914, 1338), "C": (2001, 1399),
    },
    "MILANO_CHAISE_LOUNGE_2X71CM": {
        "A": (1790, 1252), "B": (1969, 1377), "C": (2058, 1439),
    },
    # ── Corner (2×)─────────────────────────────────────────────────────────
    "PRIMO_CORNER_2X61CM": {
        "A": (1833, 1282), "B": (2015, 1410), "C": (2108, 1475),
    },
    "PRIMO_CORNER_2X71CM": {
        "A": (1887, 1320), "B": (2075, 1452), "C": (2172, 1520),
    },
    "TALENTO_CORNER_2X61CM": {
        "A": (1855, 1298), "B": (2040, 1427), "C": (2134, 1492),
    },
    "TALENTO_CORNER_2X71CM": {
        "A": (1952, 1365), "B": (2145, 1500), "C": (2244, 1569),
    },
    "ISABEL_CORNER_2X61CM": {
        "A": (1855, 1298), "B": (2040, 1427), "C": (2134, 1492),
    },
    "ISABEL_CORNER_2X71CM": {
        "A": (1952, 1365), "B": (2145, 1500), "C": (2244, 1569),
    },
    "MELISSA_CORNER_2X61CM": {
        "A": (1855, 1298), "B": (2040, 1427), "C": (2134, 1492),
    },
    "MELISSA_CORNER_2X71CM": {
        "A": (1952, 1365), "B": (2145, 1500), "C": (2244, 1569),
    },
    "VIOLA_CORNER_2X61CM": {
        "A": (1855, 1298), "B": (2040, 1427), "C": (2134, 1492),
    },
    "VIOLA_CORNER_2X71CM": {
        "A": (1952, 1365), "B": (2145, 1500), "C": (2058, 1439),
    },
    "MILANO_CORNER_2X61CM": {
        "A": (1855, 1298), "B": (2040, 1427), "C": (2134, 1492),
    },
    "MILANO_CORNER_2X71CM": {
        "A": (1952, 1365), "B": (2145, 1500), "C": (2244, 1569),
    },
    # ── Corner (3×)─────────────────────────────────────────────────────────
    "PRIMO_CORNER_3X61CM": {
        "A": (2282, 1596), "B": (2463, 1724), "C": (2556, 1789),
    },
    "PRIMO_CORNER_3X71CM": {
        "A": (2336, 1634), "B": (2523, 1766), "C": (2630, 1834),
    },
    "TALENTO_CORNER_3X61CM": {
        "A": (2305, 1612), "B": (2489, 1741), "C": (2580, 1806),
    },
    "TALENTO_CORNER_3X71CM": {
        "A": (2401, 1679), "B": (2594, 1814), "C": (2692, 1883),
    },
    "ISABEL_CORNER_3X61CM": {
        "A": (2305, 1612), "B": (2489, 1741), "C": (2580, 1806),
    },
    "ISABEL_CORNER_3X71CM": {
        "A": (2401, 1679), "B": (2594, 1814), "C": (2692, 1883),
    },
    "MELISSA_CORNER_3X61CM": {
        "A": (2305, 1612), "B": (2489, 1741), "C": (2580, 1806),
    },
    "MELISSA_CORNER_3X71CM": {
        "A": (2401, 1679), "B": (2594, 1814), "C": (2692, 1883),
    },
    "VIOLA_CORNER_3X61CM": {
        "A": (2305, 1612), "B": (2489, 1741), "C": (2580, 1806),
    },
    "VIOLA_CORNER_3X71CM": {
        "A": (2401, 1679), "B": (2594, 1814), "C": (2692, 1883),
    },
    "MILANO_CORNER_3X61CM": {
        "A": (2305, 1612), "B": (2489, 1741), "C": (2580, 1806),
    },
    "MILANO_CORNER_3X71CM": {
        "A": (2401, 1679), "B": (2594, 1814), "C": (2692, 1883),
    },
}

_PRICE_LIST_NAME = "Sofa Standard"
_CONFIGURATOR_TYPE = "Sofa"
_TIER_NAME = "Standard"


def execute():
    """Create the Sofa price list and pricing matrix if not already present."""

    # Idempotency check — if any Sofa CM Configurator Pricing already exists, skip.
    existing = frappe.get_all(
        "CM Configurator Pricing",
        filters={"configurator_type": _CONFIGURATOR_TYPE},
        limit=1,
    )
    if existing:
        frappe.logger().info(
            f"seed_sofa_configurator_pricing: Sofa pricing doc already exists ({existing[0]['name']}), skipping."
        )
        return

    # ── 1. Create (or reuse) the Sofa Standard price list ──────────────────
    if not frappe.db.exists("Price List", _PRICE_LIST_NAME):
        pl = frappe.get_doc({
            "doctype": "Price List",
            "price_list_name": _PRICE_LIST_NAME,
            "currency": "EUR",
            "selling": 1,
            "buying": 0,
            "enabled": 1,
            "cm_configurator_type": _CONFIGURATOR_TYPE,
        })
        pl.insert(ignore_permissions=True)
        frappe.logger().info(f"seed_sofa_configurator_pricing: created Price List '{_PRICE_LIST_NAME}'")
    else:
        # Ensure cm_configurator_type is set even if it somehow exists without it
        frappe.db.set_value("Price List", _PRICE_LIST_NAME, "cm_configurator_type", _CONFIGURATOR_TYPE)

    # ── 2. Build matrix rows ────────────────────────────────────────────────
    matrix_rows = []
    for model_key, fabric_cats in _BASE_PRICES.items():
        for finish_code, (rrp, offer) in fabric_cats.items():
            matrix_rows.append({
                "doctype": "CM Configurator Pricing Matrix",
                "tier_name": _TIER_NAME,
                "role_name": "",          # wildcard — matches any role
                "mode": model_key,
                "finish_code": finish_code,
                "offer_price_inc_vat": offer,
                "rrp_inc_vat": rrp,
                "cost_price": 0,
            })

    # ── 3. Create the CM Configurator Pricing document ─────────────────────
    cfg_doc = frappe.get_doc({
        "doctype": "CM Configurator Pricing",
        "price_list": _PRICE_LIST_NAME,
        "configurator_type": _CONFIGURATOR_TYPE,
        "valid_from": None,
        "valid_to": None,
        "tiers": [
            {
                "doctype": "CM Configurator Pricing Tier",
                "tier_name": _TIER_NAME,
                "min_order_value_inc_vat": 0,
            }
        ],
        "matrix_rows": matrix_rows,
    })
    cfg_doc.insert(ignore_permissions=True)
    frappe.db.commit()

    row_count = len(matrix_rows)
    frappe.logger().info(
        f"seed_sofa_configurator_pricing: created {cfg_doc.name} "
        f"with {row_count} matrix rows."
    )

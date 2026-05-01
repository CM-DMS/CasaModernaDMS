"""import_v2_calculators.py — One-time import of pricing calculators from V2 into V3.

Run via bench console:
    cd /home/frappe/frappe/casamoderna-bench-v3
    bench --site cms.local execute casamoderna_dms.tools.import_v2_calculators.run

Or as a standalone script:
    cd /home/frappe/frappe/casamoderna-bench-v3
    bench --site cms.local console
    >>> import casamoderna_dms.tools.import_v2_calculators as m; m.run()
"""
import frappe

# ---------------------------------------------------------------------------
# V2 calculator data (exported 2026-04-30)
# ---------------------------------------------------------------------------

CALCULATORS = [
    {
        "calculator_name":      "Bedrooms Cecchini",
        "calculator_code":      "CM_BEDROOMS_CK",
        "requires_lm":          0,
        "pricing_mechanism":    "Supplier Ladder",
        "max_discount_percent": 30.0,
        "gozo_surcharge":       80.0,
        "notes":                "",
        "steps": [
            {"idx": 1, "step_type": "DISCOUNT_PCT",  "label": "1st Discount 45%",              "value": 45.0, "value2": 0.0},
            {"idx": 2, "step_type": "DISCOUNT_PCT",  "label": "2nd Discount 30%",              "value": 30.0, "value2": 0.0},
            {"idx": 3, "step_type": "INCREASE_PCT",  "label": "Freight 15%",                   "value": 15.0, "value2": 0.0},
            {"idx": 4, "step_type": "ADD_FIXED",     "label": "Storage and Delivery",          "value": 100.0, "value2": 0.0},
            {"idx": 5, "step_type": "ADD_FIXED",     "label": "Installation and Site Survey",  "value": 280.0, "value2": 0.0},
            {"idx": 6, "step_type": "ADD_FIXED",     "label": "Buffer",                        "value": 150.0, "value2": 0.0},
            {"idx": 7, "step_type": "INCREASE_PCT",  "label": "Profit 110%",                   "value": 110.0, "value2": 0.0},
        ],
    },
    {
        "calculator_name":      "Bedrooms Cecchini Prima and GDO Fixed",
        "calculator_code":      "CM_BEDROOMS_CB",
        "requires_lm":          0,
        "pricing_mechanism":    "Supplier Ladder",
        "max_discount_percent": 30.0,
        "gozo_surcharge":       80.0,
        "notes":                "",
        "steps": [
            {"idx": 1, "step_type": "DISCOUNT_PCT",  "label": "1st Discount 55%",          "value": 55.0, "value2": 0.0},
            {"idx": 2, "step_type": "INCREASE_PCT",  "label": "Freight 15%",               "value": 15.0, "value2": 0.0},
            {"idx": 3, "step_type": "ADD_FIXED",     "label": "Storage and Delivery \u20ac100", "value": 100.0, "value2": 0.0},
            {"idx": 4, "step_type": "ADD_FIXED",     "label": "Installation \u20ac250",        "value": 250.0, "value2": 0.0},
            {"idx": 5, "step_type": "INCREASE_PCT",  "label": "Profit 100%",               "value": 100.0, "value2": 0.0},
        ],
    },
    {
        "calculator_name":      "Bedrooms Lestro",
        "calculator_code":      "CM_BEDROOMS_LS",
        "requires_lm":          0,
        "pricing_mechanism":    "Supplier Ladder",
        "max_discount_percent": 30.0,
        "gozo_surcharge":       80.0,
        "notes":                "",
        "steps": [
            {"idx": 1, "step_type": "DISCOUNT_PCT",  "label": "1st Discount 50%",             "value": 50.0, "value2": 0.0},
            {"idx": 2, "step_type": "DISCOUNT_PCT",  "label": "2nd Discount 10%",             "value": 10.0, "value2": 0.0},
            {"idx": 3, "step_type": "INCREASE_PCT",  "label": "Freight 15%",                  "value": 15.0, "value2": 0.0},
            {"idx": 4, "step_type": "ADD_FIXED",     "label": "Storage and Delivery",         "value": 100.0, "value2": 0.0},
            {"idx": 5, "step_type": "ADD_FIXED",     "label": "Installation and Site Survey", "value": 250.0, "value2": 0.0},
            {"idx": 6, "step_type": "ADD_FIXED",     "label": "Buffer 150",                   "value": 150.0, "value2": 0.0},
            {"idx": 7, "step_type": "INCREASE_PCT",  "label": "Profit",                       "value": 100.0, "value2": 0.0},
        ],
    },
    {
        "calculator_name":      "Bedrooms Top Line",
        "calculator_code":      "CM_BEDROOMS_TL",
        "requires_lm":          0,
        "pricing_mechanism":    "Configurator BOM",
        "max_discount_percent": 30.0,
        "gozo_surcharge":       80.0,
        "notes":                "",
        "steps": [
            {"idx": 1, "step_type": "DISCOUNT_PCT",       "label": "1st Discount 50%",                       "value": 50.0, "value2": 0.0},
            {"idx": 2, "step_type": "DISCOUNT_PCT",       "label": "2nd Discount 10%",                       "value": 10.0, "value2": 0.0},
            {"idx": 3, "step_type": "DISCOUNT_PCT",       "label": "3rd Discount 10%",                       "value": 10.0, "value2": 0.0},
            {"idx": 4, "step_type": "INCREASE_PCT",       "label": "Freight 15%",                            "value": 15.0, "value2": 0.0},
            {"idx": 5, "step_type": "ADD_FIXED_WEIGHTED", "label": "Storage, Delivery, Installation and Buffer", "value": 300.0, "value2": 0.0},
            {"idx": 6, "step_type": "INCREASE_PCT",       "label": "Profit 100%",                            "value": 100.0, "value2": 0.0},
            {"idx": 7, "step_type": "INCREASE_PCT",       "label": "Discount Allowance",                     "value": 43.0,  "value2": 0.0},
        ],
    },
    {
        "calculator_name":      "Kitchens Axis",
        "calculator_code":      "CM_KITCHENS_AX",
        "requires_lm":          1,
        "pricing_mechanism":    "Supplier Ladder",
        "max_discount_percent": 30.0,
        "gozo_surcharge":       100.0,
        "notes": (
            "Listino = supplier list price. "
            "Inst+Site Survey: v=per-LM install rate (\u20ac/LM), v2=fixed site-survey fee (\u20ac). "
            "Currently flat \u20ac590 \u2014 update v and v2 once actual rates confirmed."
        ),
        "steps": [
            {"idx": 1, "step_type": "DISCOUNT_PCT",        "label": "1st Discount",          "value": 45.0, "value2":  0.0},
            {"idx": 2, "step_type": "DISCOUNT_PCT",        "label": "2nd Discount",          "value": 10.0, "value2":  0.0},
            {"idx": 3, "step_type": "INCREASE_PCT",        "label": "3% Increase",           "value":  3.0, "value2":  0.0},
            {"idx": 4, "step_type": "INCREASE_PCT",        "label": "Freight",               "value": 15.0, "value2":  0.0},
            {"idx": 5, "step_type": "ADD_FIXED",           "label": "Storage + Delivery",    "value": 200.0, "value2": 0.0},
            {"idx": 6, "step_type": "ADD_INSTALL_FROM_LM", "label": "Inst + Site Survey",   "value": 45.0,  "value2": 50.0},
            {"idx": 7, "step_type": "ADD_FIXED",           "label": "Buffer",                "value": 200.0, "value2": 0.0},
            {"idx": 8, "step_type": "INCREASE_PCT",        "label": "Profit",                "value": 125.0, "value2": 0.0},
        ],
    },
    {
        "calculator_name":      "Kitchens Dibiesse",
        "calculator_code":      "CM_KITCHENS_DB",
        "requires_lm":          1,
        "pricing_mechanism":    "Supplier Ladder",
        "max_discount_percent": 30.0,
        "gozo_surcharge":       100.0,
        "notes":                "",
        "steps": [
            {"idx": 1, "step_type": "DISCOUNT_PCT",        "label": "1st Discount 48%",                "value": 48.0, "value2":  0.0},
            {"idx": 2, "step_type": "DISCOUNT_PCT",        "label": "2nd Discount 10%",                "value": 10.0, "value2":  0.0},
            {"idx": 3, "step_type": "INCREASE_PCT",        "label": "Freight",                         "value": 15.0, "value2":  0.0},
            {"idx": 4, "step_type": "ADD_FIXED",           "label": "Storage and Delivery",            "value": 200.0, "value2": 0.0},
            {"idx": 5, "step_type": "ADD_INSTALL_FROM_LM", "label": "Installation & Site Survey",     "value": 45.0,  "value2": 50.0},
            {"idx": 6, "step_type": "ADD_FIXED",           "label": "Buffer",                          "value": 250.0, "value2": 0.0},
            {"idx": 7, "step_type": "INCREASE_PCT",        "label": "Profit 135%",                     "value": 135.0, "value2": 0.0},
        ],
    },
    {
        "calculator_name":      "Kitchens Domino Design",
        "calculator_code":      "CM_KITCHENS_DD",
        "requires_lm":          1,
        "pricing_mechanism":    "Supplier Ladder",
        "max_discount_percent": 30.0,
        "gozo_surcharge":       100.0,
        "notes":                "",
        "steps": [
            {"idx": 1, "step_type": "DISCOUNT_PCT",        "label": "1st Discount 50%",                "value": 50.0, "value2":  0.0},
            {"idx": 2, "step_type": "DISCOUNT_PCT",        "label": "2nd Discount 10%",                "value": 10.0, "value2":  0.0},
            {"idx": 3, "step_type": "INCREASE_PCT",        "label": "Freight 15%",                     "value": 15.0, "value2":  0.0},
            {"idx": 4, "step_type": "ADD_FIXED",           "label": "Storage + Delivery",              "value": 200.0, "value2": 0.0},
            {"idx": 5, "step_type": "ADD_INSTALL_FROM_LM", "label": "Installation and Site Survey",   "value": 45.0,  "value2": 50.0},
            {"idx": 6, "step_type": "ADD_FIXED",           "label": "Buffer",                          "value": 200.0, "value2": 0.0},
            {"idx": 7, "step_type": "INCREASE_PCT",        "label": "Profit 125%",                     "value": 125.0, "value2": 0.0},
        ],
    },
    {
        "calculator_name":      "Maresco Collections",
        "calculator_code":      "CM_BEDROOMS_MR",
        "requires_lm":          0,
        "pricing_mechanism":    "Configurator BOM",
        "max_discount_percent": 30.0,
        "gozo_surcharge":       80.0,
        "notes":                "",
        "steps": [
            {"idx": 1, "step_type": "INCREASE_PCT",       "label": "Price Increase 6%",                             "value":  6.0, "value2": 0.0},
            {"idx": 2, "step_type": "DISCOUNT_PCT",       "label": "1st Discount 10%",                              "value": 10.0, "value2": 0.0},
            {"idx": 3, "step_type": "DISCOUNT_PCT",       "label": "2nd Discount 10%",                              "value": 10.0, "value2": 0.0},
            {"idx": 4, "step_type": "INCREASE_PCT",       "label": "Freight 20%",                                   "value": 20.0, "value2": 0.0},
            {"idx": 5, "step_type": "ADD_FIXED_WEIGHTED", "label": "Storage, Delivery, Installation, Buffer",       "value": 380.0, "value2": 0.0},
            {"idx": 6, "step_type": "INCREASE_PCT",       "label": "Profit 95%",                                    "value": 95.0, "value2": 0.0},
        ],
    },
    {
        "calculator_name":      "Maresco Furniture",
        "calculator_code":      "CM_BEDROOMS_AR",
        "requires_lm":          0,
        "pricing_mechanism":    "Supplier Ladder",
        "max_discount_percent": 30.0,
        "gozo_surcharge":       80.0,
        "notes":                "",
        "steps": [
            {"idx": 1, "step_type": "DISCOUNT_PCT",  "label": "1st Discount 10%",                 "value": 10.0, "value2": 0.0},
            {"idx": 2, "step_type": "DISCOUNT_PCT",  "label": "2nd Discount 10%",                 "value": 10.0, "value2": 0.0},
            {"idx": 3, "step_type": "INCREASE_PCT",  "label": "Freight 15%",                      "value": 15.0, "value2": 0.0},
            {"idx": 4, "step_type": "ADD_FIXED",     "label": "Storage \u20ac50",                    "value": 50.0, "value2": 0.0},
            {"idx": 5, "step_type": "ADD_FIXED",     "label": "Delivery and Installation \u20ac280", "value": 280.0, "value2": 0.0},
            {"idx": 6, "step_type": "ADD_FIXED",     "label": "Buffer \u20ac50",                     "value": 50.0, "value2": 0.0},
            {"idx": 7, "step_type": "INCREASE_PCT",  "label": "Profit 95%",                       "value": 95.0, "value2": 0.0},
        ],
    },
]


def run():
    """Insert all V2 calculators into V3. Skips any that already exist by code."""
    imported = 0
    skipped  = 0

    for data in CALCULATORS:
        code = data["calculator_code"]
        if frappe.db.exists("CM Price Calculator", {"calculator_code": code}):
            print(f"  SKIP  {code} — already exists")
            skipped += 1
            continue

        doc = frappe.new_doc("CM Price Calculator")
        doc.calculator_name      = data["calculator_name"]
        doc.calculator_code      = code
        doc.requires_lm          = data["requires_lm"]
        doc.pricing_mechanism    = data["pricing_mechanism"]
        doc.max_discount_percent = data["max_discount_percent"]
        doc.gozo_surcharge       = data["gozo_surcharge"]
        doc.notes                = data.get("notes") or ""

        for step in data["steps"]:
            doc.append("steps", {
                "idx":       step["idx"],
                "step_type": step["step_type"],
                "label":     step["label"],
                "value":     step["value"],
                "value2":    step["value2"],
            })

        doc.insert(ignore_permissions=True)
        # Use db_set to ensure pricing_mechanism is persisted correctly
        # (frappe.new_doc may apply the field default before insert)
        if data["pricing_mechanism"] != "Supplier Ladder":
            frappe.db.set_value(
                "CM Price Calculator", doc.name,
                "pricing_mechanism", data["pricing_mechanism"]
            )
        print(f"  OK    {code} — {data['calculator_name']} ({len(data['steps'])} steps)")
        imported += 1

    frappe.db.commit()
    print(f"\nDone: {imported} imported, {skipped} skipped.")

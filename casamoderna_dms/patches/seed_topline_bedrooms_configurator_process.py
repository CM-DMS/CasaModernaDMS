"""
seed_topline_bedrooms_configurator_process.py
=============================================
One-time Frappe migration patch for the Topline Bedrooms (Topline Mobili) range.

Creates:
  - Item Group "Topline Bedrooms" (child of All Item Groups)
  - Brand "Topline Mobili"
  - Price List "Topline Supplier Price List" (buying, EUR)
  - All Topline item master records (TL* codes) with supplier metadata,
    weight factors, VAT rate and pricing rounding mode
  - Item Price rows in "Topline Supplier Price List"

The patch is idempotent: re-running updates stale prices without duplicating records.
"""
from __future__ import annotations

import frappe

SUPPLIER = "Topline Mobili"
BRAND    = "Topline Mobili"
PRICE_LIST_NAME = "Topline Supplier Price List"
ITEM_GROUP = "Topline Bedrooms"

# ---------------------------------------------------------------------------
# Weight factor table (by item-type code from the item_code)
# ---------------------------------------------------------------------------
WEIGHT_BY_TYPE = {
    'AR2B': 1.2, 'AR3B': 1.5, 'AR4B': 1.8, 'AR5B': 2.2, 'AR6B': 2.6,
    'AR2S': 3.5, 'AR3S': 4.5,
    'LC16': 1.2, 'LB16': 0.9, 'LG16': 0.8, 'LG09': 0.5,
    'LI16P': 1.2, 'LI16N': 1.2,
    'LB16P': 0.9, 'LB16N': 0.9,
    'CM': 0.3, 'CO': 0.6, 'SP': 0.15,
    # doors / handles (Zoe ante/maniglie)
    'ANTA1': 0.1, 'ANTA2': 0.2,
    'HANDLE': 0.0,
    # optionals
    'OPT': 0.1,
    # compositions — computed from component sum; stored explicitly in rows below
    'COMP': 0.0,
}

def _w(type_code):
    return WEIGHT_BY_TYPE.get(type_code, 0.1)


# ---------------------------------------------------------------------------
# Full item data  { item_code: (italian_desc, english_name, price, type_code, weight) }
# ---------------------------------------------------------------------------
def _build_items():
    items = {}

    def add(code, italian, english, price, type_code, weight=None, supplier_code=None):
        w = weight if weight is not None else _w(type_code)
        items[code] = {
            'italian':       italian[:140],
            'english':       english[:140],
            'price':         price,
            'type':          type_code,
            'weight':        w,
            'supplier_code': supplier_code or code,
        }

    # =========================================================================
    # NICOLE collection
    # =========================================================================
    # Wardrobes
    add('TLNCAR6B_BL',
        'Armadio 6 Ante Battente Nicole - Bianco Legno - L.275 P.57 H.245',
        'Nicole 6-Door Wardrobe – Bianco Legno', 950, 'AR6B', supplier_code='ANCBLB06B')
    add('TLNCAR5B_BL',
        'Armadio 5 Ante Battente Nicole - Bianco Legno - L.229 P.57 H.245',
        'Nicole 5-Door Wardrobe – Bianco Legno', 860, 'AR5B', supplier_code='ANCBLB05B')
    add('TLNCAR4B_BL',
        'Armadio 4 Ante Battente Nicole - Bianco Legno - L.184 P.57 H.245',
        'Nicole 4-Door Wardrobe – Bianco Legno', 660, 'AR4B', supplier_code='ANCBLB04B')
    add('TLNCAR3B_BL',
        'Armadio 3 Ante Battente Nicole - Bianco Legno - L.138 P.57 H.245',
        'Nicole 3-Door Wardrobe – Bianco Legno', 550, 'AR3B', supplier_code='ANCBLB03B')
    add('TLNCAR2B_BL',
        'Armadio 2 Ante Battente Nicole - Bianco Legno - L.93 P.57 H.245',
        'Nicole 2-Door Wardrobe – Bianco Legno', 360, 'AR2B', supplier_code='ANCBLB02B')

    # Beds
    add('TLNCLC16_RN',
        'Letto Contenitore Nicole 160 c/rete - Rovere Natura - L.178 P.202 H.113',
        'Nicole Storage Bed 160 – Rovere Natura', 830, 'LC16', supplier_code='LC20NCRN')
    add('TLNCLC16_NG',
        'Letto Contenitore Nicole 160 c/rete - Noce Ghiaccio - L.178 P.202 H.113',
        'Nicole Storage Bed 160 – Noce Ghiaccio', 830, 'LC16', supplier_code='LC20NCNG')
    add('TLNCLB16_RN',
        'Letto Box Nicole 160 - Rovere Natura - L.178 P.202 H.113',
        'Nicole Box Bed 160 – Rovere Natura', 540, 'LB16', supplier_code='LG30NCRN')
    add('TLNCLB16_NG',
        'Letto Box Nicole 160 - Noce Ghiaccio - L.178 P.202 H.113',
        'Nicole Box Bed 160 – Noce Ghiaccio', 540, 'LB16', supplier_code='LG30NCNG')

    # Comodini / Como / Specchiera
    add('TLNCCM_RN_BL',
        'Comodino Nicole - Rovere Natura / Bianco Legno - L.55 P.43 H.48',
        'Nicole Bedside Table – Rovere Natura / Bianco Legno', 180, 'CM', supplier_code='CMD1NCRNB')
    add('TLNCCM_NG_BL',
        'Comodino Nicole - Noce Ghiaccio / Bianco Legno - L.55 P.43 H.48',
        'Nicole Bedside Table – Noce Ghiaccio / Bianco Legno', 180, 'CM', supplier_code='CMD1NCNGB')
    add('TLNCCO_RN_BL',
        'Como Nicole - Rovere Natura / Bianco Legno - L.125 P.52 H.77',
        'Nicole Chest of Drawers – Rovere Natura / Bianco Legno', 470, 'CO', supplier_code='COMONCRNB')
    add('TLNCCO_NG_BL',
        'Como Nicole - Noce Ghiaccio / Bianco Legno - L.125 P.52 H.77',
        'Nicole Chest of Drawers – Noce Ghiaccio / Bianco Legno', 470, 'CO', supplier_code='COMONCNGB')
    add('TLNCSP_CR',
        'Specchiera Nicole - Bordo Cromato - L.110 P.2 H.70',
        'Nicole Mirror – Bordo Cromato', 120, 'SP', supplier_code='SPECCNC110')

    # Compositions — weight = AR6B(2.6) + LC16(1.2) + 2×CM(0.6) + CO(0.6) + SP(0.15) = 5.15
    add('TLNCCOMP_RN_BL',
        'Composizione Nicole - Rovere Natura / Bianco Legno - 6A battente + letto contenitore',
        'Nicole Composition – Rovere Natura / Bianco Legno – 6A + Storage Bed', 2730, 'COMP',
        weight=5.15, supplier_code='CNCRNB26B')
    add('TLNCCOMP_NG_BL',
        'Composizione Nicole - Noce Ghiaccio / Bianco Legno - 5A battente c/specchio + letto contenitore',
        'Nicole Composition – Noce Ghiaccio / Bianco Legno – 5A + Storage Bed', 2700, 'COMP',
        weight=5.15, supplier_code='CNCNGBS25B')

    # =========================================================================
    # ZOE collection
    # =========================================================================
    # Wardrobe casses
    for doors, arcode, price_nb, price_gl, weight, sc_nb, sc_gl in [
        (6, 'AR6B', 530, 530, 2.6, 'CSAZNB06B', 'CSAZGL06B'),
        (5, 'AR5B', 480, 480, 2.2, 'CSAZNB05B', 'CSAZGL05B'),
        (4, 'AR4B', 370, 370, 1.8, 'CSAZNB04B', 'CSAZGL04B'),
        (3, 'AR3B', 320, 320, 1.5, 'CSAZNB03B', 'CSAZGL03B'),
        (2, 'AR2B', 210, 210, 1.2, 'CSAZNB02B', 'CSAZGL02B'),
    ]:
        add(f'TLZOCASSA{doors}A_NB',
            f'Cassa Armadio {doors}A Battente Zoe - Noce Brunito - L.{"258" if doors==6 else "215" if doors==5 else "173" if doors==4 else "130" if doors==3 else "87"} P.55 H.240',
            f'Zoe Wardrobe Carcass {doors}-Door – Noce Brunito', price_nb, arcode, weight=weight, supplier_code=sc_nb)
        add(f'TLZOCASSA{doors}A_GL',
            f'Cassa Armadio {doors}A Battente Zoe - Grigio Legno - L.{"258" if doors==6 else "215" if doors==5 else "173" if doors==4 else "130" if doors==3 else "87"} P.55 H.240',
            f'Zoe Wardrobe Carcass {doors}-Door – Grigio Legno', price_gl, arcode, weight=weight, supplier_code=sc_gl)

    # Zoe ante (doors)
    add('TLZOANTA1_TC', 'Anta Singola Zoe - Talco', 'Zoe Single Door – Talco', 50, 'ANTA1', weight=0.1, supplier_code='ANTZTC01B')
    add('TLZOANTA1_CG', 'Anta Singola Zoe - Cemento Gres', 'Zoe Single Door – Cemento Gres', 50, 'ANTA1', weight=0.1, supplier_code='ANTZCG01B')
    add('TLZOANTA1_NB', 'Anta Singola Zoe - Noce Brunito', 'Zoe Single Door – Noce Brunito', 50, 'ANTA1', weight=0.1, supplier_code='ANTZNB01B')
    add('TLZOANTA1_GL', 'Anta Singola Zoe - Grigio Legno', 'Zoe Single Door – Grigio Legno', 50, 'ANTA1', weight=0.1, supplier_code='ANTZGL01B')
    add('TLZOANTA2_TC', 'Coppia Ante Zoe - Talco', 'Zoe Door Pair – Talco', 95, 'ANTA2', weight=0.2, supplier_code='ANTZTC02B')
    add('TLZOANTA2_CG', 'Coppia Ante Zoe - Cemento Gres', 'Zoe Door Pair – Cemento Gres', 95, 'ANTA2', weight=0.2, supplier_code='ANTZCG02B')
    add('TLZOANTA2_NB', 'Coppia Ante Zoe - Noce Brunito', 'Zoe Door Pair – Noce Brunito', 95, 'ANTA2', weight=0.2, supplier_code='ANTZNB02B')
    add('TLZOANTA2_GL', 'Coppia Ante Zoe - Grigio Legno', 'Zoe Door Pair – Grigio Legno', 95, 'ANTA2', weight=0.2, supplier_code='ANTZGL02B')
    add('TLZOANTA1_SP', 'Anta specchio per armadio battente Zoe - 1 pz', 'Zoe External Mirror Door – Single', 100, 'ANTA1', weight=0.1, supplier_code='ANTZSP01B')
    add('TLZOANTA2_SP', 'Coppia ante specchio per armadio battente Zoe - 2 pz', 'Zoe External Mirror Door Pair', 190, 'ANTA2', weight=0.2, supplier_code='ANTZSP02B')

    # Zoe maniglie (handles — negligible weight)
    add('TLZOMAN_MDFSG', 'Maniglia MDF stretta colore grigio anta armadio - 1 pz', 'Zoe Wardrobe Handle – MDF Narrow Grey (per anta)', 12, 'HANDLE', weight=0.0, supplier_code='M01ARMMDFSG')
    add('TLZOMAN_MDFLG', 'Maniglia MDF larga colore grigio anta armadio - 1 pz', 'Zoe Wardrobe Handle – MDF Wide Grey (per anta)', 35, 'HANDLE', weight=0.0, supplier_code='M01ARMMDFLG')
    add('TLZOMAN_MDFLN', 'Maniglia MDF larga colore noce brunito anta armadio - 1 pz', 'Zoe Wardrobe Handle – MDF Wide Noce Brunito (per anta)', 35, 'HANDLE', weight=0.0, supplier_code='M01ARMMDFLN')
    add('TLZOMAN_METG',  'Maniglia metallo colore grigio anta armadio - 1 pz', 'Zoe Wardrobe Handle – Metal Grey (per anta)', 40, 'HANDLE', weight=0.0, supplier_code='M01ARMMETG')

    # Zoe / Emma gruppi letto
    add('TLZELC16_NB',
        'Letto Contenitore Zoe/Emma 160 c/rete - Noce Brunito - L.170 P.205 H.110',
        'Zoe/Emma Storage Bed 160 – Noce Brunito', 560, 'LC16', supplier_code='LC20ZENB')
    add('TLZELC16_GL',
        'Letto Contenitore Zoe/Emma 160 c/rete - Grigio Legno - L.170 P.205 H.110',
        'Zoe/Emma Storage Bed 160 – Grigio Legno', 560, 'LC16', supplier_code='LC20ZEGL')
    add('TLZELB16_NB',
        'Letto Box Zoe/Emma 160 - Noce Brunito - L.170 P.205 H.110',
        'Zoe/Emma Box Bed 160 – Noce Brunito', 290, 'LB16', supplier_code='LC30ZENB')
    add('TLZELB16_GL',
        'Letto Box Zoe/Emma 160 - Grigio Legno - L.170 P.205 H.110',
        'Zoe/Emma Box Bed 160 – Grigio Legno', 290, 'LB16', supplier_code='LC30ZEGL')

    # Imbottito Parigi
    add('TLZELI16P_CO',
        'Letto Imbottito Contenitore Parigi 160 c/rete - Tessuto Corda - L.173 P.209 H.107',
        'Parigi Upholstered Storage Bed 160 – Tessuto Corda', 840, 'LI16P', supplier_code='LC20PARIC')
    add('TLZELI16P_GR',
        'Letto Imbottito Contenitore Parigi 160 c/rete - Tessuto Grigio - L.173 P.209 H.107',
        'Parigi Upholstered Storage Bed 160 – Tessuto Grigio', 840, 'LI16P', supplier_code='LC20PARIG')
    add('TLZELB16P_CO',
        'Letto Imbottito Box Parigi 160 - Tessuto Corda - L.173 P.209 H.107',
        'Parigi Upholstered Box Bed 160 – Tessuto Corda', 550, 'LB16P', supplier_code='LG30PARIC')
    add('TLZELB16P_GR',
        'Letto Imbottito Box Parigi 160 - Tessuto Grigio - L.173 P.209 H.107',
        'Parigi Upholstered Box Bed 160 – Tessuto Grigio', 550, 'LB16P', supplier_code='LG30PARIG')

    # Imbottito Nizza
    add('TLZELI16N_CO',
        'Letto Imbottito Contenitore Nizza 160 c/rete - Tessuto Corda - L.173 P.209 H.107',
        'Nizza Upholstered Storage Bed 160 – Tessuto Corda', 710, 'LI16N', supplier_code='LC20NIZZC')
    add('TLZELI16N_GR',
        'Letto Imbottito Contenitore Nizza 160 c/rete - Tessuto Grigio - L.173 P.209 H.107',
        'Nizza Upholstered Storage Bed 160 – Tessuto Grigio', 710, 'LI16N', supplier_code='LC20NIZZG')
    add('TLZELB16N_CO',
        'Letto Imbottito Box Nizza 160 - Tessuto Corda - L.173 P.209 H.107',
        'Nizza Upholstered Box Bed 160 – Tessuto Corda', 420, 'LB16N', supplier_code='LG30NIZZC')
    add('TLZELB16N_GR',
        'Letto Imbottito Box Nizza 160 - Tessuto Grigio - L.173 P.209 H.107',
        'Nizza Upholstered Box Bed 160 – Tessuto Grigio', 420, 'LB16N', supplier_code='LG30NIZZG')

    # Zoe/Emma comodini
    for finish_label, finish_code, price, sc in [
        ('Noce Brunito / Talco',        'NB_TC', 140, 'CMD1ZENBTC'),
        ('Noce Brunito / Cemento Gres', 'NB_CG', 140, 'CMD1ZENBCG'),
        ('Noce Brunito / Grigio Legno', 'NB_GL', 140, 'CMD1ZENBGL'),
        ('Grigio Legno / Talco',        'GL_TC', 140, 'CMD1ZEGLTC'),
        ('Grigio Legno / Cemento Gres', 'GL_CG', 140, 'CMD1ZEGLCG'),
        ('Grigio Legno / Noce Brunito', 'GL_NB', 140, 'CMD1ZEGLNB'),
    ]:
        add(f'TLZECM_{finish_code}',
            f'Comodino Zoe/Emma - {finish_label} - L.57 P.43 H.50',
            f'Zoe/Emma Bedside Table – {finish_label}', price, 'CM', supplier_code=sc)

    # Zoe/Emma comò
    for finish_label, finish_code, price, sc in [
        ('Noce Brunito / Talco',        'NB_TC', 340, 'COMOZENBTC'),
        ('Noce Brunito / Cemento Gres', 'NB_CG', 340, 'COMOZENBCG'),
        ('Noce Brunito / Grigio Legno', 'NB_GL', 340, 'COMOZENBGL'),
        ('Grigio Legno / Talco',        'GL_TC', 340, 'COMOZEGLTC'),
        ('Grigio Legno / Cemento Gres', 'GL_CG', 340, 'COMOZEGLCG'),
        ('Grigio Legno / Noce Brunito', 'GL_NB', 340, 'COMOZEGLNB'),
    ]:
        add(f'TLZECO_{finish_code}',
            f'Como Zoe/Emma - {finish_label} - L.121 P.50 H.77',
            f'Zoe/Emma Chest of Drawers – {finish_label}', price, 'CO', supplier_code=sc)

    add('TLZESP_CR',
        'Specchiera Zoe/Emma - Bordo Cromato - L.85 P.2 H.65',
        'Zoe/Emma Mirror – Bordo Cromato', 60, 'SP', supplier_code='SPECC85C65')

    # Zoe compositions — weight = AR6B(2.6)+LI16P(1.2)+2×CM(0.6)+CO(0.6)+SP(0.15) = 5.75
    add('TLZOCOMP_NB_TC',
        'Composizione Zoe - Noce Brunito / Talco - 6A + Parigi contenitore',
        'Zoe Composition – Noce Brunito / Talco – 6A + Parigi Storage Bed', 2522, 'COMP', weight=5.75,
        supplier_code='CZNBTC26B')
    add('TLZOCOMP_NB_GL',
        'Composizione Zoe - Noce Brunito / Grigio Legno - 4A + letto contenitore',
        'Zoe Composition – Noce Brunito / Grigio Legno – 4A + Storage Bed', 2042, 'COMP', weight=4.55,
        supplier_code='CZNBGL24B')
    add('TLZOCOMP_GL_CG',
        'Composizione Zoe - Grigio Legno / Cemento Gres - 6A c/specchi + Nizza contenitore',
        'Zoe Composition – Grigio Legno / Cemento Gres – 6A + Nizza Storage Bed', 2560, 'COMP', weight=5.75,
        supplier_code='CZGLCGS26B')
    add('TLZOCOMP_GL_NB',
        'Composizione Zoe - Grigio Legno / Noce Brunito - 5A + Nizza contenitore',
        'Zoe Composition – Grigio Legno / Noce Brunito – 5A + Nizza Storage Bed', 2465, 'COMP', weight=5.35,
        supplier_code='CZGLNBS25B')

    # =========================================================================
    # LUISA collection
    # =========================================================================
    _LUISA_SC = {
        'GC': dict(ar6b='ALUGCG06B', lc16='LC20GCG',  lg16='LG10GCG',  lg09='LG90LUGCG',  lg09r='LG90LUGCGR', cm='CMD1LUGCG', co='COMOLUGCG', co_kit='COMOLUGCGK'),
        'BG': dict(ar6b='ALBGBG06B', lc16='LC20BGBG', lg16='LG10BGBG', lg09='LG90LBGBG',  lg09r='LG90LBGBGR', cm='CMD1LBGBG', co='COMOLBGBG', co_kit='COMOLBGBGK'),
        'OL': dict(ar6b='ALOLOL06B', lc16='LC20OLOL', lg16='LG10OLOL', lg09='LG90LOLOL',  lg09r='LG90LOLOLR',  cm='CMD1LOLOL', co='COMOLOLOL', co_kit='COMOLOLOLK'),
    }
    for finish_label, finish_code in [
        ('Grigio Legno / Cemento Gres', 'GC'),
        ('Bianco Graffiato', 'BG'),
        ('Olmo', 'OL'),
    ]:
        _lsc = _LUISA_SC[finish_code]
        add(f'TLLUCAR6B_{finish_code}',
            f'Armadio 6 Ante Battente Luisa - {finish_label}',
            f'Luisa 6-Door Wardrobe – {finish_label}', 670, 'AR6B', supplier_code=_lsc['ar6b'])

        add(f'TLLULC16_{finish_code}',
            f'Letto Contenitore Luisa 160 c/rete - {finish_label}',
            f'Luisa Storage Bed 160 – {finish_label}', 430, 'LC16', supplier_code=_lsc['lc16'])
        add(f'TLLULG16_{finish_code}',
            f'Letto Giroletto Luisa 160 - {finish_label}',
            f'Luisa Bed Frame 160 – {finish_label}', 150, 'LG16', supplier_code=_lsc['lg16'])
        add(f'TLLULG09_{finish_code}',
            f'Letto Singolo Giroletto Luisa 90 - {finish_label}',
            f'Luisa Single Bed Frame 90 – {finish_label}', 130, 'LG09', supplier_code=_lsc['lg09'])
        add(f'TLLULG09R_{finish_code}',
            f'Letto Giroletto Luisa 90 c/rete - {finish_label}',
            f'Luisa Single Bed 90 with Slatted Base – {finish_label}', 250, 'LG09', supplier_code=_lsc['lg09r'])

        add(f'TLLUCM_{finish_code}',
            f'Comodino Luisa - {finish_label} - singolo',
            f'Luisa Bedside Table – {finish_label}', 75, 'CM', supplier_code=_lsc['cm'])
        add(f'TLLUCO_{finish_code}',
            f'Como Luisa - {finish_label}',
            f'Luisa Chest of Drawers – {finish_label}', 220, 'CO', supplier_code=_lsc['co'])
        add(f'TLLUCO_KIT_{finish_code}',
            f'Como Luisa in Kit - {finish_label}',
            f'Luisa Chest of Drawers (Kit) – {finish_label}', 130, 'CO', supplier_code=_lsc['co_kit'])

    add('TLLUSP_CR', 'Specchiera Luisa - Bordo Cromato', 'Luisa Mirror – Bordo Cromato', 50, 'SP', supplier_code='SPECC78C50')

    # Luisa compositions
    _LUISA_COMP_SC = {
        'GC': ('CLUGCG16BK', 'CLUGCG26BK', 'CLUGCG16B', 'CLUGCG26B'),
        'BG': ('CLBGBG16BK', 'CLBGBG26BK', 'CLBGBG16B', 'CLBGBG26B'),
        'OL': ('CLOLOL16BK', 'CLOLOL26BK', 'CLOLOL16B', 'CLOLOL26B'),
    }
    for finish_label, finish_code in [
        ('Grigio Legno / Cemento Gres', 'GC'),
        ('Bianco Graffiato', 'BG'),
        ('Olmo', 'OL'),
    ]:
        sc16bk, sc26bk, sc16b, sc26b = _LUISA_COMP_SC[finish_code]
        add(f'TLLUCOMP16BK_{finish_code}',
            f'Composizione Luisa 1-Door Kit - {finish_label}',
            f'Luisa Composition 1-Door Kit – {finish_label}', 930, 'COMP', weight=3.8, supplier_code=sc16bk)
        add(f'TLLUCOMP26BK_{finish_code}',
            f'Composizione Luisa 2-Door Kit - {finish_label}',
            f'Luisa Composition 2-Door Kit – {finish_label}', 1160, 'COMP', weight=4.0, supplier_code=sc26bk)
        add(f'TLLUCOMP16B_{finish_code}',
            f'Composizione Luisa 1-Door Assembled - {finish_label}',
            f'Luisa Composition 1-Door – {finish_label}', 1040, 'COMP', weight=3.8, supplier_code=sc16b)
        add(f'TLLUCOMP26B_{finish_code}',
            f'Composizione Luisa 2-Door Assembled - {finish_label}',
            f'Luisa Composition 2-Door – {finish_label}', 1270, 'COMP', weight=4.0, supplier_code=sc26b)

    # =========================================================================
    # GIULIA collection
    # =========================================================================
    for doors, arcode, price_bg, price_ol, weight in [
        (6, 'AR6B', 750, 750, 2.6),
        (5, 'AR5B', 660, 660, 2.2),
        (4, 'AR4B', 530, 530, 1.8),
        (3, 'AR3B', 440, 440, 1.5),
        (2, 'AR2B', 300, 300, 1.2),
    ]:
        add(f'TLGIAR{doors}B_BG',
            f'Armadio {doors} Ante Battente Giulia - Bianco Graffiato',
            f'Giulia {doors}-Door Wardrobe – Bianco Graffiato', price_bg, arcode, weight=weight,
            supplier_code=f'AGBGBG0{doors}B')
        add(f'TLGIAR{doors}B_OL',
            f'Armadio {doors} Ante Battente Giulia - Olmo',
            f'Giulia {doors}-Door Wardrobe – Olmo', price_ol, arcode, weight=weight,
            supplier_code=f'AGOLOL0{doors}B')

    add('TLGILG16_BG', 'Letto Giroletto Giulia 160 - Bianco Graffiato', 'Giulia Bed Frame 160 – Bianco Graffiato', 150, 'LG16', supplier_code='LG10BGBG')
    add('TLGILG16_OL', 'Letto Giroletto Giulia 160 - Olmo', 'Giulia Bed Frame 160 – Olmo', 150, 'LG16', supplier_code='LG10OLOL')
    add('TLGILC16_BG', 'Letto Contenitore Giulia 160 - Bianco Graffiato', 'Giulia Storage Bed 160 – Bianco Graffiato', 430, 'LC16', supplier_code='LC20BGBG')
    add('TLGILC16_OL', 'Letto Contenitore Giulia 160 - Olmo', 'Giulia Storage Bed 160 – Olmo', 430, 'LC16', supplier_code='LC20OLOL')

    add('TLGICM_BG', 'Comodino Giulia/Giotto - Bianco Graffiato', 'Giulia Bedside Table – Bianco Graffiato', 90, 'CM', supplier_code='CMD1GMRBGBG')
    add('TLGICM_OL', 'Comodino Giulia/Giotto - Olmo', 'Giulia Bedside Table – Olmo', 90, 'CM', supplier_code='CMD1GMROLOL')
    add('TLGICO_BG', 'Como Giulia/Giotto - Bianco Graffiato', 'Giulia Chest of Drawers – Bianco Graffiato', 250, 'CO', supplier_code='COMOGMRBGBG')
    add('TLGICO_OL', 'Como Giulia/Giotto - Olmo', 'Giulia Chest of Drawers – Olmo', 250, 'CO', supplier_code='COMOGMROLOL')
    add('TLGISP_CR', 'Specchiera Giulia - Bordo Cromato', 'Giulia Mirror – Bordo Cromato', 50, 'SP', supplier_code='SPECC78C50')

    # Giulia compositions — AR6B(2.6)+LC16(1.2)+2×CM(0.6)+CO(0.6)+SP(0.15) = 5.75
    add('TLGICOMP16B_BG',
        'Composizione Giulia 1A - Bianco Graffiato',
        'Giulia Composition – Bianco Graffiato – 1A', 1330, 'COMP', weight=3.95, supplier_code='CGBGBG16B')
    add('TLGICOMP26B_BG',
        'Composizione Giulia 2A - Bianco Graffiato',
        'Giulia Composition – Bianco Graffiato – 2A', 1560, 'COMP', weight=4.69, supplier_code='CGBGBG26B')
    add('TLGICOMPS16B_BG',
        'Composizione Giulia 1A Serigrafata - Bianco Graffiato',
        'Giulia Composition Serigrafata – Bianco Graffiato – 1A', 1440, 'COMP', weight=3.95, supplier_code='CGBGBS16B')
    add('TLGICOMPS26B_BG',
        'Composizione Giulia 2A Serigrafata - Bianco Graffiato',
        'Giulia Composition Serigrafata – Bianco Graffiato – 2A', 1670, 'COMP', weight=4.69, supplier_code='CGBGBS26B')
    add('TLGICOMP16B_OL',
        'Composizione Giulia 1A - Olmo',
        'Giulia Composition – Olmo – 1A', 1330, 'COMP', weight=3.95, supplier_code='CGOLOL16B')
    add('TLGICOMP26B_OL',
        'Composizione Giulia 2A - Olmo',
        'Giulia Composition – Olmo – 2A', 1560, 'COMP', weight=4.69, supplier_code='CGOLOL26B')
    add('TLGICOMPS16B_OL',
        'Composizione Giulia 1A Serigrafata - Olmo',
        'Giulia Composition Serigrafata – Olmo – 1A', 1440, 'COMP', weight=3.95, supplier_code='CGOLOS16B')
    add('TLGICOMPS26B_OL',
        'Composizione Giulia 2A Serigrafata - Olmo',
        'Giulia Composition Serigrafata – Olmo – 2A', 1670, 'COMP', weight=4.69, supplier_code='CGOLOS26B')

    # =========================================================================
    # ISCHIA collection
    # =========================================================================
    add('TLISAR6B_BP',   'Armadio 6 Ante Battente Ischia - Patina Beige - L.275 P.57 H.245', 'Ischia 6-Door Wardrobe – Patina Beige', 855, 'AR6B', supplier_code='AIBPBP06B')
    add('TLISAR6B_PBS',  'Armadio 6 Ante Battente Ischia - Patina Beige Serigrafata - L.275 P.57 H.245', 'Ischia 6-Door Wardrobe – Patina Beige Serigrafata', 965, 'AR6B', supplier_code='AIBPBS06B')
    add('TLISAR4B_BP',   'Armadio 4 Ante Battente Ischia - Patina Beige - L.184 P.57 H.245', 'Ischia 4-Door Wardrobe – Patina Beige', 595, 'AR4B', supplier_code='AIBPBP04B')
    add('TLISAR4B_PBS',  'Armadio 4 Ante Battente Ischia - Patina Beige Serigrafata - L.184 P.57 H.245', 'Ischia 4-Door Wardrobe – Patina Beige Serigrafata', 705, 'AR4B', supplier_code='AIBPBS04B')
    add('TLISAR2B_BP',   'Armadio 2 Ante Battente Ischia - Patina Beige - L.93 P.57 H.245', 'Ischia 2-Door Wardrobe – Patina Beige', 335, 'AR2B', supplier_code='AIBPBP02B')
    add('TLISAR2B_PBS',  'Armadio 2 Ante Battente Ischia - Patina Beige Serigrafata - L.93 P.57 H.245', 'Ischia 2-Door Wardrobe – Patina Beige Serigrafata', 445, 'AR2B', supplier_code='AIBPBS02B')

    add('TLISLG16_BP',  'Letto Giroletto Ischia 160 - Patina Beige', 'Ischia Bed Frame 160 – Patina Beige', 425, 'LG16', supplier_code='LG10IPBPB')
    add('TLISCM_BP',    'Comodino Ischia - Patina Beige', 'Ischia Bedside Table – Patina Beige', 130, 'CM', supplier_code='CMD1IPBPB')
    add('TLISCO_BP',    'Como Ischia - Patina Beige', 'Ischia Chest of Drawers – Patina Beige', 330, 'CO', supplier_code='COMOIPBPB')
    add('TLISSP_BP',    'Specchiera Ischia - Patina Beige', 'Ischia Mirror – Patina Beige', 110, 'SP', supplier_code='SPECCOPBPB')

    # Ischia composition — AR6B(2.6)+LG16(0.8)+2×CM(0.6)+CO(0.6)+SP(0.15) = 5.35
    add('TLISCOMP36B_BP',
        'Composizione Ischia 3A - Patina Beige',
        'Ischia Composition – Patina Beige – 3A', 1980, 'COMP', weight=5.35, supplier_code='CIPBPB36B')

    # =========================================================================
    # OLYMPIA collection
    # =========================================================================
    add('TLOLAR6B_BP',   'Armadio 6 Ante Battente Olympia - Patina Beige - L.275 P.57 H.245', 'Olympia 6-Door Wardrobe – Patina Beige', 870, 'AR6B', supplier_code='AOBPBP06B')
    add('TLOLAR6B_PBS',  'Armadio 6 Ante Battente Olympia - Patina Beige Serigrafata - L.275 P.57 H.245', 'Olympia 6-Door Wardrobe – Patina Beige Serigrafata', 980, 'AR6B', supplier_code='AOBPBS06B')
    add('TLOLAR4B_BP',   'Armadio 4 Ante Battente Olympia - Patina Beige - L.184 P.57 H.245', 'Olympia 4-Door Wardrobe – Patina Beige', 605, 'AR4B', supplier_code='AOBPBP04B')
    add('TLOLAR4B_PBS',  'Armadio 4 Ante Battente Olympia - Patina Beige Serigrafata - L.184 P.57 H.245', 'Olympia 4-Door Wardrobe – Patina Beige Serigrafata', 715, 'AR4B', supplier_code='AOBPBS04B')
    add('TLOLAR2B_BP',   'Armadio 2 Ante Battente Olympia - Patina Beige - L.93 P.57 H.245', 'Olympia 2-Door Wardrobe – Patina Beige', 345, 'AR2B', supplier_code='AOBPBP02B')
    add('TLOLAR2B_PBS',  'Armadio 2 Ante Battente Olympia - Patina Beige Serigrafata - L.93 P.57 H.245', 'Olympia 2-Door Wardrobe – Patina Beige Serigrafata', 445, 'AR2B', supplier_code='AOBPBS02B')

    add('TLOLLG16_BP',  'Letto Giroletto Olympia 160 - Patina Beige', 'Olympia Bed Frame 160 – Patina Beige', 440, 'LG16', supplier_code='LG10OPBPB')
    add('TLOLCM_BP',    'Comodino Olympia - Patina Beige', 'Olympia Bedside Table – Patina Beige', 135, 'CM', supplier_code='CMD1OPBPB')
    add('TLOLCO_BP',    'Como Olympia - Patina Beige', 'Olympia Chest of Drawers – Patina Beige', 340, 'CO', supplier_code='COMOOPBPB')
    add('TLOLSP_BP',    'Specchiera Olympia - Patina Beige', 'Olympia Mirror – Patina Beige', 110, 'SP', supplier_code='SPECCOPBPB')

    # Olympia composition — AR6B(2.6)+LG16(0.8)+2×CM(0.6)+CO(0.6)+SP(0.15) = 5.35
    add('TLOCOMP36B_PBS',
        'Composizione Olympia 3A Serigrafata - Patina Beige Serigrafata',
        'Olympia Composition Serigrafata – Patina Beige Serigrafata – 3A', 2140, 'COMP', weight=5.35, supplier_code='COPBPS36B')

    # =========================================================================
    # VANESSA collection
    # =========================================================================
    # 2A sliding wardrobe — weight 3.5
    add('TLVAAR2S_RG_BN',
        'Armadio 2 Ante Scorrevole Vanessa - Rovere Grigio / Bianco Neve',
        'Vanessa 2-Door Sliding Wardrobe – Rovere Grigio / Bianco Neve', 1300, 'AR2S', supplier_code='AVRGBNS02S')

    add('TLVALC16_RG_BN',
        'Letto Contenitore Vanessa 160 - Rovere Grigio / Bianco Neve',
        'Vanessa Storage Bed 160 – Rovere Grigio / Bianco Neve', 890, 'LC16', supplier_code='LC20VRGBN')
    add('TLVALB16_RG_BN',
        'Letto Box Vanessa 160 - Rovere Grigio / Bianco Neve',
        'Vanessa Box Bed 160 – Rovere Grigio / Bianco Neve', 590, 'LB16', supplier_code='LC30VRGBN')
    add('TLVACM_RG_BN',
        'Comodino Vanessa - Rovere Grigio / Bianco Neve',
        'Vanessa Bedside Table – Rovere Grigio / Bianco Neve', 190, 'CM', supplier_code='CMD1VRGBN')
    add('TLVACO_RG_BN',
        'Como Vanessa - Rovere Grigio / Bianco Neve',
        'Vanessa Chest of Drawers – Rovere Grigio / Bianco Neve', 440, 'CO', supplier_code='COMOVRGBN')
    add('TLVASP_RG_BN',
        'Specchiera Vanessa - Rovere Grigio / Bianco Neve',
        'Vanessa Mirror – Rovere Grigio / Bianco Neve', 80, 'SP', supplier_code='SPECCVRGBN')

    # Vanessa composition — AR2S(3.5)+LC16(1.2)+2×CM(0.6)+CO(0.6)+SP(0.15) = 6.65
    add('TLVACOMP22S_RG_BN',
        'Composizione Vanessa 2A Scorrevole - Rovere Grigio / Bianco Neve',
        'Vanessa Composition – Rovere Grigio / Bianco Neve – 2A Sliding', 3090, 'COMP', weight=6.65, supplier_code='CVRGBNS22S')

    # =========================================================================
    # TIFFANY collection
    # =========================================================================
    # 3A sliding wardrobe — weight 4.5
    add('TLTFAR3S_BN_BSG',
        'Armadio 3 Ante Scorrevole Tiffany - Bianco Neve Serigrafata Glitter',
        'Tiffany 3-Door Sliding Wardrobe – Bianco Neve Serigrafata Glitter', 1300, 'AR3S', supplier_code='ATFBSS03S')

    add('TLTFLC16_BN_BSG',
        'Letto Contenitore Tiffany 160 - Bianco Neve Serigrafata Glitter',
        'Tiffany Storage Bed 160 – Bianco Neve Serigrafata Glitter', 760, 'LC16', supplier_code='LG20TFBS')
    add('TLTFLB16_BN_BSG',
        'Letto Box Tiffany 160 - Bianco Neve Serigrafata Glitter',
        'Tiffany Box Bed 160 – Bianco Neve Serigrafata Glitter', 420, 'LB16', supplier_code='LG30TFBS')
    add('TLTFCM_BN_BSG',
        'Comodino Tiffany - Bianco Neve Serigrafata Glitter',
        'Tiffany Bedside Table – Bianco Neve Serigrafata Glitter', 170, 'CM', supplier_code='CMD1TFBS')
    add('TLTFCO_BN_BSG',
        'Como Tiffany - Bianco Neve Serigrafata Glitter',
        'Tiffany Chest of Drawers – Bianco Neve Serigrafata Glitter', 400, 'CO', supplier_code='COMOTFBS')
    add('TLTFSP_BN_BSG',
        'Specchiera Tiffany - Bianco Neve Serigrafata Glitter',
        'Tiffany Mirror – Bianco Neve Serigrafata Glitter', 80, 'SP', supplier_code='SPECCTFBS')

    # Tiffany composition — AR3S(4.5)+LC16(1.2)+2×CM(0.6)+CO(0.6)+SP(0.15) = 7.65
    add('TLTFCOMP23S_BN_BSG',
        'Composizione Tiffany 3A Scorrevole - Bianco Neve Serigrafata Glitter',
        'Tiffany Composition – Bianco Neve Serigrafata Glitter – 3A Sliding', 2880, 'COMP', weight=7.65, supplier_code='CTFBSS23S')

    # =========================================================================
    # EMMA collection  (wardrobes only — beds shared with Zoe, not duplicated)
    # =========================================================================
    add('TLEMAR2S_NB_CG',
        'Armadio 2 Ante Scorrevole Emma - Noce Brunito / Cemento Gres',
        'Emma 2-Door Sliding Wardrobe – Noce Brunito / Cemento Gres', 1100, 'AR2S', supplier_code='AENBCGS02S')
    add('TLEMAR2S_GL_TC',
        'Armadio 2 Ante Scorrevole Emma - Grigio Legno / Talco',
        'Emma 2-Door Sliding Wardrobe – Grigio Legno / Talco', 1100, 'AR2S', supplier_code='AEGLTCS02S')
    add('TLEMAR2S_NB_TC',
        'Armadio 2 Ante Scorrevole Emma - Noce Brunito / Talco',
        'Emma 2-Door Sliding Wardrobe – Noce Brunito / Talco', 1100, 'AR2S', supplier_code='AENBTCS02S')
    add('TLEMAR2S_GL_CG',
        'Armadio 2 Ante Scorrevole Emma - Grigio Legno / Cemento Gres',
        'Emma 2-Door Sliding Wardrobe – Grigio Legno / Cemento Gres', 1100, 'AR2S', supplier_code='AEGLCGS02S')

    # Emma compositions — AR2S(3.5)+LC16(1.2)+2×CM(0.6)+CO(0.6)+SP(0.15) = 6.65
    add('TLEMCOMP22S_NB_CG',
        'Composizione Emma 2A Scorrevole - Noce Brunito / Cemento Gres',
        'Emma Composition – Noce Brunito / Cemento Gres – 2A Sliding', 2760, 'COMP', weight=6.65, supplier_code='CENBCGS22S')
    add('TLEMCOMP22S_GL_TC',
        'Composizione Emma 2A Scorrevole - Grigio Legno / Talco',
        'Emma Composition – Grigio Legno / Talco – 2A Sliding', 2435, 'COMP', weight=6.65, supplier_code='CEGLTCS22S')

    # =========================================================================
    # OPTIONALS (shared across ranges)
    # =========================================================================
    # optionals: (item_code, supplier_code, italian_desc, english_name, price_eur, weight_factor)
    optionals = [
        # ── Internal Drawer Units (Cassettiera) ─────────────────────────────────
        ('TLOPTARCA0BS',    'OPARCA0BS',    'Cassettiera 2 cassetti finitura tessuto - L.82.4 P.45 H.46',                          'Internal Wardrobe Drawer Unit 2-Drawer – Fabric',     135, 0.1),
        ('TLOPTARCA01BL',   'OPARCA01BL',   'Cassettiera 2 cassetti finitura bianco - L.77.4 P.41.5 H.46',                         'Internal Wardrobe Drawer Unit 2-Drawer – Luisa',      115, 0.1),
        ('TLOPTOARCANCTBS', 'OPARCANCTBS',  'Cassettiera 3 cassetti finitura tessuto - L.89 P.45 H.67',                            'Internal Wardrobe Drawer Unit 3-Drawer – Fabric',     210, 0.1),
        # ── Internal Wardrobe Mirrors ────────────────────────────────────────────
        ('TLOPTOPARNCSP01B','OPARNCSP01B',  'Specchio interno x1 - armadio 6A Nicole - L.45 P.0.3 H.243',                         'Internal Wardrobe Mirror ×1 – Nicole 6A',              60, 0.1),
        ('TLOPTOPARNCSP02B','OPARNCSP02B',  'Specchi interni x2 - armadio 6A Nicole - L.45 P.0.3 H.243',                          'Internal Wardrobe Mirrors ×2 – Nicole 6A',            120, 0.1),
        ('TLOPTOPARGSP01B', 'OPARGSP01B',   'Specchio interno x1 - armadio 6A Giulia/Giotto - L.42 P.0.3 H.234',                  'Internal Wardrobe Mirror ×1 – Giulia 6A',              50, 0.1),
        ('TLOPTOPARGSP02B', 'OPARGSP02B',   'Specchi interni x2 - armadio 6A Giulia/Giotto - L.42 P.0.3 H.234',                   'Internal Wardrobe Mirrors ×2 – Giulia 6A',            110, 0.1),
        ('TLOPTOPARLSP02B', 'OPARLSP02B',   'Specchi interni x2 - armadio 6A Luisa - L.39 P.0.3 H.234',                           'Internal Wardrobe Mirrors ×2 – Luisa 6A',             110, 0.1),
        # ── Additional Wardrobe Shelves (Ripiani aggiuntivi) ─────────────────────
        ('TLOPTOPARRI06BL', 'OPARRI06BL',   'Ripiani armadio 6A Luisa - set 3 ripiani - L.77.6 P.46.5 H.2.2',                    'Additional Wardrobe Shelves – Set of 3, Luisa',       100, 0.1),
        ('TLOPTOPARRI06B',  'OPARRI06B',    'Ripiani armadio 6A/4A/2A - set 3 ripiani - L.83.4 P.48.8 H.2.2',                    'Additional Wardrobe Shelves – Set of 3, battente',    100, 0.1),
        ('TLOPTOPARRI02SV', 'OPARRI02SV',   'Ripiani armadio 2A scorrevole Vanessa - set 2 ripiani - L.124.7 P.49.3 H.3',         'Additional Wardrobe Shelves – Set of 2, Vanessa',     120, 0.1),
        ('TLOPTOPARRI02SE', 'OPARRI02SE',   'Ripiani armadio 2A scorrevole Emma - set 2 ripiani - L.124.7 P.49.3 H.2.2',          'Additional Wardrobe Shelves – Set of 2, Emma',        100, 0.1),
        ('TLOPTOPARRI03BS', 'OPARRI03BS',   'Ripiano armadio Nicole/Tiffany - 1 ripiano - L.89 P.50 H.3',                         'Additional Wardrobe Shelf – Single, Nicole/Tiffany',   60, 0.1),
        ('TLOPTOPARRI01BNC','OPARRI01BNC',  'Ripiano armadio 1A battente Nicole - L.43.6 P.50 H.3',                               'Additional Wardrobe Shelf – Single 1A, Nicole',        40, 0.1),
        ('TLOPTOPARRI01BZGG','OPARRI01BZGG','Ripiano armadio 1A battente Zoe/Giulia/Giotto - L.40.8 P.48.8 H.2.2',                'Additional Wardrobe Shelf – Single 1A, Zoe/Giulia',    30, 0.1),
        # ── Sliding Wardrobe Internal Kit ────────────────────────────────────────
        ('TLOPTOPARKITO2ST','OPARKIT02ST',  'Kit armadio 2A scorrevole - set con 2 ripiani e tramezzo - L.42 P.49.2 H.112.5',    'Sliding Wardrobe Internal Kit (2 shelves + divider)', 100, 0.1),
        # ── Wardrobe Valet Stand ──────────────────────────────────────────────────
        ('TLOPTSERB',       'OPARSERVB',    'Servetto per armadi battenti - 1 pz',                                                 'Wardrobe Valet Stand',                                 35, 0.1),
        # ── Headboard Cushions (Zoe/Emma letto legno only) ────────────────────────
        ('TLOPTLCCG02',     'OPTLCCG02',    'Coppia cuscini testiera letto - finitura nabuk colore grigio - L.90 P.10 H.50',       'Headboard Cushion Pair – Nabuk Grey',                 130, 0.1),
        ('TLOPTLCCB02',     'OPTLCCB02',    'Coppia cuscini testiera letto - finitura nabuk colore beige - L.90 P.10 H.50',        'Headboard Cushion Pair – Nabuk Beige',                130, 0.1),
        # ── Headboard Strip (Zoe/Emma letto legno only) ──────────────────────────
        ('TLOPTFASCTC01',   'OPFASCTTC01',  'Fascia testiera letto legno Zoe/Emma - finitura Talco - L.100 P.1.2 H.12',           'Headboard Strip – Talco',                              20, 0.1),
        ('TLOPTFASCCG01',   'OPFASCTCG01',  'Fascia testiera letto legno Zoe/Emma - finitura Cemento Gres - L.100 P.1.2 H.12',    'Headboard Strip – Cemento Gres',                       20, 0.1),
        # ── Comodino Top Panel (Zoe/Emma) ─────────────────────────────────────────
        ('TLOPTOPCMDTC',    'OPTOPCMDTC',   'Top aggiuntivo comodino Zoe/Emma - finitura Talco - L.53 P.39 H.1.2',                'Comodino Top Panel – Talco',                           10, 0.1),
        ('TLOPTOPCMDCG',    'OPTOPCMDCG',   'Top aggiuntivo comodino Zoe/Emma - finitura Cemento Gres - L.53 P.39 H.1.2',         'Comodino Top Panel – Cemento Gres',                    10, 0.1),
        ('TLOPTOPCMDNB',    'OPTOPCMDNB',   'Top aggiuntivo comodino Zoe/Emma - finitura Noce Brunito - L.53 P.39 H.1.2',         'Comodino Top Panel – Noce Brunito',                    10, 0.1),
        ('TLOPTOPCMDGL',    'OPTOPCMDGL',   'Top aggiuntivo comodino Zoe/Emma - finitura Grigio Legno - L.53 P.39 H.1.2',         'Comodino Top Panel – Grigio Legno',                    10, 0.1),
        # ── Comò Top Panel (Zoe/Emma) ─────────────────────────────────────────────
        ("TLOPTOPCOMTC",    'OPTOPCOMOTC',  "Top aggiuntivo comò Zoe/Emma - finitura Talco - L.117 P.46 H.1.2",                  "Comò Top Panel – Talco",                               20, 0.1),
        ("TLOPTOPCOMCG",    'OPTOPCOMOCG',  "Top aggiuntivo comò Zoe/Emma - finitura Cemento Gres - L.117 P.46 H.1.2",           "Comò Top Panel – Cemento Gres",                        20, 0.1),
        ("TLOPTOPCOMNB",    'OPTOPCOMONB',  "Top aggiuntivo comò Zoe/Emma - finitura Noce Brunito - L.117 P.46 H.1.2",           "Comò Top Panel – Noce Brunito",                        20, 0.1),
        ("TLOPTOPCOMGL",    'OPTOPCOMOGL',  "Top aggiuntivo comò Zoe/Emma - finitura Grigio Legno - L.117 P.46 H.1.2",           "Comò Top Panel – Grigio Legno",                        20, 0.1),
        # ── Furniture Handles: comodino (weight=0.0) ──────────────────────────────
        ('TLOPTCMDMDFSG',   'M01CMDMDFSG',  'Maniglia MDF stretta colore grigio comodino - 1 pz',                                 'Comodino Handle – MDF Narrow Grey',                    10, 0.0),
        ('TLOPTCMDMDFLN',   'M01CMDMDFLN',  'Maniglia MDF larga colore noce brunito comodino - 1 pz',                             'Comodino Handle – MDF Wide Noce Brunito',              12, 0.0),
        ('TLOPTCMDMDFLG',   'M01CMDMDFLG',  'Maniglia MDF larga colore grigio comodino - 1 pz',                                   'Comodino Handle – MDF Wide Grey',                      12, 0.0),
        ('TLOPTCMDMETG',    'M01CMDMETG',   'Maniglia metallo colore grigio comodino - 1 pz',                                     'Comodino Handle – Metal Grey',                         25, 0.0),
        # ── Furniture Handles: comò (weight=0.0) ──────────────────────────────────
        ("TLOPTCOMOMDFSG",  'M02COMOMDFSG', "Maniglie MDF stretta colore grigio comò - conf. 2 pz",                               "Comò Handle – MDF Narrow Grey (pack of 2)",            15, 0.0),
        ("TLOPTCOMOMDFLN",  'M02COMOMDFLN', "Maniglie MDF larga colore noce brunito comò - conf. 2 pz",                           "Comò Handle – MDF Wide Noce Brunito (pack of 2)",      18, 0.0),
        ("TLOPTCOMOMDFLG",  'M02COMOMDFLG', "Maniglie MDF larga colore grigio comò - conf. 2 pz",                                 "Comò Handle – MDF Wide Grey (pack of 2)",              18, 0.0),
        ("TLOPTCOMOMETG",   'M02COMOMETG',  "Maniglie metallo colore grigio comò - conf. 2 pz",                                   "Comò Handle – Metal Grey (pack of 2)",                 50, 0.0),
    ]
    for code, supp_code, italian, english, price, weight in optionals:
        add(code, italian, english, price, 'OPT', weight=weight, supplier_code=supp_code)

    return items


TOPLINE_ITEMS = _build_items()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_dependencies():
    """Create Item Group, Brand and Supplier if they do not exist."""
    if not frappe.db.exists("Item Group", ITEM_GROUP):
        parent = frappe.db.get_value("Item Group", "Lorella Collection", "parent_item_group") or "All Item Groups"
        frappe.db.sql("""
            INSERT INTO `tabItem Group`
            (name, item_group_name, parent_item_group, is_group,
             modified, modified_by, owner, creation, docstatus, idx)
            VALUES
            (%(n)s, %(n)s, %(p)s, 0,
             NOW(), 'Administrator', 'Administrator', NOW(), 0, 0)
        """, {"n": ITEM_GROUP, "p": parent})
        print(f"Created Item Group: {ITEM_GROUP}")

    if not frappe.db.exists("Brand", BRAND):
        frappe.db.sql("""
            INSERT INTO `tabBrand`
            (name, brand, modified, modified_by, owner, creation, docstatus, idx)
            VALUES
            (%(b)s, %(b)s, NOW(), 'Administrator', 'Administrator', NOW(), 0, 0)
        """, {"b": BRAND})
        print(f"Created Brand: {BRAND}")

    if not frappe.db.exists("Supplier", SUPPLIER):
        frappe.db.sql("""
            INSERT INTO `tabSupplier`
            (name, supplier_name, supplier_group, country,
             modified, modified_by, owner, creation, docstatus, idx)
            VALUES
            (%(s)s, %(s)s, 'All Supplier Groups', 'Italy',
             NOW(), 'Administrator', 'Administrator', NOW(), 0, 0)
        """, {"s": SUPPLIER})
        print(f"Created Supplier: {SUPPLIER}")

    frappe.db.commit()


# ---------------------------------------------------------------------------
# EXECUTE
# ---------------------------------------------------------------------------

def execute():
    _ensure_dependencies()

    # ── Price list ──
    if not frappe.db.exists("Price List", PRICE_LIST_NAME):
        frappe.get_doc({
            "doctype": "Price List",
            "price_list_name": PRICE_LIST_NAME,
            "currency": "EUR",
            "buying": 1,
            "selling": 0,
            "cm_configurator_type": "Topline Bedrooms",
        }).insert(ignore_permissions=True)
        frappe.db.commit()
        print(f"Created Price List: {PRICE_LIST_NAME}")
    else:
        frappe.db.set_value("Price List", PRICE_LIST_NAME, "cm_configurator_type", "Topline Bedrooms")

    # ── Counters ──
    meta_inserted = meta_updated = meta_skipped = 0
    price_created = price_updated = price_ok = 0
    corrections = []
    errors = []

    total_items = len(TOPLINE_ITEMS)
    print(f"\nTopline Bedrooms — Listino Import")
    print(f"Items to process: {total_items}")
    print(f"Price list: {PRICE_LIST_NAME}")

    # ── Pass 1: Item master ──
    for code, data in TOPLINE_ITEMS.items():
        try:
            if frappe.db.exists("Item", code):
                doc = frappe.get_doc("Item", code)
                doc.item_group = ITEM_GROUP
                doc.brand = BRAND
                doc.cm_supplier_name = SUPPLIER
                doc.cm_supplier_item_code = data.get('supplier_code', code)
                doc.cm_supplier_item_name = data['italian']
                doc.cm_weight_factor = data['weight']
                doc.cm_vat_rate_percent = 18.0
                doc.cm_pricing_rounding_mode = "whole_euro_roundup"
                doc.is_stock_item = 0
                doc.is_purchase_item = 1
                doc.is_sales_item = 0

                existing = [r for r in doc.supplier_items if r.supplier == SUPPLIER]
                if existing:
                    existing[0].supplier_part_no = data.get('supplier_code', code)
                else:
                    doc.append("supplier_items", {
                        "supplier": SUPPLIER,
                        "supplier_part_no": data.get('supplier_code', code),
                    })
                doc.save(ignore_permissions=True)
                meta_updated += 1

            else:
                frappe.get_doc({
                    "doctype": "Item",
                    "item_code": code,
                    "item_name": data['english'],
                    "description": data['english'],
                    "item_group": ITEM_GROUP,
                    "stock_uom": "EA",
                    "is_stock_item": 0,
                    "is_purchase_item": 1,
                    "is_sales_item": 0,
                    "brand": BRAND,
                    "disabled": 0,
                    "cm_supplier_name": SUPPLIER,
                    "cm_supplier_item_code": data.get('supplier_code', code),
                    "cm_supplier_item_name": data['italian'],
                    "cm_weight_factor": data['weight'],
                    "cm_vat_rate_percent": 18.0,
                    "cm_pricing_rounding_mode": "whole_euro_roundup",
                    "supplier_items": [{
                        "supplier": SUPPLIER,
                        "supplier_part_no": data.get('supplier_code', code),
                    }],
                }).insert(ignore_permissions=True)
                meta_inserted += 1

        except Exception as e:
            errors.append(f"[META] {code}: {str(e)}")
            meta_skipped += 1

    frappe.db.commit()

    # ── Pass 2: Item prices ──
    for code, data in TOPLINE_ITEMS.items():
        price = data['price']
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
                    "price_list_rate": price,
                    "buying": 1,
                    "selling": 0,
                }).insert(ignore_permissions=True)
                price_created += 1
            else:
                existing_rate = float(existing_prices[0]["price_list_rate"])
                if existing_rate != price:
                    pd = frappe.get_doc("Item Price", existing_prices[0]["name"])
                    pd.price_list_rate = price
                    pd.save(ignore_permissions=True)
                    price_updated += 1
                    corrections.append(f"[PRICE CORRECTED] {code}: was €{existing_rate}, now €{price}")
                else:
                    price_ok += 1
        except Exception as e:
            errors.append(f"[PRICE] {code}: {str(e)}")

    frappe.db.commit()

    # ── Summary ──
    topline_after = frappe.db.sql(
        "SELECT COUNT(*) FROM tabItem WHERE item_group = %s", ITEM_GROUP
    )[0][0]

    print(f"\n{'='*65}")
    print(f"  Topline Bedrooms — Listino Import")
    print(f"{'='*65}")
    print(f"\n  ITEM MASTER  (item_group = '{ITEM_GROUP}')")
    print(f"    Newly created   : {meta_inserted}")
    print(f"    Updated         : {meta_updated}")
    print(f"    Errors/skipped  : {meta_skipped}")
    print(f"    Total in group  : {topline_after}")
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
    print(f"{'='*65}\n")

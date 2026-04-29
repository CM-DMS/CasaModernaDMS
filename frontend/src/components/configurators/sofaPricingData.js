// sofaPricingData.js
// Auto-generated from sofa_pricing_complete.xlsx
// Contains: 51 models, 5 fabric ranges (109 real colours), 204 base prices, option prices
// VAT rate: 18% (sofas) / 17% (storage pouffe)

export const SOFA_GROUPS = [
  { key: 'LINEAR',   label: 'Linear',        description: '2 & 3 Seater Sofas' },
  { key: 'CHAISE',   label: 'Chaise Lounge', description: 'With Extended Seat' },
  { key: 'CORNER_2', label: 'Corner (2×)',   description: '2-Module Corner Sofas' },
];

export const SOFA_MODELS = {
  // ── Linear ──────────────────────────────────────────────────────────────
  'AMANDA_ELECTRIC_RECLINER': {
    modelKey: 'AMANDA_ELECTRIC_RECLINER', displayName: 'Amanda Electric Recliner',
    family: 'Amanda', type: 'Electric Recliner', group: 'LINEAR',
    sizeVariant: null, seatModules: null, seatWidthCm: null,
    requiresOrientation: false, isElectricRecliner: true,
  },
  'CLARA_TWO_SEATER': {
    modelKey: 'CLARA_TWO_SEATER', displayName: 'Clara Two Seater',
    family: 'Clara', type: 'Two Seater', group: 'LINEAR',
    sizeVariant: null, seatModules: null, seatWidthCm: null,
    requiresOrientation: false, isElectricRecliner: false,
  },
  'CLARA_THREE_SEATER': {
    modelKey: 'CLARA_THREE_SEATER', displayName: 'Clara Three Seater',
    family: 'Clara', type: 'Three Seater', group: 'LINEAR',
    sizeVariant: null, seatModules: null, seatWidthCm: null,
    requiresOrientation: false, isElectricRecliner: false,
  },
  'CLARA_TWO_THREE_SEATER_OFFER': {
    modelKey: 'CLARA_TWO_THREE_SEATER_OFFER', displayName: 'Clara Set – 2 + 3 Seater',
    family: 'Clara', type: 'Set Offer', group: 'LINEAR',
    sizeVariant: '2 + 3 Seater', seatModules: 5, seatWidthCm: null,
    requiresOrientation: false, isElectricRecliner: false,
  },
  'PRIMO_TWO_SEATER_2X61CM': {
    modelKey: 'PRIMO_TWO_SEATER_2X61CM', displayName: 'Primo Two Seater (2×61cm)',
    family: 'Primo', type: 'Two Seater', group: 'LINEAR',
    sizeVariant: '2×61cm', seatModules: 2, seatWidthCm: 61,
    requiresOrientation: false, isElectricRecliner: false,
  },
  'PRIMO_THREE_SEATER_2X71CM': {
    modelKey: 'PRIMO_THREE_SEATER_2X71CM', displayName: 'Primo Three Seater (2×71cm)',
    family: 'Primo', type: 'Three Seater', group: 'LINEAR',
    sizeVariant: '2×71cm', seatModules: 2, seatWidthCm: 71,
    requiresOrientation: false, isElectricRecliner: false,
  },
  'TALENTO_TWO_SEATER_2X61CM': {
    modelKey: 'TALENTO_TWO_SEATER_2X61CM', displayName: 'Talento Two Seater (2×61cm)',
    family: 'Talento', type: 'Two Seater', group: 'LINEAR',
    sizeVariant: '2×61cm', seatModules: 2, seatWidthCm: 61,
    requiresOrientation: false, isElectricRecliner: false,
  },
  'TALENTO_THREE_SEATER_2X71CM': {
    modelKey: 'TALENTO_THREE_SEATER_2X71CM', displayName: 'Talento Three Seater (2×71cm)',
    family: 'Talento', type: 'Three Seater', group: 'LINEAR',
    sizeVariant: '2×71cm', seatModules: 2, seatWidthCm: 71,
    requiresOrientation: false, isElectricRecliner: false,
  },
  'ISABEL_TWO_SEATER_2X61CM': {
    modelKey: 'ISABEL_TWO_SEATER_2X61CM', displayName: 'Isabel Two Seater (2×61cm)',
    family: 'Isabel', type: 'Two Seater', group: 'LINEAR',
    sizeVariant: '2×61cm', seatModules: 2, seatWidthCm: 61,
    requiresOrientation: false, isElectricRecliner: false,
  },
  'ISABEL_THREE_SEATER_2X71CM': {
    modelKey: 'ISABEL_THREE_SEATER_2X71CM', displayName: 'Isabel Three Seater (2×71cm)',
    family: 'Isabel', type: 'Three Seater', group: 'LINEAR',
    sizeVariant: '2×71cm', seatModules: 2, seatWidthCm: 71,
    requiresOrientation: false, isElectricRecliner: false,
  },
  'MELISSA_TWO_SEATER_2X61CM': {
    modelKey: 'MELISSA_TWO_SEATER_2X61CM', displayName: 'Melissa Two Seater (2×61cm)',
    family: 'Melissa', type: 'Two Seater', group: 'LINEAR',
    sizeVariant: '2×61cm', seatModules: 2, seatWidthCm: 61,
    requiresOrientation: false, isElectricRecliner: false,
  },
  'MELISSA_THREE_SEATER_2X71CM': {
    modelKey: 'MELISSA_THREE_SEATER_2X71CM', displayName: 'Melissa Three Seater (2×71cm)',
    family: 'Melissa', type: 'Three Seater', group: 'LINEAR',
    sizeVariant: '2×71cm', seatModules: 2, seatWidthCm: 71,
    requiresOrientation: false, isElectricRecliner: false,
  },
  'VIOLA_TWO_SEATER_2X61CM': {
    modelKey: 'VIOLA_TWO_SEATER_2X61CM', displayName: 'Viola Two Seater (2×61cm)',
    family: 'Viola', type: 'Two Seater', group: 'LINEAR',
    sizeVariant: '2×61cm', seatModules: 2, seatWidthCm: 61,
    requiresOrientation: false, isElectricRecliner: false,
  },
  'VIOLA_THREE_SEATER_2X71CM': {
    modelKey: 'VIOLA_THREE_SEATER_2X71CM', displayName: 'Viola Three Seater (2×71cm)',
    family: 'Viola', type: 'Three Seater', group: 'LINEAR',
    sizeVariant: '2×71cm', seatModules: 2, seatWidthCm: 71,
    requiresOrientation: false, isElectricRecliner: false,
  },
  'MILANO_TWO_SEATER_2X61CM': {
    modelKey: 'MILANO_TWO_SEATER_2X61CM', displayName: 'Milano Two Seater (2×61cm)',
    family: 'Milano', type: 'Two Seater', group: 'LINEAR',
    sizeVariant: '2×61cm', seatModules: 2, seatWidthCm: 61,
    requiresOrientation: false, isElectricRecliner: false,
  },
  'MILANO_THREE_SEATER_2X71CM': {
    modelKey: 'MILANO_THREE_SEATER_2X71CM', displayName: 'Milano Three Seater (2×71cm)',
    family: 'Milano', type: 'Three Seater', group: 'LINEAR',
    sizeVariant: '2×71cm', seatModules: 2, seatWidthCm: 71,
    requiresOrientation: false, isElectricRecliner: false,
  },

  // ── Chaise Lounge ────────────────────────────────────────────────────────
  'PRIMO_CHAISE_LOUNGE_2X61CM': {
    modelKey: 'PRIMO_CHAISE_LOUNGE_2X61CM', displayName: 'Primo Chaise Lounge (2×61cm)',
    family: 'Primo', type: 'Chaise Lounge', group: 'CHAISE',
    sizeVariant: '2×61cm', seatModules: 2, seatWidthCm: 61,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'PRIMO_CHAISE_LOUNGE_2X71CM': {
    modelKey: 'PRIMO_CHAISE_LOUNGE_2X71CM', displayName: 'Primo Chaise Lounge (2×71cm)',
    family: 'Primo', type: 'Chaise Lounge', group: 'CHAISE',
    sizeVariant: '2×71cm', seatModules: 2, seatWidthCm: 71,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'TALENTO_CHAISE_LOUNGE_2X61CM': {
    modelKey: 'TALENTO_CHAISE_LOUNGE_2X61CM', displayName: 'Talento Chaise Lounge (2×61cm)',
    family: 'Talento', type: 'Chaise Lounge', group: 'CHAISE',
    sizeVariant: '2×61cm', seatModules: 2, seatWidthCm: 61,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'TALENTO_CHAISE_LOUNGE_2X71CM': {
    modelKey: 'TALENTO_CHAISE_LOUNGE_2X71CM', displayName: 'Talento Chaise Lounge (2×71cm)',
    family: 'Talento', type: 'Chaise Lounge', group: 'CHAISE',
    sizeVariant: '2×71cm', seatModules: 2, seatWidthCm: 71,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'ISABEL_CHAISE_LOUNGE_2X61CM': {
    modelKey: 'ISABEL_CHAISE_LOUNGE_2X61CM', displayName: 'Isabel Chaise Lounge (2×61cm)',
    family: 'Isabel', type: 'Chaise Lounge', group: 'CHAISE',
    sizeVariant: '2×61cm', seatModules: 2, seatWidthCm: 61,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'ISABEL_CHAISE_LOUNGE_2X71CM': {
    modelKey: 'ISABEL_CHAISE_LOUNGE_2X71CM', displayName: 'Isabel Chaise Lounge (2×71cm)',
    family: 'Isabel', type: 'Chaise Lounge', group: 'CHAISE',
    sizeVariant: '2×71cm', seatModules: 2, seatWidthCm: 71,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'MELISSA_CHAISE_LOUNGE_2X61CM': {
    modelKey: 'MELISSA_CHAISE_LOUNGE_2X61CM', displayName: 'Melissa Chaise Lounge (2×61cm)',
    family: 'Melissa', type: 'Chaise Lounge', group: 'CHAISE',
    sizeVariant: '2×61cm', seatModules: 2, seatWidthCm: 61,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'MELISSA_CHAISE_LOUNGE_2X71CM': {
    modelKey: 'MELISSA_CHAISE_LOUNGE_2X71CM', displayName: 'Melissa Chaise Lounge (2×71cm)',
    family: 'Melissa', type: 'Chaise Lounge', group: 'CHAISE',
    sizeVariant: '2×71cm', seatModules: 2, seatWidthCm: 71,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'VIOLA_CHAISE_LOUNGE_2X61CM': {
    modelKey: 'VIOLA_CHAISE_LOUNGE_2X61CM', displayName: 'Viola Chaise Lounge (2×61cm)',
    family: 'Viola', type: 'Chaise Lounge', group: 'CHAISE',
    sizeVariant: '2×61cm', seatModules: 2, seatWidthCm: 61,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'VIOLA_CHAISE_LOUNGE_2X71CM': {
    modelKey: 'VIOLA_CHAISE_LOUNGE_2X71CM', displayName: 'Viola Chaise Lounge (2×71cm)',
    family: 'Viola', type: 'Chaise Lounge', group: 'CHAISE',
    sizeVariant: '2×71cm', seatModules: 2, seatWidthCm: 71,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'MILANO_CHAISE_LOUNGE_2X61CM': {
    modelKey: 'MILANO_CHAISE_LOUNGE_2X61CM', displayName: 'Milano Chaise Lounge (2×61cm)',
    family: 'Milano', type: 'Chaise Lounge', group: 'CHAISE',
    sizeVariant: '2×61cm', seatModules: 2, seatWidthCm: 61,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'MILANO_CHAISE_LOUNGE_2X71CM': {
    modelKey: 'MILANO_CHAISE_LOUNGE_2X71CM', displayName: 'Milano Chaise Lounge (2×71cm)',
    family: 'Milano', type: 'Chaise Lounge', group: 'CHAISE',
    sizeVariant: '2×71cm', seatModules: 2, seatWidthCm: 71,
    requiresOrientation: true, isElectricRecliner: false,
  },

  // ── Corner (2×) ──────────────────────────────────────────────────────────
  'PRIMO_CORNER_2X61CM': {
    modelKey: 'PRIMO_CORNER_2X61CM', displayName: 'Primo Corner (2×61cm)',
    family: 'Primo', type: 'Corner', group: 'CORNER_2',
    sizeVariant: '2×61cm', seatModules: 2, seatWidthCm: 61,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'PRIMO_CORNER_2X71CM': {
    modelKey: 'PRIMO_CORNER_2X71CM', displayName: 'Primo Corner (2×71cm)',
    family: 'Primo', type: 'Corner', group: 'CORNER_2',
    sizeVariant: '2×71cm', seatModules: 2, seatWidthCm: 71,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'TALENTO_CORNER_2X61CM': {
    modelKey: 'TALENTO_CORNER_2X61CM', displayName: 'Talento Corner (2×61cm)',
    family: 'Talento', type: 'Corner', group: 'CORNER_2',
    sizeVariant: '2×61cm', seatModules: 2, seatWidthCm: 61,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'TALENTO_CORNER_2X71CM': {
    modelKey: 'TALENTO_CORNER_2X71CM', displayName: 'Talento Corner (2×71cm)',
    family: 'Talento', type: 'Corner', group: 'CORNER_2',
    sizeVariant: '2×71cm', seatModules: 2, seatWidthCm: 71,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'ISABEL_CORNER_2X61CM': {
    modelKey: 'ISABEL_CORNER_2X61CM', displayName: 'Isabel Corner (2×61cm)',
    family: 'Isabel', type: 'Corner', group: 'CORNER_2',
    sizeVariant: '2×61cm', seatModules: 2, seatWidthCm: 61,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'ISABEL_CORNER_2X71CM': {
    modelKey: 'ISABEL_CORNER_2X71CM', displayName: 'Isabel Corner (2×71cm)',
    family: 'Isabel', type: 'Corner', group: 'CORNER_2',
    sizeVariant: '2×71cm', seatModules: 2, seatWidthCm: 71,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'MELISSA_CORNER_2X61CM': {
    modelKey: 'MELISSA_CORNER_2X61CM', displayName: 'Melissa Corner (2×61cm)',
    family: 'Melissa', type: 'Corner', group: 'CORNER_2',
    sizeVariant: '2×61cm', seatModules: 2, seatWidthCm: 61,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'MELISSA_CORNER_2X71CM': {
    modelKey: 'MELISSA_CORNER_2X71CM', displayName: 'Melissa Corner (2×71cm)',
    family: 'Melissa', type: 'Corner', group: 'CORNER_2',
    sizeVariant: '2×71cm', seatModules: 2, seatWidthCm: 71,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'VIOLA_CORNER_2X61CM': {
    modelKey: 'VIOLA_CORNER_2X61CM', displayName: 'Viola Corner (2×61cm)',
    family: 'Viola', type: 'Corner', group: 'CORNER_2',
    sizeVariant: '2×61cm', seatModules: 2, seatWidthCm: 61,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'VIOLA_CORNER_2X71CM': {
    modelKey: 'VIOLA_CORNER_2X71CM', displayName: 'Viola Corner (2×71cm)',
    family: 'Viola', type: 'Corner', group: 'CORNER_2',
    sizeVariant: '2×71cm', seatModules: 2, seatWidthCm: 71,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'MILANO_CORNER_2X61CM': {
    modelKey: 'MILANO_CORNER_2X61CM', displayName: 'Milano Corner (2×61cm)',
    family: 'Milano', type: 'Corner', group: 'CORNER_2',
    sizeVariant: '2×61cm', seatModules: 2, seatWidthCm: 61,
    requiresOrientation: true, isElectricRecliner: false,
  },
  'MILANO_CORNER_2X71CM': {
    modelKey: 'MILANO_CORNER_2X71CM', displayName: 'Milano Corner (2×71cm)',
    family: 'Milano', type: 'Corner', group: 'CORNER_2',
    sizeVariant: '2×71cm', seatModules: 2, seatWidthCm: 71,
    requiresOrientation: true, isElectricRecliner: false,
  },

};

// ── Fabric Ranges ─────────────────────────────────────────────────────────
// imagePath: served from /public/sofa-fabrics/…  Missing images are hidden by onError.
export const FABRIC_RANGES = {
  'ROMA': {
    rangeCode: 'ROMA', finishCategory: 'A',
    colours: [
      { colourKey: 'ROMA_02', colourName: 'Roma 02 - Ice',          colourOrder: 1,  imagePath: '/sofa-fabrics/ROMA/roma-02-ice.webp' },
      { colourKey: 'ROMA_03', colourName: 'Roma 03 - Linen',        colourOrder: 2,  imagePath: '/sofa-fabrics/ROMA/roma-03-linen.webp' },
      { colourKey: 'ROMA_04', colourName: 'Roma 04 - Pearl grey',   colourOrder: 3,  imagePath: '/sofa-fabrics/ROMA/roma-04-pearl-grey.webp' },
      { colourKey: 'ROMA_05', colourName: 'Roma 05 - Beige',        colourOrder: 4,  imagePath: '/sofa-fabrics/ROMA/roma-05-beige.webp' },
      { colourKey: 'ROMA_06', colourName: 'Roma 06 - Dark beige',   colourOrder: 5,  imagePath: '/sofa-fabrics/ROMA/roma-06-dark-beige.webp' },
      { colourKey: 'ROMA_07', colourName: 'Roma 07 - Suede',        colourOrder: 6,  imagePath: '/sofa-fabrics/ROMA/roma-07-suede.webp' },
      { colourKey: 'ROMA_08', colourName: 'Roma 08 - Kaki',         colourOrder: 7,  imagePath: '/sofa-fabrics/ROMA/roma-08-kaki.webp' },
      { colourKey: 'ROMA_10', colourName: 'Roma 10 - Mink',         colourOrder: 8,  imagePath: '/sofa-fabrics/ROMA/roma-10-mink.webp' },
      { colourKey: 'ROMA_11', colourName: 'Roma 11 - Mokka',        colourOrder: 9,  imagePath: '/sofa-fabrics/ROMA/roma-11-mokka.webp' },
      { colourKey: 'ROMA_14', colourName: 'Roma 14 - Mustard',      colourOrder: 10, imagePath: '/sofa-fabrics/ROMA/roma-14-mustard.webp' },
      { colourKey: 'ROMA_15', colourName: 'Roma 15 - Pumpkin',      colourOrder: 11, imagePath: '/sofa-fabrics/ROMA/roma-15-pumpkin.webp' },
      { colourKey: 'ROMA_16', colourName: 'Roma 16 - Green',        colourOrder: 12, imagePath: '/sofa-fabrics/ROMA/roma-16-green.webp' },
      { colourKey: 'ROMA_17', colourName: 'Roma 17 - Coral',        colourOrder: 13, imagePath: '/sofa-fabrics/ROMA/roma-17-coral.webp' },
      { colourKey: 'ROMA_18', colourName: 'Roma 18 - Cherry',       colourOrder: 14, imagePath: '/sofa-fabrics/ROMA/roma-18-cherry.webp' },
      { colourKey: 'ROMA_22', colourName: 'Roma 22 - Light grey',   colourOrder: 15, imagePath: '/sofa-fabrics/ROMA/roma-22-light-grey.webp' },
      { colourKey: 'ROMA_23', colourName: 'Roma 23 - Grey',         colourOrder: 16, imagePath: '/sofa-fabrics/ROMA/roma-23-grey.webp' },
      { colourKey: 'ROMA_24', colourName: 'Roma 24 - Cornflower',   colourOrder: 17, imagePath: '/sofa-fabrics/ROMA/roma-24-cornflower.webp' },
      { colourKey: 'ROMA_25', colourName: 'Roma 25 - Petrol blue',  colourOrder: 18, imagePath: '/sofa-fabrics/ROMA/roma-25-petrol-blue.webp' },
      { colourKey: 'ROMA_26', colourName: 'Roma 26 - Blue',         colourOrder: 19, imagePath: '/sofa-fabrics/ROMA/roma-26-blue.webp' },
      { colourKey: 'ROMA_27', colourName: 'Roma 27 - Elephant',     colourOrder: 20, imagePath: '/sofa-fabrics/ROMA/roma-27-elephant.webp' },
      { colourKey: 'ROMA_28', colourName: 'Roma 28 - Dark grey',    colourOrder: 21, imagePath: '/sofa-fabrics/ROMA/roma-28-dark-grey.webp' },
      { colourKey: 'ROMA_30', colourName: 'Roma 30 - Ultramarine',  colourOrder: 22, imagePath: '/sofa-fabrics/ROMA/roma-30-ultramarine.webp' },
      { colourKey: 'ROMA_31', colourName: 'Roma 31 - Night blue',   colourOrder: 23, imagePath: '/sofa-fabrics/ROMA/roma-31-night-blue.webp' },
      { colourKey: 'ROMA_32', colourName: 'Roma 32 - Black',        colourOrder: 24, imagePath: '/sofa-fabrics/ROMA/roma-32-black.webp' },
      { colourKey: 'ROMA_33', colourName: 'Roma 33 - Pink',         colourOrder: 25, imagePath: '/sofa-fabrics/ROMA/roma-33-pink.webp' },
      { colourKey: 'ROMA_34', colourName: 'Roma 34 - Forest green', colourOrder: 26, imagePath: '/sofa-fabrics/ROMA/roma-34-forest-green.webp' },
    ],
  },
  'PENELOPE': {
    rangeCode: 'PENELOPE', finishCategory: 'B',
    colours: [
      { colourKey: 'PENELOPE_01', colourName: 'Penelope 01 - Cream',      colourOrder: 1,  imagePath: '/sofa-fabrics/PENELOPE/penelope-01-cream.webp' },
      { colourKey: 'PENELOPE_02', colourName: 'Penelope 02 - Beige',      colourOrder: 2,  imagePath: '/sofa-fabrics/PENELOPE/penelope-02-beige.webp' },
      { colourKey: 'PENELOPE_03', colourName: 'Penelope 03 - Fossil',     colourOrder: 3,  imagePath: '/sofa-fabrics/PENELOPE/penelope-03-fossil.webp' },
      { colourKey: 'PENELOPE_04', colourName: 'Penelope 04 - Brown',      colourOrder: 4,  imagePath: '/sofa-fabrics/PENELOPE/penelope-04-brown.webp' },
      { colourKey: 'PENELOPE_05', colourName: 'Penelope 05 - Stone',      colourOrder: 5,  imagePath: '/sofa-fabrics/PENELOPE/penelope-05-stone.webp' },
      { colourKey: 'PENELOPE_06', colourName: 'Penelope 06 - Rabbit',     colourOrder: 6,  imagePath: '/sofa-fabrics/PENELOPE/penelope-06-rabbit.webp' },
      { colourKey: 'PENELOPE_07', colourName: 'Penelope 07 - Yellow',     colourOrder: 7,  imagePath: '/sofa-fabrics/PENELOPE/penelope-07-yellow.webp' },
      { colourKey: 'PENELOPE_08', colourName: 'Penelope 08 - Ochre',      colourOrder: 8,  imagePath: '/sofa-fabrics/PENELOPE/penelope-08-ochre.webp' },
      { colourKey: 'PENELOPE_09', colourName: 'Penelope 09 - Fog Green',  colourOrder: 9,  imagePath: '/sofa-fabrics/PENELOPE/penelope-09-fog-green.webp' },
      { colourKey: 'PENELOPE_10', colourName: 'Penelope 10 - Moss Green', colourOrder: 10, imagePath: '/sofa-fabrics/PENELOPE/penelope-10-moss-green.webp' },
      { colourKey: 'PENELOPE_12', colourName: 'Penelope 12 - Red',        colourOrder: 11, imagePath: '/sofa-fabrics/PENELOPE/penelope-12-red.webp' },
      { colourKey: 'PENELOPE_13', colourName: 'Penelope 13 - Pink',       colourOrder: 12, imagePath: '/sofa-fabrics/PENELOPE/penelope-13-pink.webp' },
      { colourKey: 'PENELOPE_14', colourName: 'Penelope 14 - Fucsia',     colourOrder: 13, imagePath: '/sofa-fabrics/PENELOPE/penelope-14-fucsia.webp' },
      { colourKey: 'PENELOPE_15', colourName: 'Penelope 15 - Lillac',     colourOrder: 14, imagePath: '/sofa-fabrics/PENELOPE/penelope-15-lillac.webp' },
      { colourKey: 'PENELOPE_16', colourName: 'Penelope 16 - Light Blue', colourOrder: 15, imagePath: '/sofa-fabrics/PENELOPE/penelope-16-light-blue.webp' },
      { colourKey: 'PENELOPE_17', colourName: 'Penelope 17 - Aquamarine', colourOrder: 16, imagePath: '/sofa-fabrics/PENELOPE/penelope-17-aquamarine.webp' },
      { colourKey: 'PENELOPE_18', colourName: 'Penelope 18 - Turquoise',  colourOrder: 17, imagePath: '/sofa-fabrics/PENELOPE/penelope-18-turquoise.webp' },
      { colourKey: 'PENELOPE_20', colourName: 'Penelope 20 - Silver',     colourOrder: 18, imagePath: '/sofa-fabrics/PENELOPE/penelope-20-silver.webp' },
      { colourKey: 'PENELOPE_21', colourName: 'Penelope 21 - Grey',       colourOrder: 19, imagePath: '/sofa-fabrics/PENELOPE/penelope-21-grey.webp' },
      { colourKey: 'PENELOPE_22', colourName: 'Penelope 22 - Ash',        colourOrder: 20, imagePath: '/sofa-fabrics/PENELOPE/penelope-22-ash.webp' },
      { colourKey: 'PENELOPE_23', colourName: 'Penelope 23 - Anthracite', colourOrder: 21, imagePath: '/sofa-fabrics/PENELOPE/penelope-23-anthracite.webp' },
      { colourKey: 'PENELOPE_24', colourName: 'Penelope 24 - Steel',      colourOrder: 22, imagePath: '/sofa-fabrics/PENELOPE/penelope-24-steel.webp' },
      { colourKey: 'PENELOPE_25', colourName: 'Penelope 25 - Graphite',   colourOrder: 23, imagePath: '/sofa-fabrics/PENELOPE/penelope-25-graphite.webp' },
      { colourKey: 'PENELOPE_27', colourName: 'Penelope 27 - Blue',       colourOrder: 24, imagePath: '/sofa-fabrics/PENELOPE/penelope-27-blue.webp' },
    ],
  },
  'LUNA': {
    rangeCode: 'LUNA', finishCategory: 'B',
    colours: [
      { colourKey: 'LUNA_01', colourName: 'Luna 01 - White',       colourOrder: 1,  imagePath: '/sofa-fabrics/LUNA/luna-01-white.webp' },
      { colourKey: 'LUNA_02', colourName: 'Luna 02 - Beige',       colourOrder: 2,  imagePath: '/sofa-fabrics/LUNA/luna-02-beige.webp' },
      { colourKey: 'LUNA_03', colourName: 'Luna 03 - Dark Beige',  colourOrder: 3,  imagePath: '/sofa-fabrics/LUNA/luna-03-dark-beige.webp' },
      { colourKey: 'LUNA_04', colourName: 'Luna 04 - Linen',       colourOrder: 4,  imagePath: '/sofa-fabrics/LUNA/luna-04-linen.webp' },
      { colourKey: 'LUNA_05', colourName: 'Luna 05 - Dark Linen',  colourOrder: 5,  imagePath: '/sofa-fabrics/LUNA/luna-05-dark-linen.webp' },
      { colourKey: 'LUNA_06', colourName: 'Luna 06 - Mud',         colourOrder: 6,  imagePath: '/sofa-fabrics/LUNA/luna-06-mud.webp' },
      { colourKey: 'LUNA_07', colourName: 'Luna 07 - Camel',       colourOrder: 7,  imagePath: '/sofa-fabrics/LUNA/luna-07-camel.webp' },
      { colourKey: 'LUNA_08', colourName: 'Luna 08 - Chocolate',   colourOrder: 8,  imagePath: '/sofa-fabrics/LUNA/luna-08-chocolate.webp' },
      { colourKey: 'LUNA_09', colourName: 'Luna 09 - Dark Brown',  colourOrder: 9,  imagePath: '/sofa-fabrics/LUNA/luna-09-dark-brown.webp' },
      { colourKey: 'LUNA_10', colourName: 'Luna 10 - Yellow',      colourOrder: 10, imagePath: '/sofa-fabrics/LUNA/luna-10-yellow.webp' },
      { colourKey: 'LUNA_11', colourName: 'Luna 11 - Mustard',     colourOrder: 11, imagePath: '/sofa-fabrics/LUNA/luna-11-mustard.webp' },
      { colourKey: 'LUNA_12', colourName: 'Luna 12 - Orange',      colourOrder: 12, imagePath: '/sofa-fabrics/LUNA/luna-12-orange.webp' },
      { colourKey: 'LUNA_13', colourName: 'Luna 13 - Red',         colourOrder: 13, imagePath: '/sofa-fabrics/LUNA/luna-13-red.webp' },
      { colourKey: 'LUNA_14', colourName: 'Luna 14 - Bordeaux',    colourOrder: 14, imagePath: '/sofa-fabrics/LUNA/luna-14-bordeaux.webp' },
      { colourKey: 'LUNA_15', colourName: 'Luna 15 - Green',       colourOrder: 15, imagePath: '/sofa-fabrics/LUNA/luna-15-green.webp' },
      { colourKey: 'LUNA_16', colourName: 'Luna 16 - Light Green', colourOrder: 16, imagePath: '/sofa-fabrics/LUNA/luna-16-light-green.webp' },
      { colourKey: 'LUNA_17', colourName: 'Luna 17 - Turquoise',   colourOrder: 17, imagePath: '/sofa-fabrics/LUNA/luna-17-turquoise.webp' },
      { colourKey: 'LUNA_18', colourName: 'Luna 18 - Blue',        colourOrder: 18, imagePath: '/sofa-fabrics/LUNA/luna-18-blue.webp' },
      { colourKey: 'LUNA_19', colourName: 'Luna 19 - Silver',      colourOrder: 19, imagePath: '/sofa-fabrics/LUNA/luna-19-silver.webp' },
      { colourKey: 'LUNA_20', colourName: 'Luna 20 - Light Grey',  colourOrder: 20, imagePath: '/sofa-fabrics/LUNA/luna-20-light-grey.webp' },
      { colourKey: 'LUNA_21', colourName: 'Luna 21 - Grey',        colourOrder: 21, imagePath: '/sofa-fabrics/LUNA/luna-21-grey.webp' },
      { colourKey: 'LUNA_22', colourName: 'Luna 22 - Black',       colourOrder: 22, imagePath: '/sofa-fabrics/LUNA/luna-22-black.webp' },
      { colourKey: 'LUNA_23', colourName: 'Luna 23 - Coffee Milk', colourOrder: 23, imagePath: '/sofa-fabrics/LUNA/luna-23-coffee-milk.webp' },
      { colourKey: 'LUNA_24', colourName: 'Luna 24 - Elephant',    colourOrder: 24, imagePath: '/sofa-fabrics/LUNA/luna-24-elephant.webp' },
      { colourKey: 'LUNA_25', colourName: 'Luna 25 - Light Blue',  colourOrder: 25, imagePath: '/sofa-fabrics/LUNA/luna-25-light-blue.webp' },
    ],
  },
  'NORA': {
    rangeCode: 'NORA', finishCategory: 'C',
    colours: [
      { colourKey: 'NORA_01', colourName: 'Nora 01 - Cream',         colourOrder: 1,  imagePath: '/sofa-fabrics/NORA/nora-01-cream.webp' },
      { colourKey: 'NORA_02', colourName: 'Nora 02 - Light Linen',   colourOrder: 2,  imagePath: '/sofa-fabrics/NORA/nora-02-light-linen.webp' },
      { colourKey: 'NORA_03', colourName: 'Nora 03 - Mink',          colourOrder: 3,  imagePath: '/sofa-fabrics/NORA/nora-03-mink.webp' },
      { colourKey: 'NORA_04', colourName: 'Nora 04 - Brown',         colourOrder: 4,  imagePath: '/sofa-fabrics/NORA/nora-04-brown.webp' },
      { colourKey: 'NORA_05', colourName: 'Nora 05 - Yellow',        colourOrder: 5,  imagePath: '/sofa-fabrics/NORA/nora-05-yellow.webp' },
      { colourKey: 'NORA_06', colourName: 'Nora 06 - Amber',         colourOrder: 6,  imagePath: '/sofa-fabrics/NORA/nora-06-amber.webp' },
      { colourKey: 'NORA_07', colourName: 'Nora 07 - Orange',        colourOrder: 7,  imagePath: '/sofa-fabrics/NORA/nora-07-orange.webp' },
      { colourKey: 'NORA_08', colourName: 'Nora 08 - Strawberry',    colourOrder: 8,  imagePath: '/sofa-fabrics/NORA/nora-08-strawberry.webp' },
      { colourKey: 'NORA_09', colourName: 'Nora 09 - Bordeaux',      colourOrder: 9,  imagePath: '/sofa-fabrics/NORA/nora-09-bordeaux.webp' },
      { colourKey: 'NORA_10', colourName: 'Nora 10 - Pink',          colourOrder: 10, imagePath: '/sofa-fabrics/NORA/nora-10-pink.webp' },
      { colourKey: 'NORA_11', colourName: 'Nora 11 - Purple',        colourOrder: 11, imagePath: '/sofa-fabrics/NORA/nora-11-purple.webp' },
      { colourKey: 'NORA_12', colourName: 'Nora 12 - Light Blue',    colourOrder: 12, imagePath: '/sofa-fabrics/NORA/nora-12-light-blue.webp' },
      { colourKey: 'NORA_13', colourName: 'Nora 13 - Torquoise',     colourOrder: 13, imagePath: '/sofa-fabrics/NORA/nora-13-torquoise.webp' },
      { colourKey: 'NORA_14', colourName: 'Nora 14 - Sky',           colourOrder: 14, imagePath: '/sofa-fabrics/NORA/nora-14-sky.webp' },
      { colourKey: 'NORA_15', colourName: 'Nora 15 - Indigo',        colourOrder: 15, imagePath: '/sofa-fabrics/NORA/nora-15-indigo.webp' },
      { colourKey: 'NORA_16', colourName: 'Nora 16 - Pacific',       colourOrder: 16, imagePath: '/sofa-fabrics/NORA/nora-16-pacific.webp' },
      { colourKey: 'NORA_17', colourName: 'Nora 17 - Deep Sea',      colourOrder: 17, imagePath: '/sofa-fabrics/NORA/nora-17-deep-sea.webp' },
      { colourKey: 'NORA_18', colourName: 'Nora 18 - Olive',         colourOrder: 18, imagePath: '/sofa-fabrics/NORA/nora-18-olive.webp' },
      { colourKey: 'NORA_19', colourName: 'Nora 19 - Musk',          colourOrder: 19, imagePath: '/sofa-fabrics/NORA/nora-19-musk.webp' },
      { colourKey: 'NORA_20', colourName: 'Nora 20 - Green',         colourOrder: 20, imagePath: '/sofa-fabrics/NORA/nora-20-green.webp' },
      { colourKey: 'NORA_21', colourName: 'Nora 21 - Optical White', colourOrder: 21, imagePath: '/sofa-fabrics/NORA/nora-21-optical-white.webp' },
      { colourKey: 'NORA_22', colourName: 'Nora 22 - Milk',          colourOrder: 22, imagePath: '/sofa-fabrics/NORA/nora-22-milk.webp' },
      { colourKey: 'NORA_23', colourName: 'Nora 23 - Silver',        colourOrder: 23, imagePath: '/sofa-fabrics/NORA/nora-23-silver.webp' },
      { colourKey: 'NORA_24', colourName: 'Nora 24 - Graphite',      colourOrder: 24, imagePath: '/sofa-fabrics/NORA/nora-24-graphite.webp' },
      { colourKey: 'NORA_25', colourName: 'Nora 25 - Grey',          colourOrder: 25, imagePath: '/sofa-fabrics/NORA/nora-25-grey.webp' },
      { colourKey: 'NORA_26', colourName: 'Nora 26 - Anthracite',    colourOrder: 26, imagePath: '/sofa-fabrics/NORA/nora-26-anthracite.webp' },
    ],
  },
  'VIKI': {
    rangeCode: 'VIKI', finishCategory: 'C',
    colours: [
      { colourKey: 'VIKI_01', colourName: 'Viki 01 - Milk',       colourOrder: 1, imagePath: '/sofa-fabrics/VIKI/viki-01-milk.webp' },
      { colourKey: 'VIKI_02', colourName: 'Viki 02 - Beige',      colourOrder: 2, imagePath: '/sofa-fabrics/VIKI/viki-02-beige.webp' },
      { colourKey: 'VIKI_03', colourName: 'Viki 03 - Cream',      colourOrder: 3, imagePath: '/sofa-fabrics/VIKI/viki-03-cream.webp' },
      { colourKey: 'VIKI_04', colourName: 'Viki 04 - Dark beige', colourOrder: 4, imagePath: '/sofa-fabrics/VIKI/viki-04-dark-beige.webp' },
      { colourKey: 'VIKI_05', colourName: 'Viki 05 - Ecru',       colourOrder: 5, imagePath: '/sofa-fabrics/VIKI/viki-05-ecr.webp' },
      { colourKey: 'VIKI_06', colourName: 'Viki 06 - Copper red', colourOrder: 6, imagePath: '/sofa-fabrics/VIKI/viki-06-copper-red.webp' },
      { colourKey: 'VIKI_07', colourName: 'Viki 07 - Taupe',      colourOrder: 7, imagePath: '/sofa-fabrics/VIKI/viki-07-taupe.webp' },
      { colourKey: 'VIKI_08', colourName: 'Viki 08 - Linen',      colourOrder: 8, imagePath: '/sofa-fabrics/VIKI/viki-08-linen.webp' },
    ],
  },
};

// ── Base Prices ───────────────────────────────────────────────────────────
// All prices inc-VAT (18%). discountPct stored as fraction (0.3 = 30%).
// needsReview: true = not yet confirmed from official price list.
export const BASE_PRICES = {
  // ── Linear ──────────────────────────────────────────────────────────────
  'AMANDA_ELECTRIC_RECLINER': {
    A: { rrpInclVat: 1743, offerInclVat: 1220, discountPct: 0.3001, needsReview: false },
    B: { rrpInclVat: 1920, offerInclVat: 1344, discountPct: 0.3,    needsReview: false },
    C: { rrpInclVat: 2005, offerInclVat: 1403, discountPct: 0.3002, needsReview: false },
  },
  'CLARA_TWO_SEATER': {
    A: { rrpInclVat: 680,  offerInclVat: 476,  discountPct: 0.3,    needsReview: false },
    B: { rrpInclVat: 750,  offerInclVat: 525,  discountPct: 0.3,    needsReview: false },
    C: { rrpInclVat: 790,  offerInclVat: 553,  discountPct: 0.3,    needsReview: false },
  },
  'CLARA_THREE_SEATER': {
    A: { rrpInclVat: 850,  offerInclVat: 595,  discountPct: 0.3,    needsReview: false },
    B: { rrpInclVat: 936,  offerInclVat: 655,  discountPct: 0.3002, needsReview: false },
    C: { rrpInclVat: 980,  offerInclVat: 686,  discountPct: 0.3,    needsReview: false },
  },
  'CLARA_TWO_THREE_SEATER_OFFER': {
    A: { rrpInclVat: 1425, offerInclVat: 995,  discountPct: 0.3018, needsReview: false },
    B: { rrpInclVat: 1565, offerInclVat: 1095, discountPct: 0.3003, needsReview: false },
    C: { rrpInclVat: 1638, offerInclVat: 1145, discountPct: 0.3010, needsReview: false },
  },
  'PRIMO_TWO_SEATER_2X61CM': {
    A: { rrpInclVat: 1245, offerInclVat: 825,  discountPct: 0.3373, needsReview: false },
    B: { rrpInclVat: 1300, offerInclVat: 910,  discountPct: 0.3,    needsReview: false },
    C: { rrpInclVat: 1358, offerInclVat: 950,  discountPct: 0.3004, needsReview: false },
  },
  'PRIMO_THREE_SEATER_2X71CM': {
    A: { rrpInclVat: 1315, offerInclVat: 852,  discountPct: 0.3521, needsReview: false },
    B: { rrpInclVat: 1343, offerInclVat: 940,  discountPct: 0.3001, needsReview: false },
    C: { rrpInclVat: 1400, offerInclVat: 980,  discountPct: 0.3,    needsReview: false },
  },
  'TALENTO_TWO_SEATER_2X61CM': {
    A: { rrpInclVat: 1740, offerInclVat: 1217, discountPct: 0.3006, needsReview: false },
    B: { rrpInclVat: 1914, offerInclVat: 1338, discountPct: 0.3009, needsReview: false },
    C: { rrpInclVat: 2001, offerInclVat: 1399, discountPct: 0.3008, needsReview: false },
  },
  'TALENTO_THREE_SEATER_2X71CM': {
    A: { rrpInclVat: 1315, offerInclVat: 920,  discountPct: 0.3004, needsReview: false },
    B: { rrpInclVat: 1447, offerInclVat: 1012, discountPct: 0.3006, needsReview: false },
    C: { rrpInclVat: 1512, offerInclVat: 1058, discountPct: 0.3003, needsReview: false },
  },
  'ISABEL_TWO_SEATER_2X61CM': {
    A: { rrpInclVat: 1245, offerInclVat: 870,  discountPct: 0.3012, needsReview: false },
    B: { rrpInclVat: 1368, offerInclVat: 957,  discountPct: 0.3004, needsReview: false },
    C: { rrpInclVat: 1430, offerInclVat: 1000, discountPct: 0.3007, needsReview: false },
  },
  'ISABEL_THREE_SEATER_2X71CM': {
    A: { rrpInclVat: 1315, offerInclVat: 920,  discountPct: 0.3004, needsReview: false },
    B: { rrpInclVat: 1447, offerInclVat: 1012, discountPct: 0.3006, needsReview: false },
    C: { rrpInclVat: 1512, offerInclVat: 1058, discountPct: 0.3003, needsReview: false },
  },
  'MELISSA_TWO_SEATER_2X61CM': {
    A: { rrpInclVat: 1245, offerInclVat: 870,  discountPct: 0.3012, needsReview: false },
    B: { rrpInclVat: 1368, offerInclVat: 957,  discountPct: 0.3004, needsReview: false },
    C: { rrpInclVat: 1430, offerInclVat: 1000, discountPct: 0.3007, needsReview: false },
  },
  'MELISSA_THREE_SEATER_2X71CM': {
    A: { rrpInclVat: 1315, offerInclVat: 920,  discountPct: 0.3004, needsReview: false },
    B: { rrpInclVat: 1447, offerInclVat: 1012, discountPct: 0.3006, needsReview: false },
    C: { rrpInclVat: 1512, offerInclVat: 1058, discountPct: 0.3003, needsReview: false },
  },
  'VIOLA_TWO_SEATER_2X61CM': {
    A: { rrpInclVat: 1245, offerInclVat: 870,  discountPct: 0.3012, needsReview: false },
    B: { rrpInclVat: 1368, offerInclVat: 957,  discountPct: 0.3004, needsReview: false },
    C: { rrpInclVat: 1430, offerInclVat: 1000, discountPct: 0.3007, needsReview: false },
  },
  'VIOLA_THREE_SEATER_2X71CM': {
    A: { rrpInclVat: 1315, offerInclVat: 920,  discountPct: 0.3004, needsReview: false },
    B: { rrpInclVat: 1447, offerInclVat: 1012, discountPct: 0.3006, needsReview: false },
    C: { rrpInclVat: 1512, offerInclVat: 1058, discountPct: 0.3003, needsReview: false },
  },
  'MILANO_TWO_SEATER_2X61CM': {
    A: { rrpInclVat: 1245, offerInclVat: 870,  discountPct: 0.3012, needsReview: false },
    B: { rrpInclVat: 1368, offerInclVat: 957,  discountPct: 0.3004, needsReview: false },
    C: { rrpInclVat: 1430, offerInclVat: 1000, discountPct: 0.3007, needsReview: false },
  },
  'MILANO_THREE_SEATER_2X71CM': {
    A: { rrpInclVat: 1315, offerInclVat: 920,  discountPct: 0.3004, needsReview: false },
    B: { rrpInclVat: 1447, offerInclVat: 1012, discountPct: 0.3006, needsReview: false },
    C: { rrpInclVat: 1512, offerInclVat: 1058, discountPct: 0.3003, needsReview: false },
  },

  // ── Chaise Lounge ────────────────────────────────────────────────────────
  'PRIMO_CHAISE_LOUNGE_2X61CM': {
    A: { rrpInclVat: 1681, offerInclVat: 1176, discountPct: 0.3004, needsReview: false },
    B: { rrpInclVat: 1850, offerInclVat: 1295, discountPct: 0.3,    needsReview: false },
    C: { rrpInclVat: 1932, offerInclVat: 1352, discountPct: 0.3002, needsReview: false },
  },
  'PRIMO_CHAISE_LOUNGE_2X71CM': {
    A: { rrpInclVat: 1730, offerInclVat: 1210, discountPct: 0.3006, needsReview: false },
    B: { rrpInclVat: 1908, offerInclVat: 1335, discountPct: 0.3003, needsReview: false },
    C: { rrpInclVat: 1993, offerInclVat: 1395, discountPct: 0.3001, needsReview: false },
  },
  'TALENTO_CHAISE_LOUNGE_2X61CM': {
    A: { rrpInclVat: 1740, offerInclVat: 1217, discountPct: 0.3006, needsReview: false },
    B: { rrpInclVat: 1969, offerInclVat: 1377, discountPct: 0.3007, needsReview: false },
    C: { rrpInclVat: 2058, offerInclVat: 1439, discountPct: 0.3008, needsReview: false },
  },
  'TALENTO_CHAISE_LOUNGE_2X71CM': {
    A: { rrpInclVat: 1790, offerInclVat: 1252, discountPct: 0.3006, needsReview: false },
    B: { rrpInclVat: 2145, offerInclVat: 1500, discountPct: 0.3007, needsReview: false },
    C: { rrpInclVat: 2244, offerInclVat: 1569, discountPct: 0.3008, needsReview: false },
  },
  'ISABEL_CHAISE_LOUNGE_2X61CM': {
    A: { rrpInclVat: 1740, offerInclVat: 1217, discountPct: 0.3006, needsReview: false },
    B: { rrpInclVat: 1914, offerInclVat: 1338, discountPct: 0.3009, needsReview: false },
    C: { rrpInclVat: 2001, offerInclVat: 1399, discountPct: 0.3008, needsReview: false },
  },
  'ISABEL_CHAISE_LOUNGE_2X71CM': {
    A: { rrpInclVat: 1790, offerInclVat: 1252, discountPct: 0.3006, needsReview: false },
    B: { rrpInclVat: 1969, offerInclVat: 1377, discountPct: 0.3007, needsReview: false },
    C: { rrpInclVat: 2058, offerInclVat: 1439, discountPct: 0.3008, needsReview: false },
  },
  'MELISSA_CHAISE_LOUNGE_2X61CM': {
    A: { rrpInclVat: 1740, offerInclVat: 1217, discountPct: 0.3006, needsReview: false },
    B: { rrpInclVat: 1914, offerInclVat: 1338, discountPct: 0.3009, needsReview: false },
    C: { rrpInclVat: 2001, offerInclVat: 1399, discountPct: 0.3008, needsReview: false },
  },
  'MELISSA_CHAISE_LOUNGE_2X71CM': {
    A: { rrpInclVat: 1790, offerInclVat: 1252, discountPct: 0.3006, needsReview: false },
    B: { rrpInclVat: 1969, offerInclVat: 1377, discountPct: 0.3007, needsReview: false },
    C: { rrpInclVat: 2058, offerInclVat: 1439, discountPct: 0.3008, needsReview: false },
  },
  'VIOLA_CHAISE_LOUNGE_2X61CM': {
    A: { rrpInclVat: 1740, offerInclVat: 1217, discountPct: 0.3006, needsReview: false },
    B: { rrpInclVat: 1914, offerInclVat: 1338, discountPct: 0.3009, needsReview: false },
    C: { rrpInclVat: 2001, offerInclVat: 1399, discountPct: 0.3008, needsReview: false },
  },
  'VIOLA_CHAISE_LOUNGE_2X71CM': {
    A: { rrpInclVat: 1790, offerInclVat: 1252, discountPct: 0.3006, needsReview: false },
    B: { rrpInclVat: 1969, offerInclVat: 1377, discountPct: 0.3007, needsReview: false },
    C: { rrpInclVat: 2058, offerInclVat: 1439, discountPct: 0.3008, needsReview: false },
  },
  'MILANO_CHAISE_LOUNGE_2X61CM': {
    A: { rrpInclVat: 1740, offerInclVat: 1217, discountPct: 0.3006, needsReview: false },
    B: { rrpInclVat: 1914, offerInclVat: 1338, discountPct: 0.3009, needsReview: false },
    C: { rrpInclVat: 2001, offerInclVat: 1399, discountPct: 0.3008, needsReview: false },
  },
  'MILANO_CHAISE_LOUNGE_2X71CM': {
    A: { rrpInclVat: 1790, offerInclVat: 1252, discountPct: 0.3006, needsReview: false },
    B: { rrpInclVat: 1969, offerInclVat: 1377, discountPct: 0.3007, needsReview: false },
    C: { rrpInclVat: 2058, offerInclVat: 1439, discountPct: 0.3008, needsReview: false },
  },

  // ── Corner (2×) ──────────────────────────────────────────────────────────
  'PRIMO_CORNER_2X61CM': {
    A: { rrpInclVat: 1833, offerInclVat: 1282, discountPct: 0.3006, needsReview: false },
    B: { rrpInclVat: 2015, offerInclVat: 1410, discountPct: 0.3002, needsReview: false },
    C: { rrpInclVat: 2108, offerInclVat: 1475, discountPct: 0.3003, needsReview: false },
  },
  'PRIMO_CORNER_2X71CM': {
    A: { rrpInclVat: 1887, offerInclVat: 1320, discountPct: 0.3005, needsReview: false },
    B: { rrpInclVat: 2075, offerInclVat: 1452, discountPct: 0.3002, needsReview: false },
    C: { rrpInclVat: 2172, offerInclVat: 1520, discountPct: 0.3002, needsReview: false },
  },
  'TALENTO_CORNER_2X61CM': {
    A: { rrpInclVat: 1855, offerInclVat: 1298, discountPct: 0.3003, needsReview: false },
    B: { rrpInclVat: 2040, offerInclVat: 1427, discountPct: 0.3005, needsReview: false },
    C: { rrpInclVat: 2134, offerInclVat: 1492, discountPct: 0.3008, needsReview: false },
  },
  'TALENTO_CORNER_2X71CM': {
    A: { rrpInclVat: 1952, offerInclVat: 1365, discountPct: 0.3007, needsReview: false },
    B: { rrpInclVat: 2145, offerInclVat: 1500, discountPct: 0.3007, needsReview: false },
    C: { rrpInclVat: 2244, offerInclVat: 1569, discountPct: 0.3008, needsReview: false },
  },
  'ISABEL_CORNER_2X61CM': {
    A: { rrpInclVat: 1855, offerInclVat: 1298, discountPct: 0.3003, needsReview: false },
    B: { rrpInclVat: 2040, offerInclVat: 1427, discountPct: 0.3005, needsReview: false },
    C: { rrpInclVat: 2134, offerInclVat: 1492, discountPct: 0.3008, needsReview: false },
  },
  'ISABEL_CORNER_2X71CM': {
    A: { rrpInclVat: 1952, offerInclVat: 1365, discountPct: 0.3007, needsReview: false },
    B: { rrpInclVat: 2145, offerInclVat: 1500, discountPct: 0.3007, needsReview: false },
    C: { rrpInclVat: 2244, offerInclVat: 1569, discountPct: 0.3008, needsReview: false },
  },
  'MELISSA_CORNER_2X61CM': {
    A: { rrpInclVat: 1855, offerInclVat: 1298, discountPct: 0.3003, needsReview: false },
    B: { rrpInclVat: 2040, offerInclVat: 1427, discountPct: 0.3005, needsReview: false },
    C: { rrpInclVat: 2134, offerInclVat: 1492, discountPct: 0.3008, needsReview: false },
  },
  'MELISSA_CORNER_2X71CM': {
    A: { rrpInclVat: 1952, offerInclVat: 1365, discountPct: 0.3007, needsReview: false },
    B: { rrpInclVat: 2145, offerInclVat: 1500, discountPct: 0.3007, needsReview: false },
    C: { rrpInclVat: 2244, offerInclVat: 1569, discountPct: 0.3008, needsReview: false },
  },
  'VIOLA_CORNER_2X61CM': {
    A: { rrpInclVat: 1855, offerInclVat: 1298, discountPct: 0.3003, needsReview: false },
    B: { rrpInclVat: 2040, offerInclVat: 1427, discountPct: 0.3005, needsReview: false },
    C: { rrpInclVat: 2134, offerInclVat: 1492, discountPct: 0.3008, needsReview: false },
  },
  'VIOLA_CORNER_2X71CM': {
    A: { rrpInclVat: 1952, offerInclVat: 1365, discountPct: 0.3007, needsReview: false },
    B: { rrpInclVat: 2145, offerInclVat: 1500, discountPct: 0.3007, needsReview: false },
    C: { rrpInclVat: 2058, offerInclVat: 1439, discountPct: 0.3008, needsReview: false },
  },
  'MILANO_CORNER_2X61CM': {
    A: { rrpInclVat: 1855, offerInclVat: 1298, discountPct: 0.3003, needsReview: false },
    B: { rrpInclVat: 2040, offerInclVat: 1427, discountPct: 0.3005, needsReview: false },
    C: { rrpInclVat: 2134, offerInclVat: 1492, discountPct: 0.3008, needsReview: false },
  },
  'MILANO_CORNER_2X71CM': {
    A: { rrpInclVat: 1952, offerInclVat: 1365, discountPct: 0.3007, needsReview: false },
    B: { rrpInclVat: 2145, offerInclVat: 1500, discountPct: 0.3007, needsReview: false },
    C: { rrpInclVat: 2244, offerInclVat: 1569, discountPct: 0.3008, needsReview: false },
  },

};

// ── Option Prices ─────────────────────────────────────────────────────────
// All prices incl. VAT, apply across all fabric categories.
export const OPTION_PRICES = {
  STORAGE_POUFFE:         { rrpInclVat: 265, offerInclVat: 185, needsReview: false },
  EXTRA_SEAT:             { rrpInclVat: 449, offerInclVat: 314, needsReview: false },
  ELEC_RECLINER_PER_SEAT: { rrpInclVat: 0,   offerInclVat: 0,   needsReview: true  },
};

// ── Query helpers ──────────────────────────────────────────────────────────

/** Return all models for a given group key, preserving declaration order. */
export function getModelsByGroup(groupKey) {
  return Object.values(SOFA_MODELS).filter((m) => m.group === groupKey);
}

/** Return the finish category letter ('A'|'B'|'C') for a fabric range code. */
export function getFinishCategory(rangeCode) {
  return FABRIC_RANGES[rangeCode]?.finishCategory ?? null;
}

/**
 * Return the price entry for a model + finishCategory combination.
 * Returns null if the entry does not exist.
 */
export function getBasePrice(modelKey, finishCategory) {
  return BASE_PRICES[modelKey]?.[finishCategory] ?? null;
}

export const SOFA_VAT_RATE = 18; // %

/**
 * Calculate the total customer-facing price for a fully configured sofa.
 *
 * Returns both inc-VAT (customer-facing display) and ex-VAT (Frappe rate field)
 * values so that ERPNext can correctly compute net_total, VAT, and grand_total.
 *
 * @param {string} modelKey
 * @param {string} fabricRange  — range code e.g. 'ROMA'
 * @param {object} options      — { STORAGE_POUFFE, EXTRA_SEAT, ELEC_RECLINER }
 * @returns {{ rrpInclVat, offerInclVat, rrpExVat, offerExVat, savings, vatRate, baseNeedsReview } | null}
 */
export function calculateTotalPrice(modelKey, fabricRange, options = {}) {
  const finishCategory = getFinishCategory(fabricRange);
  if (!finishCategory) return null;

  const base = BASE_PRICES[modelKey]?.[finishCategory];
  if (!base) return null;

  let rrp   = base.rrpInclVat;
  let offer = base.offerInclVat;

  if (options.STORAGE_POUFFE) {
    rrp   += OPTION_PRICES.STORAGE_POUFFE.rrpInclVat;
    offer += OPTION_PRICES.STORAGE_POUFFE.offerInclVat;
  }
  if (options.EXTRA_SEAT) {
    rrp   += OPTION_PRICES.EXTRA_SEAT.rrpInclVat;
    offer += OPTION_PRICES.EXTRA_SEAT.offerInclVat;
  }
  if (options.ELEC_RECLINER && options.ELEC_RECLINER > 0) {
    rrp   += OPTION_PRICES.ELEC_RECLINER_PER_SEAT.rrpInclVat   * options.ELEC_RECLINER;
    offer += OPTION_PRICES.ELEC_RECLINER_PER_SEAT.offerInclVat * options.ELEC_RECLINER;
  }

  const vatFactor = 1 + SOFA_VAT_RATE / 100;
  // Ex-VAT: divide inc-VAT by the VAT factor, round to 2dp
  const rrpExVat   = Math.round((rrp   / vatFactor) * 100) / 100;
  const offerExVat = Math.round((offer / vatFactor) * 100) / 100;

  return {
    rrpInclVat:      rrp,
    offerInclVat:    offer,
    rrpExVat,
    offerExVat,
    savings:         rrp - offer,
    vatRate:         SOFA_VAT_RATE,
    baseNeedsReview: base.needsReview ?? false,
  };
}

// ── Enrich BASE_PRICES with explicit ex-VAT fields ────────────────────────
// BASE_PRICES entries are auto-generated from Excel with inc-VAT integers.
// We post-process them here so each entry carries rrpExVat and offerExVat
// as the ERPNext source-of-truth values.  calculateTotalPrice() also returns
// these for fully-configured builds; this enrichment makes them available
// directly on the raw data objects as well.
;(function _enrichBasePricesWithExVat() {
  const VAT = 1 + SOFA_VAT_RATE / 100; // 1.18
  for (const cats of Object.values(BASE_PRICES)) {
    for (const entry of Object.values(cats)) {
      entry.rrpExVat   = Math.round((entry.rrpInclVat   / VAT) * 100) / 100;
      entry.offerExVat = Math.round((entry.offerInclVat / VAT) * 100) / 100;
    }
  }
}());

/**
 * Shared utility for sofa top-view measurement image URLs.
 * Used by SofaConfigurator (wizard previews) and SalesDocEditor (sales-doc thumbnail).
 *
 * Images live at:
 *   /sofa-measurements/{FAMILY}/{FAMILY}_{TYPE}/N_..._[RH-DX|LH-SX].jpg  (most models)
 *   /sofa-measurements/LINEAR/{filename}.jpg                               (Amanda / Clara)
 */
import { SOFA_MODELS } from '../components/configurators/sofaPricingData';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Models that have a single flat top-view image (no width/orientation variants). */
export const LINEAR_FLAT_IMAGES = {
  AMANDA_ELECTRIC_RECLINER: 'AMANDA_RECLINER.webp',
  CLARA_TWO_SEATER:         'CLARA_TWO_SEATER.webp',
  CLARA_THREE_SEATER:       'CLARA_THREE_SEATER.webp',
};

/**
 * Returns the URL for the sofa top-view measurement image, or null if unavailable.
 * @param {string} modelKey      - e.g. 'ISABEL_CHAISE', 'AMANDA_ELECTRIC_RECLINER'
 * @param {string} orientation   - 'R' (right-hand) or 'L' (left-hand)
 * @param {boolean} extraSeat    - whether the EXTRA SEAT option is selected
 */
export function getSofaMeasurementImage(modelKey, orientation, extraSeat) {
  // Amanda / Clara — single flat top-view, no width/orientation variants
  if (LINEAR_FLAT_IMAGES[modelKey]) {
    return `${BASE}/sofa-measurements/LINEAR/${LINEAR_FLAT_IMAGES[modelKey]}`;
  }

  const model = SOFA_MODELS[modelKey];
  if (!model) return null;

  const family = model.family.toUpperCase();
  const { group, seatWidthCm } = model;

  let typeDir;
  if (group === 'LINEAR')   typeDir = 'SEATER';
  else if (group === 'CHAISE') typeDir = 'CHAISE';
  else                       typeDir = 'CORNER'; // CORNER_2 or CORNER_3

  const width = seatWidthCm;
  const extra = extraSeat ? '+EXTRA' : '';

  if (typeDir === 'SEATER') {
    const n = width === 71 ? (extraSeat ? 3 : 1) : (extraSeat ? 4 : 2);
    return `${BASE}/sofa-measurements/${family}/${family}_SEATER/${n}_${family}_SEATER_${width}${extra}.webp`;
  } else {
    const ori    = orientation === 'R' ? 'RH-DX' : 'LH-SX';
    const isRH   = orientation === 'R';
    const isLarge = width === 71;
    let n;
    if (!extraSeat) {
      n = isLarge ? (isRH ? 1 : 2) : (isRH ? 3 : 4);
    } else {
      n = isLarge ? (isRH ? 5 : 6) : (isRH ? 7 : 8);
    }
    return `${BASE}/sofa-measurements/${family}/${family}_${typeDir}/${n}_${family}_${typeDir}_${width}${extra}_${ori}.webp`;
  }
}

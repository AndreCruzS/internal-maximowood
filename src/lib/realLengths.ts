/**
 * Nominal vs. real board lengths.
 *
 * Ayous, Ash and Scandinavian Pine are cut in metric steps of 0.30 m and sold
 * under the nearest "feet" name: a 9' board is 2.70 m = 106.30" = 8.86 LF.
 * LF is always the real length (as on the Thermowood packing list:
 * metres / 0.3048), so pieces, boards and prices use these real lengths.
 * Everything else (Clear Radiata, Accoya, tropical hardwoods) is cut in true
 * feet — see "EQUIVALENCE OF LENGTHS" and the packing-list templates.
 */

const METRE_PER_FT = 0.3048;
/** Real metres per nominal foot for the metric-cut species. */
const METRIC_STEP_M = 0.3;

const METRIC_SPECIES = /\b(AYOUS|ASH|SCANDINAVIAN)\b/i;

/** True when the species' nominal lengths are metric (0.30 m per nominal foot). */
export const isMetricLength = (species: string | null | undefined): boolean => !!species && METRIC_SPECIES.test(species);

/** Real length in feet (= LF per piece) of a board sold as `nominalFt`. */
export const realFt = (nominalFt: number, species: string | null | undefined): number =>
  isMetricLength(species) ? (nominalFt * METRIC_STEP_M) / METRE_PER_FT : nominalFt;

/** Real length in inches of a board sold as `nominalFt`. */
export const realInches = (nominalFt: number, species: string | null | undefined): number => realFt(nominalFt, species) * 12;

/** "9'" for true-feet species; `9' (106.30")` when the real length differs. */
export const lengthLabel = (nominalFt: number, species: string | null | undefined): string =>
  isMetricLength(species) ? `${nominalFt}' (${realInches(nominalFt, species).toFixed(2)}")` : `${nominalFt}'`;

/**
 * Countries and cities for "Where do you live?" (dropdowns instead of free
 * text, to avoid typos). Country names come from the browser in the viewer's
 * language; Brazil and the United States have city lists (where GMX people
 * live), other countries take a typed city.
 */

/** ISO 3166-1 alpha-2 codes. */
export const COUNTRY_CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

/** Shown first in the country list. */
export const MAIN_COUNTRIES = ["BR", "US"];

export const CITIES: Record<string, string[]> = {
  BR: [
    "Curitiba", "São José dos Pinhais", "Colombo", "Pinhais", "Araucária", "Campo Largo", "Almirante Tamandaré", "Fazenda Rio Grande",
    "Ponta Grossa", "Londrina", "Maringá", "Cascavel", "Foz do Iguaçu", "Guarapuava", "Paranaguá",
    "Joinville", "Blumenau", "Florianópolis", "Balneário Camboriú", "Itajaí", "Chapecó", "Lages",
    "São Paulo", "Campinas", "Santos", "São José dos Campos", "Ribeirão Preto", "Sorocaba",
    "Rio de Janeiro", "Niterói", "Belo Horizonte", "Porto Alegre", "Caxias do Sul", "Brasília", "Goiânia",
    "Salvador", "Recife", "Fortaleza", "Belém", "Manaus", "Vitória", "Campo Grande", "Cuiabá", "Natal", "João Pessoa", "Maceió", "Aracaju", "Teresina", "São Luís",
  ],
  US: [
    "Aventura, FL", "Miami, FL", "Miami Beach, FL", "North Miami Beach, FL", "Sunny Isles Beach, FL", "Hallandale Beach, FL", "Hollywood, FL",
    "Fort Lauderdale, FL", "Pembroke Pines, FL", "Miramar, FL", "Doral, FL", "Coral Gables, FL", "Homestead, FL", "Kendall, FL",
    "Boca Raton, FL", "Delray Beach, FL", "West Palm Beach, FL", "Palm Beach, FL", "Weston, FL", "Coral Springs, FL", "Plantation, FL",
    "Tampa, FL", "Clearwater, FL", "St. Petersburg, FL", "Orlando, FL", "Jacksonville, FL", "Naples, FL", "Fort Myers, FL", "Sarasota, FL",
    "Houston, TX", "Katy, TX", "Sugar Land, TX", "The Woodlands, TX", "Spring, TX", "Dallas, TX", "Austin, TX", "San Antonio, TX",
    "Boston, MA", "Nantucket, MA", "Cambridge, MA", "New York, NY", "Brooklyn, NY", "Newark, NJ", "Jersey City, NJ",
    "Atlanta, GA", "Charlotte, NC", "Chicago, IL", "Los Angeles, CA", "San Diego, CA", "San Francisco, CA", "Seattle, WA", "Denver, CO", "Phoenix, AZ", "Washington, DC",
  ],
};

/** Country name in the viewer's language ("BR" → "Brasil" in pt-BR). */
export function countryName(code: string, tag: string): string {
  try {
    return new Intl.DisplayNames([tag], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Countries sorted by name in the viewer's language, Brazil and the US first. */
export function countryOptions(tag: string): { code: string; name: string }[] {
  const rest = COUNTRY_CODES.filter(c => !MAIN_COUNTRIES.includes(c))
    .map(code => ({ code, name: countryName(code, tag) }))
    .sort((a, b) => a.name.localeCompare(b.name, tag));
  return [...MAIN_COUNTRIES.map(code => ({ code, name: countryName(code, tag) })), ...rest];
}

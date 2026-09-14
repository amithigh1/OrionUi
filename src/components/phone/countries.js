/* Phone data: every country/territory with ISO2 + calling code (ITU-T E.164 assignments).
 *   'ISO|dial|English name|leading national digits that pick this territory inside a shared code'
 * Shared codes pick the first listed country unless the national number starts with one of its area prefixes
 * (e.g. +1 -> United States unless the area code is Canadian; +7 -> Russia unless it starts with 6/7 -> Kazakhstan).
 */
const NANP_CA = '204,226,236,249,250,257,263,289,306,343,354,365,367,368,382,387,403,416,418,428,431,437,438,450,460,468,474,506,514,519,548,579,581,584,587,604,613,639,647,672,683,705,709,742,753,778,780,782,807,819,825,867,873,879,902,905';
const COUNTRY_DATA = ('US|1|United States;CA|1|Canada|' + NANP_CA.replace(/,/g, ' ') + ';' +
  'AF|93|Afghanistan;AX|358|Åland Islands|18;AL|355|Albania;DZ|213|Algeria;AS|1684|American Samoa;AD|376|Andorra;AO|244|Angola;' +
  'AI|1264|Anguilla;AQ|672|Antarctica|1;AG|1268|Antigua & Barbuda;AR|54|Argentina;AM|374|Armenia;AW|297|Aruba;AC|247|Ascension Island;' +
  'AU|61|Australia;AT|43|Austria;AZ|994|Azerbaijan;BS|1242|Bahamas;BH|973|Bahrain;BD|880|Bangladesh;BB|1246|Barbados;BY|375|Belarus;' +
  'BE|32|Belgium;BZ|501|Belize;BJ|229|Benin;BM|1441|Bermuda;BT|975|Bhutan;BO|591|Bolivia;BA|387|Bosnia & Herzegovina;BW|267|Botswana;' +
  'BR|55|Brazil;IO|246|British Indian Ocean Territory;VG|1284|British Virgin Islands;BN|673|Brunei;BG|359|Bulgaria;BF|226|Burkina Faso;' +
  'BI|257|Burundi;KH|855|Cambodia;CM|237|Cameroon;CV|238|Cape Verde;BQ|599|Caribbean Netherlands|3 4 7;KY|1345|Cayman Islands;' +
  'CF|236|Central African Republic;TD|235|Chad;CL|56|Chile;CN|86|China;CX|61|Christmas Island|89164;CC|61|Cocos (Keeling) Islands|89162;' +
  'CO|57|Colombia;KM|269|Comoros;CG|242|Congo - Brazzaville;CD|243|Congo - Kinshasa;CK|682|Cook Islands;CR|506|Costa Rica;' +
  "CI|225|Côte d'Ivoire;HR|385|Croatia;CU|53|Cuba;CW|599|Curaçao;CY|357|Cyprus;CZ|420|Czechia;DK|45|Denmark;DJ|253|Djibouti;" +
  'DM|1767|Dominica;DO|1809|Dominican Republic;DO|1829|Dominican Republic;DO|1849|Dominican Republic;EC|593|Ecuador;EG|20|Egypt;' +
  'SV|503|El Salvador;GQ|240|Equatorial Guinea;ER|291|Eritrea;EE|372|Estonia;SZ|268|Eswatini;ET|251|Ethiopia;FK|500|Falkland Islands;' +
  'FO|298|Faroe Islands;FJ|679|Fiji;FI|358|Finland;FR|33|France;GF|594|French Guiana;PF|689|French Polynesia;TF|262|French Southern Territories|0;' +
  'GA|241|Gabon;GM|220|Gambia;GE|995|Georgia;DE|49|Germany;GH|233|Ghana;GI|350|Gibraltar;GR|30|Greece;GL|299|Greenland;GD|1473|Grenada;' +
  'GP|590|Guadeloupe;GU|1671|Guam;GT|502|Guatemala;GG|44|Guernsey|1481 7781 7839 7911;GN|224|Guinea;GW|245|Guinea-Bissau;GY|592|Guyana;' +
  'HT|509|Haiti;HN|504|Honduras;HK|852|Hong Kong;HU|36|Hungary;IS|354|Iceland;IN|91|India;ID|62|Indonesia;IR|98|Iran;IQ|964|Iraq;' +
  'IE|353|Ireland;IM|44|Isle of Man|1624 7524 7624 7924;IL|972|Israel;IT|39|Italy;JM|1876|Jamaica;JM|1658|Jamaica;JP|81|Japan;' +
  'JE|44|Jersey|1534 7509 7700 7797 7829 7937;JO|962|Jordan;KZ|7|Kazakhstan|6 7;KE|254|Kenya;KI|686|Kiribati;XK|383|Kosovo;KW|965|Kuwait;' +
  'KG|996|Kyrgyzstan;LA|856|Laos;LV|371|Latvia;LB|961|Lebanon;LS|266|Lesotho;LR|231|Liberia;LY|218|Libya;LI|423|Liechtenstein;' +
  'LT|370|Lithuania;LU|352|Luxembourg;MO|853|Macao;MG|261|Madagascar;MW|265|Malawi;MY|60|Malaysia;MV|960|Maldives;ML|223|Mali;MT|356|Malta;' +
  'MH|692|Marshall Islands;MQ|596|Martinique;MR|222|Mauritania;MU|230|Mauritius;YT|262|Mayotte|269 639;MX|52|Mexico;FM|691|Micronesia;' +
  'MD|373|Moldova;MC|377|Monaco;MN|976|Mongolia;ME|382|Montenegro;MS|1664|Montserrat;MA|212|Morocco;MZ|258|Mozambique;MM|95|Myanmar;' +
  'NA|264|Namibia;NR|674|Nauru;NP|977|Nepal;NL|31|Netherlands;NC|687|New Caledonia;NZ|64|New Zealand;NI|505|Nicaragua;NE|227|Niger;' +
  'NG|234|Nigeria;NU|683|Niue;NF|672|Norfolk Island|3;KP|850|North Korea;MK|389|North Macedonia;MP|1670|Northern Mariana Islands;NO|47|Norway;' +
  'OM|968|Oman;PK|92|Pakistan;PW|680|Palau;PS|970|Palestine;PA|507|Panama;PG|675|Papua New Guinea;PY|595|Paraguay;PE|51|Peru;PH|63|Philippines;' +
  'PN|64|Pitcairn Islands|0;PL|48|Poland;PT|351|Portugal;PR|1787|Puerto Rico;PR|1939|Puerto Rico;QA|974|Qatar;RE|262|Réunion;RO|40|Romania;' +
  'RU|7|Russia;RW|250|Rwanda;BL|590|St. Barthélemy|0;SH|290|St. Helena;KN|1869|St. Kitts & Nevis;LC|1758|St. Lucia;MF|590|St. Martin|0;' +
  'PM|508|St. Pierre & Miquelon;VC|1784|St. Vincent & Grenadines;WS|685|Samoa;SM|378|San Marino;ST|239|São Tomé & Príncipe;SA|966|Saudi Arabia;' +
  'SN|221|Senegal;RS|381|Serbia;SC|248|Seychelles;SL|232|Sierra Leone;SG|65|Singapore;SX|1721|Sint Maarten;SK|421|Slovakia;SI|386|Slovenia;' +
  'SB|677|Solomon Islands;SO|252|Somalia;ZA|27|South Africa;GS|500|South Georgia & South Sandwich Islands|0;KR|82|South Korea;SS|211|South Sudan;' +
  'ES|34|Spain;LK|94|Sri Lanka;SD|249|Sudan;SR|597|Suriname;SJ|47|Svalbard & Jan Mayen|79;SE|46|Sweden;CH|41|Switzerland;SY|963|Syria;' +
  'TW|886|Taiwan;TJ|992|Tajikistan;TZ|255|Tanzania;TH|66|Thailand;TL|670|Timor-Leste;TG|228|Togo;TK|690|Tokelau;TO|676|Tonga;' +
  'TT|1868|Trinidad & Tobago;TA|290|Tristan da Cunha|8;TN|216|Tunisia;TR|90|Türkiye;TM|993|Turkmenistan;TC|1649|Turks & Caicos Islands;' +
  'TV|688|Tuvalu;UM|1|U.S. Outlying Islands|0;VI|1340|U.S. Virgin Islands;UG|256|Uganda;UA|380|Ukraine;AE|971|United Arab Emirates;' +
  'GB|44|United Kingdom;UY|598|Uruguay;UZ|998|Uzbekistan;VU|678|Vanuatu;VA|39|Vatican City|06698;VE|58|Venezuela;VN|84|Vietnam;' +
  'WF|681|Wallis & Futuna;EH|212|Western Sahara|5288 5289;YE|967|Yemen;ZM|260|Zambia;ZW|263|Zimbabwe').split(';');

/* National formats ('#' = digit) with optional leading-digit rules, and [min, max] national significant number lengths.
 * Validation is an approximation: it checks lengths (and the leading-digit rules below), not number allocation. */
const PHONE_FORMATS = {
  US: '(###) ###-####', CA: '(###) ###-####',
  GB: [[/^7/, '#### ######'], [/^2/, '## #### ####'], [/^1\d1|^11/, '### ### ####'], ['#### ######']],
  MY: [[/^11/, '##-#### ####'], [/^1/, '##-### ####'], [/^3/, '#-#### ####'], ['#-### ####']],
  SG: '#### ####', IN: '##### #####', AU: [[/^4/, '### ### ###'], ['# #### ####']], NZ: [[/^2/, '## ### ####'], ['# ### ####']],
  DE: [[/^1[5-7]/, '### ########'], [/^[23]0|^40|^69|^89/, '## ########'], ['#### #######']],
  FR: '# ## ## ## ##', ES: '### ## ## ##', IT: [[/^3/, '### ### ####'], [/^0[26]/, '## #### ####'], ['### ### ####']],
  NL: [[/^6/, '# ########'], ['## #######']], BE: [[/^4/, '### ## ## ##'], ['# ### ## ##']], CH: '## ### ## ##', AT: '### #######',
  SE: [[/^7/, '##-### ## ##'], ['#-### ### ##']], NO: '### ## ###', DK: '## ## ## ##', FI: '## ### ####', PL: '### ### ###', PT: '### ### ###',
  IE: [[/^8/, '## ### ####'], ['# ### ####']], RU: '(###) ###-##-##', KZ: '(###) ###-##-##', UA: '## ### ## ##', TR: '(###) ### ## ##',
  BR: [[/^\d\d9/, '(##) #####-####'], ['(##) ####-####']], MX: '## #### ####', AR: '## ####-####', CO: '### ### ####', CL: '# #### ####',
  PE: '### ### ###', CN: [[/^1/, '### #### ####'], ['## #### ####']], JP: [[/^[789]0/, '##-####-####'], [/^3|^6/, '#-####-####'], ['##-###-####']],
  KR: [[/^1/, '##-####-####'], [/^2/, '#-####-####'], ['##-###-####']], HK: '#### ####', MO: '#### ####', TW: [[/^9/, '### ### ###'], ['# #### ####']],
  TH: [[/^[689]/, '## ### ####'], ['# ### ####']], VN: [[/^[35789]/, '## ### ## ##'], ['## #### ####']], PH: [[/^9/, '### ### ####'], ['# #### ####']],
  ID: [[/^8/, '###-####-####'], ['##-####-####']], PK: [[/^3/, '### #######'], ['## #######']], BD: '####-######',
  AE: [[/^5/, '## ### ####'], ['# ### ####']], SA: [[/^5/, '## ### ####'], ['# ### ####']], IL: [[/^5/, '##-###-####'], ['#-###-####']],
  EG: [[/^1/, '### ### ####'], ['# #### ####']], ZA: '## ### ####', NG: '### ### ####', KE: '### ######', GR: '### ### ####', CZ: '### ### ###',
  HU: '## ### ####', RO: '### ### ###', BN: '### ####', LK: '## ### ####', NP: '### #######',
};
const PHONE_LENGTHS = {
  US: [10, 10], CA: [10, 10], GB: [9, 10], MY: [8, 10], SG: [8, 8], IN: [10, 10], AU: [9, 9], NZ: [8, 10], DE: [6, 13], FR: [9, 9], ES: [9, 9],
  IT: [6, 11], NL: [9, 9], BE: [8, 9], CH: [9, 9], AT: [4, 13], SE: [7, 10], NO: [8, 8], DK: [8, 8], FI: [5, 12], PL: [9, 9], PT: [9, 9],
  IE: [7, 9], RU: [10, 10], KZ: [10, 10], UA: [9, 9], TR: [10, 10], BR: [10, 11], MX: [10, 10], AR: [10, 10], CO: [8, 10], CL: [9, 9],
  PE: [8, 9], CN: [7, 11], JP: [9, 10], KR: [8, 10], HK: [8, 8], MO: [8, 8], TW: [8, 9], TH: [8, 9], VN: [9, 10], PH: [8, 10], ID: [8, 12],
  PK: [9, 10], BD: [8, 10], AE: [8, 9], SA: [8, 9], IL: [8, 9], EG: [8, 10], ZA: [9, 9], NG: [8, 10], KE: [9, 9], GR: [10, 10], CZ: [9, 9],
  HU: [8, 9], RO: [9, 9], BN: [7, 7], LK: [9, 9], NP: [8, 10],
};
/** Countries whose national numbers keep a leading 0 (no trunk prefix to strip). */
const KEEP_ZERO = new Set(['IT', 'SM', 'VA', 'CI', 'CG', 'GA']);
/** Trunk prefixes other than "0" (stripped when the number is one digit longer than allowed). */
const TRUNK = { US: '1', CA: '1', RU: '8', KZ: '8', BY: '8', HU: '06', LT: '8', MN: '0' };

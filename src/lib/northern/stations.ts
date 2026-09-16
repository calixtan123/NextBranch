/** Canonical Northern line stations. IDs are station NaPTAN IDs used by TfL. */
export type Station = {
  id: string;
  name: string;
  aliases: readonly string[];
  branch: "bank" | "cx" | "both";
};
export const BANK = "940GZZLUBNK";
export const CX = "940GZZLUCHX";
const rows: ReadonlyArray<
  readonly [string, string, "bank" | "cx" | "both", ...(readonly string[])[]]
> = [
  ["940GZZLUAGL", "Angel", "bank"],
  ["940GZZLUACY", "Archway", "both"],
  ["940GZZLUBLM", "Balham", "both"],
  [BANK, "Bank", "bank"],
  ["940GZZBPSUST", "Battersea Power Station", "cx", ["Battersea"]],
  ["940GZZLUBZP", "Belsize Park", "both"],
  ["940GZZLUBOR", "Borough", "bank"],
  ["940GZZLUBTX", "Brent Cross", "both"],
  ["940GZZLUBTK", "Burnt Oak", "both"],
  ["940GZZLUCTN", "Camden Town", "both"],
  ["940GZZLUCFM", "Chalk Farm", "both"],
  [CX, "Charing Cross", "cx"],
  ["940GZZLUCPC", "Clapham Common", "both"],
  ["940GZZLUCPN", "Clapham North", "both"],
  ["940GZZLUCPS", "Clapham South", "both"],
  ["940GZZLUCND", "Colindale", "both"],
  ["940GZZLUCSD", "Colliers Wood", "both"],
  ["940GZZLUEFY", "East Finchley", "both"],
  ["940GZZLUEGW", "Edgware", "both"],
  ["940GZZLUEAC", "Elephant & Castle", "bank"],
  ["940GZZLUEMB", "Embankment", "cx"],
  ["940GZZLUEUS", "Euston", "both"],
  ["940GZZLUFYC", "Finchley Central", "both"],
  ["940GZZLUGGN", "Golders Green", "both"],
  ["940GZZLUGDG", "Goodge Street", "cx"],
  ["940GZZLUHTD", "Hampstead", "both"],
  ["940GZZLUHCL", "Hendon Central", "both"],
  ["940GZZLUHBT", "High Barnet", "both"],
  ["940GZZLUHGT", "Highgate", "both"],
  ["940GZZLUKNG", "Kennington", "both"],
  ["940GZZLUKSH", "Kentish Town", "both"],
  [
    "940GZZLUKSX",
    "King's Cross St. Pancras",
    "both",
    ["Kings Cross", "King’s Cross"],
  ],
  ["940GZZLULSQ", "Leicester Square", "cx"],
  ["940GZZLULNB", "London Bridge", "bank"],
  ["940GZZLUMHL", "Mill Hill East", "both"],
  ["940GZZLUMGT", "Moorgate", "bank"],
  ["940GZZLUMDN", "Morden", "both"],
  ["940GZZLUMTC", "Mornington Crescent", "both"],
  ["940GZZNEUGST", "Nine Elms", "cx"],
  ["940GZZLUODS", "Old Street", "bank"],
  ["940GZZLUOVL", "Oval", "both"],
  ["940GZZLUSWN", "South Wimbledon", "both"],
  ["940GZZLUSKW", "Stockwell", "both"],
  ["940GZZLUTBC", "Tooting Bec", "both"],
  ["940GZZLUTBY", "Tooting Broadway", "both"],
  ["940GZZLUTCR", "Tottenham Court Road", "cx"],
  ["940GZZLUTAW", "Totteridge & Whetstone", "both"],
  ["940GZZLUTFP", "Tufnell Park", "both"],
  ["940GZZLUWRR", "Warren Street", "both"],
  ["940GZZLUWLO", "Waterloo", "both"],
  ["940GZZLUWFN", "West Finchley", "both"],
  ["940GZZLUWOP", "Woodside Park", "both"],
];
export const stations: readonly Station[] = rows.map(
  ([id, name, branch, aliases = []]) => ({ id, name, branch, aliases }),
);
export const byId = new Map(stations.map((station) => [station.id, station]));
export const normalize = (value: string): string =>
  value
    .toLocaleLowerCase("en-GB")
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
/** Finds stations deterministically: prefix matches before contained matches, then name. */
export function searchStations(query: string): readonly Station[] {
  const term = normalize(query);
  if (!term) return stations;
  return stations
    .filter((station) =>
      [station.name, ...station.aliases].some((value) =>
        normalize(value).includes(term),
      ),
    )
    .toSorted((a, b) => {
      const rank = (station: Station) =>
        [station.name, ...station.aliases].some((value) =>
          normalize(value).startsWith(term),
        )
          ? 0
          : 1;
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });
}

/** Indian cities that appear under two names, plus a few European ones. */
const CITY_ALIASES: Record<string, string> = {
 bengaluru: "bangalore", bangalore: "bangalore",
 thiruvananthapuram: "trivandrum", trivandrum: "trivandrum",
 kochi: "kochi", cochin: "kochi", ernakulam: "kochi",
 mumbai: "mumbai", bombay: "mumbai",
 chennai: "chennai", madras: "chennai",
 kolkata: "kolkata", calcutta: "kolkata",
 gurugram: "gurugram", gurgaon: "gurugram",
 "new delhi": "delhi", delhi: "delhi", ncr: "delhi", noida: "delhi",
 pune: "pune", hyderabad: "hyderabad", secunderabad: "hyderabad",
 münchen: "munich", munich: "munich", koln: "cologne", köln: "cologne", cologne: "cologne",
};

const KERALA = new Set(["trivandrum", "kochi", "kozhikode", "kottayam", "thrissur", "kannur", "palakkad"]);
const METRO = new Set(["bangalore", "hyderabad", "chennai", "pune", "mumbai", "delhi", "kolkata"]);

const COUNTRY_NAMES: Record<string, string> = {
 india: "IN", "republic of india": "IN",
 germany: "DE", deutschland: "DE", netherlands: "NL", "the netherlands": "NL",
 sweden: "SE", switzerland: "CH", "united kingdom": "GB", uk: "GB", england: "GB",
 scotland: "GB", wales: "GB", "great britain": "GB",
 "united states": "US", usa: "US", "united states of america": "US", america: "US",
 singapore: "SG", australia: "AU", canada: "CA", france: "FR", belgium: "BE",
 denmark: "DK", norway: "NO", finland: "FI", austria: "AT", ireland: "IE", japan: "JP",
 spain: "ES", italy: "IT", portugal: "PT", poland: "PL", "czech republic": "CZ", czechia: "CZ",
};

// Many feeds return "City, State" without a country. Country inference is
// intentionally limited to unambiguous administrative regions/cities needed
// for official visa/tax evidence; unknown locations stay unknown.
const US_REGIONS = new Set(`alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia|dc|ny|ia|ca|ma|md|nj|pa|tx|wa|il|fl|ga|nc|oh|mi|mn|co|az|or|va`.split("|"));
const CANADA_REGIONS = new Set(`alberta|british columbia|manitoba|new brunswick|newfoundland and labrador|nova scotia|ontario|prince edward island|quebec|saskatchewan|northwest territories|nunavut|yukon|ab|bc|mb|nb|nl|ns|nt|nu|on|pe|qc|sk|yt`.split("|"));
const INDIA_LOCATIONS = new Set([
 ...Object.keys(CITY_ALIASES), "kerala", "karnataka", "tamil nadu", "telangana", "andhra pradesh",
 "maharashtra", "west bengal", "uttar pradesh", "madhya pradesh", "rajasthan", "gujarat", "odisha",
 "punjab", "haryana", "assam", "goa", "chandigarh", "puducherry",
]);

const inferCountryFromParts = (parts: string[]): string | null => {
 const values = parts.map(part => part.toLowerCase().replace(/\./g, "").trim());
 if (values.some(value => US_REGIONS.has(value))) return "US";
 if (values.some(value => CANADA_REGIONS.has(value))) return "CA";
 if (values.some(value => INDIA_LOCATIONS.has(value))) return "IN";
 return null;
};

export const normalizeCity = (city: string | null): string | null => {
 if (!city) return null;
 const k = city.toLowerCase().trim();
 return CITY_ALIASES[k] ?? k;
};

export function normalizeCountry(value: string | null): string | null {
 if (!value) return null;
 const v = value.trim();
 if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
 return COUNTRY_NAMES[v.toLowerCase()] ?? null;
}

/** The coarse bucket the dashboard filters on. */
export function regionOf(city: string | null, country: string | null, isRemote: boolean): string {
 const c = normalizeCity(city);
 if (c && KERALA.has(c)) return "Kerala";
 if (c === "bangalore") return "Bengaluru";
 if (country === "IN") return "Rest of India";
 if (isRemote) return "Remote";
 if (!country) return "Other";
 if (["DE","NL","SE","CH","GB","FR","BE","DK","NO","FI","AT","IE","ES","IT","PT","PL","CZ"].includes(country)) return "Europe";
 if (["US","CA"].includes(country)) return "North America";
 if (["SG","AU","JP","NZ","KR","HK"].includes(country)) return "Asia-Pacific";
 return "Other";
}

const REMOTE_RE = /\b(fully[- ])?remote\b|\bwork from home\b|\bwfh\b|\btelecommut/i;
export const looksRemote = (text: string) => REMOTE_RE.test(text);

/** Best-effort split of a free-text location like "Bengaluru, Karnataka, India". */
export function parseLocation(raw: string | null): { city: string | null; country: string | null } {
 if (!raw) return { city: null, country: null };
 const parts = raw.split(",").map(p => p.trim()).filter(Boolean);
 if (!parts.length) return { city: null, country: null };
 const explicitCountry = normalizeCountry(parts[parts.length - 1]);
 const country = explicitCountry ?? inferCountryFromParts(parts);
 const city = parts.length > 1 || !explicitCountry ? parts[0] : null;
 return { city: city ?? null, country };
}

/** Key used by the dedup cascade: same place, however it was written. */
export function locKey(city: string | null, country: string | null, isRemote: boolean): string | null {
 if (isRemote) return "REMOTE";
 const c = normalizeCity(city);
 if (c) return c;
 return country ?? null;
}

export const isMetro = (city: string | null) => {
 const c = normalizeCity(city);
 return !!c && METRO.has(c);
};
export const isKerala = (city: string | null) => {
 const c = normalizeCity(city);
 return !!c && KERALA.has(c);
};

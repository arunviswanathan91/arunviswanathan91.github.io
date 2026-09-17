export interface DestinationOption { value:string; label:string; disabled?:boolean }

export const DESTINATION_NAMES:Record<string,string>={
 "*":"Worldwide",
 AT:"Austria",AU:"Australia",BE:"Belgium",CA:"Canada",CH:"Switzerland",CN:"China",CZ:"Czechia",
 DE:"Germany",DK:"Denmark",ES:"Spain",FI:"Finland",FR:"France",GB:"United Kingdom",HK:"Hong Kong",
 IE:"Ireland",IN:"India",IT:"Italy",JP:"Japan",KR:"South Korea",MY:"Malaysia",NL:"Netherlands",
 NO:"Norway",NZ:"New Zealand",PL:"Poland",PT:"Portugal",SE:"Sweden",SG:"Singapore",TH:"Thailand",
 TW:"Taiwan",US:"United States",ZA:"South Africa",
};

export const DESTINATION_PRESETS:Record<string,string[]>={
 EUROPE:["DE","NL","SE","NO","DK","FI","CH","GB","FR","BE","AT","IE","ES","IT","PT","PL","CZ"],
 NORTH_AMERICA:["US","CA"],
 EAST_ASIA:["JP","CN","KR","HK","TW","SG","MY","TH"],
 OCEANIA:["AU","NZ"],
 WORLDWIDE:["*"],
};

export const DEFAULT_DESTINATIONS=[...DESTINATION_PRESETS.EUROPE];

export const DESTINATION_OPTIONS:DestinationOption[]=[
 {value:"",label:"Choose a region or add a country…",disabled:true},
 {value:"header:presets",label:"Region presets",disabled:true},
 {value:"preset:EUROPE",label:"Europe"},
 {value:"preset:NORTH_AMERICA",label:"United States & Canada"},
 {value:"preset:EAST_ASIA",label:"East & Southeast Asia"},
 {value:"preset:OCEANIA",label:"Australia & New Zealand"},
 {value:"preset:WORLDWIDE",label:"Worldwide — all supported destinations"},
 {value:"header:countries",label:"Individual countries",disabled:true},
 ...Object.entries(DESTINATION_NAMES).filter(([value])=>value!=="*").sort((a,b)=>a[1].localeCompare(b[1]))
  .map(([value,label])=>({value:`country:${value}`,label})),
];

/** Presets replace the current geography; country choices add to it. */
export function applyDestinationChoice(current:string[],choice:string){
 if(choice.startsWith("preset:"))return [...(DESTINATION_PRESETS[choice.slice(7)]??current)];
 if(choice.startsWith("country:"))return current.includes("*")?[choice.slice(8)]:[...new Set([...current,choice.slice(8)])];
 return current;
}

import { atsKey, canonicalizeUrl, urlHash } from "../normalize/url.js";
import { contentHash, excerpt } from "../normalize/text.js";
import { locKey, looksRemote, normalizeCountry, parseLocation, regionOf } from "../normalize/location.js";
import { classifyType } from "../normalize/type.js";
import { orgKey } from "../dedupe/keys.js";
import { salaryFromText } from "../normalize/salary.js";
import type { NormalizedOpportunity, SalaryEvidence } from "../types.js";

export interface BuildInput {
 sourceKey: string;
 externalId: string;
 url: string;
 title: string;
 organization?: string | null;
 organizationUrl?: string | null;
 department?: string | null;
 description?: string;
 locationRaw?: string | null;
 city?: string | null;
 country?: string | null;
 isRemote?: boolean;
 postedAt?: string | null;
 deadline?: string | null;
 employmentType?: string | null;
 applyUrl?: string | null;
 salary?: SalaryEvidence | null;
}

/** How much of the core record we recovered without asking a model. */
function completenessOf(o: {
 title: string; organization: string | null; deadline: string | null;
 type: string; salary: SalaryEvidence | null;
}): number {
 const have = [
  !!o.title,
  !!o.organization,
  !!o.deadline,
  o.type !== "Other",
  !!o.salary,
 ].filter(Boolean).length;
 return have / 5;
}

/** The one place a source's raw fields become the pipeline's common shape. */
export function buildOpportunity(input: BuildInput): NormalizedOpportunity | null {
 const title = (input.title ?? "").trim();
 if (!title) return null;

 const description = (input.description ?? "").trim();
 const canon = canonicalizeUrl(input.url);

 const parsedLoc = parseLocation(input.locationRaw ?? null);
 const city = input.city ?? parsedLoc.city;
 const country = normalizeCountry(input.country ?? null) ?? parsedLoc.country;
 const isRemote = input.isRemote ?? looksRemote(title + " " + description.slice(0, 2000));

 const salary = input.salary ?? salaryFromText(description);
 const opportunityType = classifyType(title, description);
 const org = input.organization?.trim() || null;

 return {
  sourceKey: input.sourceKey,
  externalId: input.externalId,
  url: input.url,
  urlCanon: canon,
  urlHash: urlHash(canon),
  applyUrl: input.applyUrl ?? null,
  atsKey: atsKey(input.url),
  title,
  organization: org,
  organizationUrl: input.organizationUrl ?? null,
  department: input.department ?? null,
  locationRaw: input.locationRaw ?? (city || country ? [city, country].filter(Boolean).join(", ") : null),
  city: city ?? null,
  region: regionOf(city ?? null, country, isRemote),
  country: country,
  isRemote,
  postedAt: input.postedAt ?? null,
  deadline: input.deadline ?? null,
  employmentType: input.employmentType ?? null,
  opportunityType,
  descriptionText: excerpt(description, 20000),
  salary,
  contentHash: contentHash({
   title,
   orgKey: orgKey(org),
   locKey: locKey(city ?? null, country, isRemote),
   employmentType: input.employmentType ?? null,
   deadline: input.deadline ?? null,
   salaryMin: salary?.min ?? null,
   salaryMax: salary?.max ?? null,
   currency: salary?.currency ?? null,
   description,
  }),
  completeness: completenessOf({ title, organization: org, deadline: input.deadline ?? null, type: opportunityType, salary }),
 };
}

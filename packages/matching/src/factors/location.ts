import type { MatchJob, MatchProfile } from "@job-bot/shared";
import { normalizeLocationBucket, normalizeText } from "@job-bot/jobs";
import type { FactorOutcome } from "../types";

/**
 * Remote preference dominates: a remote-only candidate scores an on-site role
 * near zero regardless of city. Where the preference allows on-site work, the
 * preferred-location list decides.
 */
export const scoreLocation = (profile: MatchProfile, job: MatchJob): FactorOutcome => {
  const jobBucket = normalizeLocationBucket(job.location, job.isRemote);
  const isRemote = job.isRemote || jobBucket === "remote";

  if (profile.remotePreference === "REMOTE_ONLY") {
    return isRemote
      ? { applicable: true, score: 100, detail: "Remote posting matches a remote-only preference." }
      : {
          applicable: true,
          score: 5,
          detail: `On-site in ${job.location} conflicts with a remote-only preference.`,
        };
  }

  if (isRemote) {
    const score = profile.remotePreference === "ONSITE" ? 40 : 100;
    return { applicable: true, score, detail: "Remote posting." };
  }

  const preferred = profile.preferredLocations.map((location) => normalizeText(location));
  const matches = preferred.some(
    (location) => location.length > 0 && (jobBucket.includes(location) || location.includes(jobBucket)),
  );

  if (matches) {
    return { applicable: true, score: 100, detail: `${job.location} is a preferred location.` };
  }

  if (profile.preferredLocations.length === 0) {
    return { applicable: false, score: 0, detail: "No preferred locations recorded." };
  }

  return {
    applicable: true,
    score: 20,
    detail: `${job.location} is not among the preferred locations.`,
  };
};

/**
 * Notes that an on-site posting sits against a profile that needs sponsorship.
 *
 * This is derived from the profile and the posting's location only. It does
 * **not** read the announcement text looking for sponsorship language: that
 * reading is unreliable prose-matching, and a wrong answer here is worse than
 * none — a posting silently mislabelled as "will not sponsor" would push a
 * viable job down the list on the strength of a regex.
 *
 * Whether the employer actually sponsors is a question to ask them.
 */
export const detectSponsorshipConcern = (
  profile: MatchProfile,
  job: MatchJob,
): string | null => {
  if (!profile.requiresSponsorship) return null;
  if (job.isRemote) return null;

  return `On-site role in ${job.location}; the profile records that sponsorship would be required. Confirm with the employer.`;
};

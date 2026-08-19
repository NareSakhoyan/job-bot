import type { EmploymentType } from "@job-bot/shared";

/** One recorded project, as the generator sees it. */
export interface SourceProject {
  slug: string;
  name: string;
  description: string;
  technologies: string[];
  impact: string | null;
}

/**
 * One recorded position. This is the entire universe of facts the generator
 * may draw on — nothing outside it may appear in generated material.
 */
export interface SourceExperience {
  slug: string;
  company: string;
  role: string;
  employmentType: EmploymentType;
  location: string;
  isRemote: boolean;
  startDate: Date;
  endDate: Date | null;
  isCurrent: boolean;
  description: string;
  technologies: string[];
  responsibilities: string[];
  achievements: string[];
  projects: SourceProject[];
}

export interface SourceProfile {
  slug: string;
  fullName: string;
  headline: string;
  summary: string;
  yearsOfExperience: number;
  skills: Array<{ name: string; level: string }>;
  experiences: SourceExperience[];
}

/** The posting a resume is being tailored to. */
export interface TargetJob {
  company: string;
  title: string;
  technologies: string[];
  requirements: string[];
  descriptionText: string;
}

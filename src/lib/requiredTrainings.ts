/** Mandatory trainings taken in Rippling (migration 0035): which apply to whom, and who's done. */

export type RequiredTraining = { id: string; title: string; description: string; link: string | null; applies_to: "US" | "BR" | "all"; sort: number; active: boolean };
export type TrainingCompletion = { training_id: string; completed_on: string; source: "hr" | "rippling" };
export const REQUIRED_TRAINING_COLUMNS = "id, title, description, link, applies_to, sort, active";

/** The active trainings someone must take: US ones for everyone not on the Brazil team. */
export function trainingsFor(workCountry: string | null | undefined, all: RequiredTraining[]): RequiredTraining[] {
  const team = workCountry === "BR" ? "BR" : "US";
  return all.filter(t => t.active && (t.applies_to === "all" || t.applies_to === team)).sort((a, b) => a.sort - b.sort);
}

/** null when nothing is required (the step is hidden). */
export const allTrainingsDone = (required: RequiredTraining[], done: TrainingCompletion[]) =>
  required.length === 0 ? null : required.every(t => done.some(d => d.training_id === t.id));

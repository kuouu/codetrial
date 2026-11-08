import problemCatalog from "@/app/data/problems.json";
import InterviewExperience from "./interview-experience";

type SearchParams = Record<string, string | string[] | undefined>;

const problems = problemCatalog as Array<{
  page: string;
  title: string;
  source: string;
  difficulty: string;
  default: boolean;
}>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InterviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const requestedPage = first(params.problem);
  const problem =
    problems.find((item) => item.page === requestedPage) ??
    problems.find((item) => item.default) ??
    problems[0];
  const rawDuration = Number(first(params.duration));
  const durationMin = [30, 45, 60].includes(rawDuration) ? rawDuration : 45;
  const mode = first(params.mode) === "whiteboard" ? "whiteboard" : "coding";

  return (
    <InterviewExperience
      durationMin={durationMin}
      mode={mode}
      problem={problem}
    />
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock3, Code2, PenTool, Search } from "lucide-react";
import problemData from "@/app/data/problems.json";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";

type Problem = {
  page: string;
  title: string;
  source: string;
  difficulty: string;
  default: boolean;
};

type Difficulty = "All" | "Easy" | "Medium" | "Hard";

const problems = problemData as Problem[];
const difficulties: Difficulty[] = ["All", "Easy", "Medium", "Hard"];
const durations = [30, 45, 60];

function difficultyVariant(value: string) {
  if (value === "Easy") return "easy";
  if (value === "Hard") return "hard";
  return "medium";
}

export function ProblemBrowser() {
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("All");
  const [duration, setDuration] = useState(45);
  const [whiteboard, setWhiteboard] = useState(false);
  const [selectedPage, setSelectedPage] = useState(
    problems.find((problem) => problem.default)?.page ?? problems[0]?.page,
  );

  const visibleProblems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return problems
      .filter((problem) => difficulty === "All" || problem.difficulty === difficulty)
      .filter((problem) => {
        if (!normalized) return true;
        return [problem.title, problem.source, problem.page]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      })
      .slice(0, 12);
  }, [difficulty, query]);

  const selected = problems.find((problem) => problem.page === selectedPage) ?? problems[0];
  const interviewUrl = selected
    ? "/interview.html?problem=" +
      encodeURIComponent(selected.page) +
      "&duration=" +
      duration +
      (whiteboard ? "&mode=whiteboard" : "")
    : "/interview.html";

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_19rem] lg:items-start">
      <div>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Choose a challenge
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight" id="problems">
              Pick your next problem.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              151 interview scenarios, with three difficulty levels.
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search problems"
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search problems"
              value={query}
            />
          </div>
        </div>

        <div aria-label="Filter by difficulty" className="mt-6 flex flex-wrap gap-2">
          {difficulties.map((item) => (
            <Button
              aria-pressed={difficulty === item}
              key={item}
              onClick={() => setDifficulty(item)}
              size="sm"
              variant={difficulty === item ? "default" : "outline"}
            >
              {item}
            </Button>
          ))}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleProblems.map((problem) => {
            const isSelected = selected?.page === problem.page;
            return (
              <button
                aria-pressed={isSelected}
                className={
                  "group rounded-xl text-left outline-none transition focus-visible:ring-2 focus-visible:ring-ring " +
                  (isSelected ? "ring-2 ring-primary" : "")
                }
                key={problem.page}
                onClick={() => setSelectedPage(problem.page)}
                type="button"
              >
                <Card className="h-full transition-colors group-hover:border-primary/40">
                  <CardContent className="flex h-full min-h-36 flex-col p-4">
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant={difficultyVariant(problem.difficulty)}>
                        {problem.difficulty}
                      </Badge>
                      <ArrowUpRight aria-hidden="true" className="size-4 text-muted-foreground transition group-hover:text-foreground" />
                    </div>
                    <p className="mt-4 font-semibold leading-snug">{problem.title}</p>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {problem.source}
                    </p>
                  </CardContent>
                </Card>
              </button>
            );
          })}
          {visibleProblems.length === 0 && (
            <Card className="sm:col-span-2 xl:col-span-3">
              <CardContent className="p-6 text-sm text-muted-foreground">
                No problems match that search. Try another title or source problem.
              </CardContent>
            </Card>
          )}
        </div>
        {problems.length > visibleProblems.length && (
          <p className="mt-4 text-sm text-muted-foreground">
            Showing {visibleProblems.length} of {problems.length}. Search or filter to narrow the list.
          </p>
        )}
      </div>

      <Card className="sticky top-24">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Practice setup</p>
            <Badge variant="secondary">No account</Badge>
          </div>
          <div className="mt-5 rounded-lg bg-muted p-4">
            <Badge variant={difficultyVariant(selected?.difficulty ?? "Medium")}>
              {selected?.difficulty ?? "Medium"}
            </Badge>
            <p className="mt-3 font-semibold">{selected?.title ?? "Choose a problem"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{selected?.source ?? ""}</p>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-sm font-medium">Interview length</p>
            <div className="grid grid-cols-3 gap-2">
              {durations.map((minutes) => (
                <Button
                  aria-pressed={duration === minutes}
                  key={minutes}
                  onClick={() => setDuration(minutes)}
                  size="sm"
                  variant={duration === minutes ? "secondary" : "outline"}
                >
                  <Clock3 aria-hidden="true" className="size-3.5" />
                  {minutes} min
                </Button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-sm font-medium">Workspace</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                aria-pressed={!whiteboard}
                onClick={() => setWhiteboard(false)}
                size="sm"
                variant={!whiteboard ? "default" : "outline"}
              >
                <Code2 aria-hidden="true" className="size-4" />
                Editor
              </Button>
              <Button
                aria-pressed={whiteboard}
                onClick={() => setWhiteboard(true)}
                size="sm"
                variant={whiteboard ? "default" : "outline"}
              >
                <PenTool aria-hidden="true" className="size-4" />
                Whiteboard
              </Button>
            </div>
          </div>

          <Button asChild className="mt-6 w-full" size="lg">
            <Link href={interviewUrl} prefetch={false}>
              Start interview
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
          <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
            Your browser keeps your local practice history on this device.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import { ProblemBrowser } from "@/app/components/problem-browser";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Separator } from "@/app/components/ui/separator";
import {
  ArrowRight,
  AudioLines,
  Check,
  Code2,
  Gauge,
  Mic2,
  PenTool,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link
            aria-label="CodeTrial home"
            className="flex items-center gap-3"
            href="/"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Code2 aria-hidden="true" className="size-5" />
            </span>
            <span className="text-base font-semibold tracking-tight">
              CodeTrial
            </span>
          </Link>
          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-8 text-sm text-muted-foreground md:flex"
          >
            <a
              className="transition-colors hover:text-foreground"
              href="#how-it-works"
            >
              How it works
            </a>
            <a
              className="transition-colors hover:text-foreground"
              href="#problems"
            >
              Problem bank
            </a>
          </nav>
          <Button asChild size="sm">
            <a href="#practice">
              Start practice
              <ArrowRight aria-hidden="true" className="size-4" />
            </a>
          </Button>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-28 size-96 rounded-full border-[1px] border-primary/10"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-8 -top-12 size-64 rounded-full border-[1px] border-primary/10"
          />
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div className="relative">
              <Badge
                className="mb-6 gap-2 border-primary/10 bg-white/80 px-3 py-1 text-primary"
                variant="outline"
              >
                <Sparkles
                  aria-hidden="true"
                  className="size-3.5 text-amber-600"
                />
                Voice practice that feels like the real thing
              </Badge>
              <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
                Get comfortable
                <span className="block text-muted-foreground">
                  thinking out loud.
                </span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
                Work through a coding interview with Jim, an AI interviewer who
                listens, asks focused questions, and follows your code as it
                changes.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <a href="#practice">
                    Choose a practice
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href="#how-it-works">See how it works</a>
                </Button>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Check
                    aria-hidden="true"
                    className="size-4 text-emerald-700"
                  />
                  No account required
                </span>
                <span className="inline-flex items-center gap-2">
                  <Check
                    aria-hidden="true"
                    className="size-4 text-emerald-700"
                  />
                  Private guest room
                </span>
              </div>
            </div>

            <Card className="relative overflow-hidden border-primary/10 bg-primary text-primary-foreground shadow-xl">
              <div
                aria-hidden="true"
                className="absolute -right-10 -top-10 size-48 rounded-full bg-white/5"
              />
              <CardHeader className="relative pb-4">
                <Badge
                  className="w-fit border-white/15 bg-white/10 text-white"
                  variant="outline"
                >
                  Your practice room
                </Badge>
                <CardTitle className="pt-3 text-2xl text-white">
                  A calmer way to prepare
                </CardTitle>
                <p className="max-w-sm text-sm leading-6 text-white/70">
                  Speak, code, run tests, and explain what you would improve
                  next.
                </p>
              </CardHeader>
              <CardContent className="relative space-y-5">
                <div className="rounded-xl border border-white/15 bg-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-lg bg-amber-300 text-amber-950">
                      <AudioLines aria-hidden="true" className="size-5" />
                    </span>
                    <div>
                      <p className="font-medium text-white">
                        Jim is ready when you are
                      </p>
                      <p className="mt-1 text-sm text-white/65">
                        A live voice conversation, not a script
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/15 p-4">
                    <Code2
                      aria-hidden="true"
                      className="mb-3 size-5 text-amber-300"
                    />
                    <p className="text-sm font-medium">Your own workspace</p>
                    <p className="mt-1 text-xs leading-5 text-white/65">
                      Editor, examples, and tests together
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/15 p-4">
                    <Gauge
                      aria-hidden="true"
                      className="mb-3 size-5 text-amber-300"
                    />
                    <p className="text-sm font-medium">Useful feedback</p>
                    <p className="mt-1 text-xs leading-5 text-white/65">
                      A clear review when your session ends
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/65">
                  <Mic2 aria-hidden="true" className="size-4" />
                  Your microphone and speaker are checked before the interview
                  starts.
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section
          className="mx-auto max-w-7xl px-5 py-14 sm:px-8"
          id="how-it-works"
        >
          <div className="grid gap-8 md:grid-cols-[0.7fr_1.3fr] md:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                The practice loop
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                A focused round, from hello to review.
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border bg-card p-4">
                <span className="mb-3 grid size-9 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                  <Mic2 aria-hidden="true" className="size-4" />
                </span>
                <p className="font-medium">Talk it through</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Clarify the problem and outline examples with Jim.
                </p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <span className="mb-3 grid size-9 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                  <Code2 aria-hidden="true" className="size-4" />
                </span>
                <p className="font-medium">Build and test</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Write a solution and run it against the provided cases.
                </p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <span className="mb-3 grid size-9 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                  <Gauge aria-hidden="true" className="size-4" />
                </span>
                <p className="font-medium">Review your work</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Get a session summary to guide your next practice.
                </p>
              </div>
            </div>
          </div>
          <Separator className="my-12" />
          <div id="practice">
            <ProblemBrowser />
          </div>
        </section>
      </main>

      <footer className="border-t bg-white/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="font-medium text-foreground">CodeTrial</p>
          <p>
            Practice interviews at your pace. No profile is needed to start.
          </p>
        </div>
      </footer>
    </div>
  );
}

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const source = path.join(repositoryRoot, "web");
const destination = path.join(repositoryRoot, "public", "legacy");

await mkdir(path.dirname(destination), { recursive: true });
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });

const legacyInterviewPath = path.join(destination, "interview.html");
const legacyInterview = await readFile(legacyInterviewPath, "utf8");
await writeFile(
  legacyInterviewPath,
  legacyInterview
    .replace('href="/styles.css"', 'href="/legacy/styles.css"')
    .replace(
      'src="/vendor/livekit-client.js"',
      'src="/legacy/vendor/livekit-client.js"',
    )
    .replace(
      'type="module" src="/interview.js"',
      'type="module" src="/legacy/interview.js"',
    ),
);

const legacyHomePath = path.join(destination, "index.html");
const legacyHome = await readFile(legacyHomePath, "utf8");
await writeFile(
  legacyHomePath,
  legacyHome
    .replace('href="/styles.css"', 'href="/legacy/styles.css"')
    .replace(
      'type="module" src="/app.js"',
      'type="module" src="/legacy/app.js"',
    ),
);

const legacyAppPath = path.join(destination, "app.js");
const legacyApp = await readFile(legacyAppPath, "utf8");
await writeFile(
  legacyAppPath,
  legacyApp.replace(
    'new URL("/interview", window.location.origin)',
    'new URL("/classic/interview", window.location.origin)',
  ),
);

console.log(
  "Prepared the existing lobby and interview clients at public/legacy.",
);

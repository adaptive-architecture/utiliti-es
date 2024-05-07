import { rm } from "node:fs/promises";

const directories = ["./dist", "./docs/public/api-docs", "./docs/.vitepress/dist"];
for (const directory of directories) {
  await rm(directory, { force: true, recursive: true });
  console.log(`Deleted '${directory}' directory`);
}

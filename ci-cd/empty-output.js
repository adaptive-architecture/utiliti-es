import { rm } from "node:fs/promises";

await rm("./dist", { force: true, recursive: true });
await rm("./docs/.site", { force: true, recursive: true });
console.log("Deleted './dist' directory");

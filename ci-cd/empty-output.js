import { rm } from "node:fs/promises";

await rm("./dist", { force: true, recursive: true });
console.log("Deleted './dist' directory");
await rm("./docs/.site", { force: true, recursive: true });
console.log("Deleted './docs/.site' directory");

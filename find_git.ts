import { readdirSync, statSync } from "fs";
import { join } from "path";

function findGit(dir: string, depth = 0) {
  if (depth > 6) return;
  try {
    const files = readdirSync(dir);
    for (const file of files) {
      const fullPath = join(dir, file);
      if (file === ".git") {
        console.log("Found .git in:", fullPath);
      }
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory() && file !== "node_modules" && file !== ".next" && file !== "dist" && file !== ".git") {
          findGit(fullPath, depth + 1);
        }
      } catch (err) {}
    }
  } catch (err) {}
}

console.log("Searching for .git folder in /...");
findGit("/");
console.log("Done searching.");

import { execSync } from "child_process";

try {
  console.log("=== Git Status ===");
  try {
    console.log(execSync("git status", { encoding: "utf8" }));
  } catch (err: any) {
    console.error("git status failed:", err.message || err);
  }

  console.log("=== Git Remotes ===");
  try {
    console.log(execSync("git remote -v", { encoding: "utf8" }));
  } catch (err: any) {
    console.error("git remote failed:", err.message || err);
  }

  console.log("=== Git Branches ===");
  try {
    console.log(execSync("git branch -a", { encoding: "utf8" }));
  } catch (err: any) {
    console.error("git branch failed:", err.message || err);
  }

  console.log("=== Git Recent Commits ===");
  try {
    console.log(execSync("git log -n 5 --oneline", { encoding: "utf8" }));
  } catch (err: any) {
    console.error("git log failed:", err.message || err);
  }
} catch (e: any) {
  console.error("Execution error:", e);
}

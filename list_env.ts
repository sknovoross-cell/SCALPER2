console.log("=== Environment Variables (keys and non-sensitive values) ===");
for (const key of Object.keys(process.env)) {
  const value = process.env[key];
  if (
    key.toLowerCase().includes("key") ||
    key.toLowerCase().includes("secret") ||
    key.toLowerCase().includes("token") ||
    key.toLowerCase().includes("pwd") ||
    key.toLowerCase().includes("pass")
  ) {
    console.log(`${key}: [SECRET REDACTED]`);
  } else {
    console.log(`${key}: ${value}`);
  }
}

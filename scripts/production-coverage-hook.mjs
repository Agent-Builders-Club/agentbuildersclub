// Private process-local counter dump; enabled only by the CI coverage runner.
import fs from "node:fs";
import path from "node:path";
if (process.env.COVERAGE_PRIVATE_DIR) {
  process.on("SIGUSR2", () => {
    fs.mkdirSync(process.env.COVERAGE_PRIVATE_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(process.env.COVERAGE_PRIVATE_DIR, `node-${process.pid}.json`),
      JSON.stringify(globalThis.__coverage__ || {}),
    );
  });
}

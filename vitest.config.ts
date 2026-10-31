import { resolve } from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ quiet: true });

const swapDb = (url = "") => url.replace(/\/dar_quran(\?|$)/, "/dar_quran_test$1");
const alias = { "@": resolve(__dirname, "src") };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        resolve: { alias, conditions: ["react-server"] },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 30000,
          hookTimeout: 120000,
          env: {
            DATABASE_URL: swapDb(process.env.DATABASE_URL),
            APP_DATABASE_URL: swapDb(process.env.APP_DATABASE_URL),
            APP_ENV: "test",
            SMTP_HOST: "",
          },
        },
      },
    ],
  },
});

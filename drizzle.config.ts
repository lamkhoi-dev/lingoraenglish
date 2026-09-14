import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./src/db/schema",
  schema: "./src/db/schema/*.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgres://postgres:devpassword@localhost:15432/lingoraenglish",
  },
  schemaFilter: ["public", "auth"],
});

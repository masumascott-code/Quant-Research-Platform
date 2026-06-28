import { db, systemSettingsTable } from "@workspace/db";

const requiredSettings = [
  {
    key: "deployment.mode",
    value: "production",
  },
];

for (const setting of requiredSettings) {
  await db.insert(systemSettingsTable).values(setting).onConflictDoNothing();
}

console.log(
  JSON.stringify({
    status: "ok",
    seeded: requiredSettings.map((setting) => setting.key),
  }),
);

export {};

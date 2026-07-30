export async function seed(_opts: { force?: boolean } = {}): Promise<{ seeded: boolean }> {
  // Launchpad seed data (students, donors, finance snapshots) removed.
  // Add QuickBooks / School Rollup seed data here once those connectors exist.
  return { seeded: false };
}

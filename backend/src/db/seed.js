require('dotenv').config();
const { initDb } = require('./database');
const { runSeed } = require('./seed-data');

async function seed() {
  const db = await initDb();
  await runSeed(db);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

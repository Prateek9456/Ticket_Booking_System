const cron = require('node-cron');
const { getDb } = require('../db/database');
const { releaseExpiredHolds, expireWaitlistOffers } = require('../services/seatHold');

function startSchedulers() {
  cron.schedule('* * * * *', async () => {
    try {
      const db = getDb();
      const released = await releaseExpiredHolds(db);
      const expiredOffers = await expireWaitlistOffers(db);
      if (released > 0) console.log(`Released ${released} expired seat hold(s)`);
      if (expiredOffers > 0) console.log(`Expired ${expiredOffers} waitlist offer(s)`);
    } catch (err) {
      console.error('Scheduler error:', err.message);
    }
  });
  console.log('Schedulers started (seat hold + waitlist expiry every minute)');
}

module.exports = { startSchedulers };

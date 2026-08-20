const cron = require('node-cron');
const { getDb } = require('../db/database');
const { releaseExpiredHolds, expireWaitlistOffers } = require('../services/seatHold');

function startSchedulers() {
  cron.schedule('* * * * *', () => {
    const db = getDb();
    const released = releaseExpiredHolds(db);
    const expiredOffers = expireWaitlistOffers(db);
    if (released > 0) console.log(`Released ${released} expired seat hold(s)`);
    if (expiredOffers > 0) console.log(`Expired ${expiredOffers} waitlist offer(s)`);
  });
  console.log('Schedulers started (seat hold + waitlist expiry every minute)');
}

module.exports = { startSchedulers };

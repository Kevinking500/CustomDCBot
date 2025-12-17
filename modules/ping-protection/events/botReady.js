const { enforceRetention } = require('../ping-protection');
const schedule = require('node-schedule');

module.exports.run = async function (client) {
    await enforceRetention(client);

    // Schedules daily retention at 03:00 local bot time with cronjob
    const job = schedule.scheduleJob('0 3 * * *', async () => {
        await enforceRetention(client);
    });
    client.jobs.push(job);
};
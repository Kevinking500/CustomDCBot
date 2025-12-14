const { enforceRetention } = require('../ping-protection');
const schedule = require('node-schedule');
const { localize } = require('../../../src/functions/localize');

module.exports.run = async function (client) {
    try {
        await client.models['ping-protection']['PingHistory'].sync();
        await client.models['ping-protection']['ModerationLog'].sync();
        await client.models['ping-protection']['LeaverData'].sync();
        
    } catch (e) {
    }

    await enforceRetention(client);

    // Schedules daily retention at 03:00 local bot time with cronjob
    const job = schedule.scheduleJob('0 3 * * *', async () => {
        await enforceRetention(client);
    });
    client.jobs.push(job);
};
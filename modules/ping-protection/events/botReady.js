const { enforceRetention } = require('../ping-protection');
const schedule = require('node-schedule');
const { localize } = require('../../src/functions/localize');

module.exports.run = async function (client) {
    try {
        await client.models['ping-protection']['PingHistory'].sync();
        await client.models['ping-protection']['ModerationLog'].sync();
        await client.models['ping-protection']['LeaverData'].sync();
        
        client.logger.debug('[ping-protection] ' + localize('ping-protection', 'log-db-synced'));
    } catch (e) {
        client.logger.error('[ping-protection] Failed to sync database models: ' + e);
    }

    // Run Retention Checks
    await enforceRetention(client);

    // Schedule Retention Job (03:00 daily via cronjob)
    const job = schedule.scheduleJob('0 3 * * *', async () => {
        await enforceRetention(client);
    });
    client.jobs.push(job);
};
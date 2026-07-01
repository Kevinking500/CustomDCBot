const {Op} = require('sequelize');
const schedule = require('node-schedule');
const {registerProtectedMessageProvider} = require('../../../src/functions/protectedMessages');

// Restore auto-delete protection for starboard entries on startup (channel from config).
registerProtectedMessageProvider(async (client) => {
    if (!client.modules['starboard']?.enabled) return [];
    const channelId = client.configurations['starboard']?.['config']?.channelId;
    if (!channelId) return [];
    const rows = await client.models['starboard']['StarMsg'].findAll({attributes: ['starMsg']});
    return rows
        .filter(r => r.starMsg)
        .map(r => ({
            channelId,
            messageId: r.starMsg
        }));
});

module.exports.run = async function (client) {
    const job = schedule.scheduleJob('1 0 * * *', async () => { // Every day at 00:01 https://crontab.guru/#0_0_*_*_
        client.models['starboard']['StarUser'].destroy({
            where: {
                createdAt: {
                    [Op.lt]: Date.now() - 1000 * 60 * 60
                }
            }
        });
    });
    client.jobs.push(job);
};
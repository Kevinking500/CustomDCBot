const {updateMessage} = require('../polls');
const {scheduleJob} = require('node-schedule');
const {
    protectMessage,
    registerProtectedMessageProvider
} = require('../../../src/functions/protectedMessages');

// Restore auto-delete protection for still-running polls from the database on startup.
registerProtectedMessageProvider(async (client) => {
    if (!client.modules['polls']?.enabled) return [];
    const now = Date.now();
    const rows = await client.models['polls']['Poll'].findAll({attributes: ['channelID', 'messageID', 'expiresAt']});
    return rows
        .filter(r => r.channelID && r.messageID && (!r.expiresAt || new Date(r.expiresAt).getTime() > now))
        .map(r => ({
            channelId: r.channelID,
            messageId: r.messageID
        }));
});

module.exports.run = async (client) => {
    const polls = await client.models['polls']['Poll'].findAll();

    polls.forEach(poll => {
        const running = !poll.expiresAt || new Date(poll.expiresAt).getTime() > new Date().getTime();
        if (running) protectMessage(client, poll.channelID, poll.messageID);
        if (poll.expiresAt && new Date(poll.expiresAt).getTime() > new Date().getTime()) scheduleJob(new Date(poll.expiresAt), async () => {
            await updateMessage(await client.channels.fetch(poll.channelID), poll, poll.messageID);
        });
    });
};
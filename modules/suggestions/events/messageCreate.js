const {createSuggestion} = require('../suggestion');
const {registerProtectedMessageProvider} = require('../../../src/functions/protectedMessages');

// Restore auto-delete protection for suggestions on startup (channel comes from config).
registerProtectedMessageProvider(async (client) => {
    if (!client.modules['suggestions']?.enabled) return [];
    const channelId = client.configurations['suggestions']?.['config']?.suggestionChannel;
    if (!channelId) return [];
    const rows = await client.models['suggestions']['Suggestion'].findAll({attributes: ['messageID']});
    return rows
        .filter(r => r.messageID)
        .map(r => ({
            channelId,
            messageId: r.messageID
        }));
});

module.exports.run = async function (client, msg) {
    if (msg.author.bot || !msg.guild || msg.guild.id !== client.config.guildID) return;
    if (!client.configurations['suggestions']['config'].createSuggestionFromMessagesInChannel || client.configurations['suggestions']['config'].suggestionChannel !== msg.channel.id) return;
    await msg.delete();
    await createSuggestion(msg.guild, msg.cleanContent, msg.author);
};
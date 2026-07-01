const {localize} = require('../../../src/functions/localize');
const {memberCanSendInChannel} = require('../../../src/functions/helpers');
const {buildQuoteMessage} = require('../renderQuote');

module.exports.config = {
    name: 'Quote Message',
    type: 'MESSAGE',
    contextMenu: true,
    description: localize('message-quotes', 'quote-message-description')
};

/*
 * Builds the quote with the exact same renderer the auto-quote event uses (buildQuoteMessage,
 * shared in renderQuote.js) and posts it into the current channel. The link is reconstructed
 * from the target message's guild/channel/id. The quoter is the command user, so the
 * selfQuote=false config still suppresses quoting your own message. Replies ephemerally when
 * the quote is suppressed by config (noBots / selfQuote).
 */
module.exports.run = async function (interaction) {
    if (!memberCanSendInChannel(interaction.member, interaction.channel)) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('command', 'no-send-permission')
    });
    const target = interaction.targetMessage;
    const link = `https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}/${target.id}`;

    const sendOptions = await buildQuoteMessage(interaction.client, target, interaction.channel, link, interaction.user.id);
    if (!sendOptions) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('message-quotes', 'quote-message-not-allowed')
    });

    await interaction.channel.send(sendOptions);
    return interaction.reply({
        ephemeral: true,
        content: '✅ ' + localize('message-quotes', 'quote-message-posted')
    });
};

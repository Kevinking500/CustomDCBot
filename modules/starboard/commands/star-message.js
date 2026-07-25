const {localize} = require('../../../src/functions/localize');
const handleStarboard = require('../handleStarboard.js');

module.exports.config = {
    name: 'Star Message',
    type: 'MESSAGE',
    contextMenu: true,
    description: localize('starboard', 'star-message-description')
};

/*
 * Force-stars the right-clicked message by reusing handleStarboard() with options.force (bypasses the
 * self-star removal and minStars threshold). Synthesizes the minimal msgReaction handleStarboard reads.
 */
module.exports.run = async function (interaction) {
    const target = interaction.targetMessage;
    const starConfig = interaction.client.configurations['starboard']['config'];

    const msgReaction = {
        message: target,
        partial: false,
        count: typeof starConfig.minStars === 'number' ? starConfig.minStars : 1,
        emoji: {toString: () => starConfig.emoji},
        users: {
            remove: async () => {
            },
            cache: {has: () => false}
        }
    };

    await handleStarboard(interaction.client, msgReaction, interaction.user, false, {force: true});

    return interaction.reply({
        ephemeral: true,
        content: '✅ ' + localize('starboard', 'star-message-success')
    });
};
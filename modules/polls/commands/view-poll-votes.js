const {localize} = require('../../../src/functions/localize');
const {buildPublicVotesEmbed} = require('../polls');

module.exports.config = {
    name: 'View Poll Votes',
    type: 'MESSAGE',
    contextMenu: true,
    description: localize('polls', 'view-poll-votes-description')
};

// Resolves the poll from the right-clicked message and renders the voter list via buildPublicVotesEmbed. Ephemeral.
module.exports.run = async function (interaction) {
    const target = interaction.targetMessage;
    const poll = await interaction.client.models['polls']['Poll'].findOne({
        where: {messageID: target.id}
    });
    if (!poll) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('polls', 'not-a-poll')
    });

    return interaction.reply({
        ephemeral: true,
        embeds: [buildPublicVotesEmbed(interaction, poll)]
    });
};

const {localize} = require('../../../src/functions/localize');
const {applySuggestionDecision} = require('../suggestion');

/*
 * Handles the modal submit from the "Approve Suggestion" / "Deny Suggestion" context commands.
 * The customId encodes suggestion-decision:<approve|deny>:<suggestionMessageID>. The suggestion is
 * resolved by its stored messageID and the shared applySuggestionDecision flow is reused (the same
 * one /manage-suggestion uses) so the embed is regenerated and members are notified. The comment
 * input is optional.
 */
module.exports.run = async (client, interaction) => {
    if (!interaction.isModalSubmit || !interaction.isModalSubmit()) return;
    if (!(interaction.customId || '').startsWith('suggestion-decision:')) return;

    const parts = interaction.customId.split(':');
    const action = parts[1];
    const messageID = parts[2];

    const suggestion = await client.models['suggestions']['Suggestion'].findOne({
        where: {messageID}
    });
    if (!suggestion) return interaction.reply({
        ephemeral: true,
        content: '⚠️ ' + localize('suggestions', 'suggestion-not-found')
    });

    await interaction.deferReply({ephemeral: true});

    const comment = interaction.fields.getTextInputValue('comment') || null;
    await applySuggestionDecision(client, suggestion, action, comment, interaction.user.id);

    return interaction.editReply({content: '✅ ' + localize('suggestions', 'updated-suggestion')});
};

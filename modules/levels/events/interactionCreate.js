const {localize} = require('../../../src/functions/localize');
const {embedType, formatNumber} = require('../../../src/functions/helpers');
const {calculateLevelXP, displayLevel, isMaxLevel} = require('./messageCreate');

module.exports.run = async function (client, interaction) {
    if (!interaction.client.botReadyAt) return;

    /*
     * Modal submits from the "Set User XP" / "Set User Level" context commands (customId <prefix>:<userId>).
     * Runs before the isButton guard so they are not swallowed; re-enforces the allowCheats gate and calls
     * the shared runXPAction/runLevelAction cores (which deferReply themselves, so we must not defer first).
     */
    if (interaction.isModalSubmit() && (interaction.customId.startsWith('set-user-xp:') || interaction.customId.startsWith('set-user-level:'))) {
        const isXP = interaction.customId.startsWith('set-user-xp:');
        if (!client.configurations['levels']['config']['allowCheats']) return interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('command', 'command-disabled')
        });

        const userId = interaction.customId.split(':')[1];
        const raw = interaction.fields.getTextInputValue('value').trim();
        const value = Number(raw);
        if (!Number.isFinite(value)) return interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('levels', isXP ? 'set-xp-invalid-value' : 'set-level-invalid-value')
        });

        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        if (!member) return interaction.reply({
            ephemeral: true,
            content: '⚠️ ' + localize('levels', 'user-not-found')
        });

        const {
            runXPAction,
            runLevelAction
        } = require('../commands/manage-levels');
        if (isXP) return runXPAction(interaction, () => value, member);
        return runLevelAction(interaction, () => value, member);
    }

    if (!interaction.isButton()) return;
    if (interaction.customId !== 'show-level-on-liveleaderboard-click') return;
    const user = await interaction.client.models['levels']['User'].findOne({
        where: {
            userID: interaction.user.id
        }
    });
    if (!user) return interaction.reply({
        ephemeral: true,
        content: localize('levels', 'please-send-a-message')
    });
    const nextLevelXp = calculateLevelXP(client, user.level + 1);
    interaction.reply(embedType(client.configurations['levels']['strings']['leaderboard-button-answer'], {
        '%name%': interaction.user.username,
        '%level%': displayLevel(user.level, client),
        '%userXP%': formatNumber(isMaxLevel(user.level, client) ? calculateLevelXP(client, client.configurations['levels']['config'].maximumLevel - 1) : user.xp),
        '%nextLevelXP%': isMaxLevel(user.level, client) ? '∞' : formatNumber(nextLevelXp)
    }, {ephemeral: true}));
};
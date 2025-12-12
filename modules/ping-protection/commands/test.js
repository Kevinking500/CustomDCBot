module.exports = {
    name: 'test',
    description: 'Replies with a test message',

    options: [],

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     */
    async execute(interaction) {
        const embed = {
            title: 'Test Message',
            description: 'This is a test',
            color: 0x2b2d31
        };

        await interaction.reply({
            content: 'testy',
            embeds: [embed]
        });
    }
};

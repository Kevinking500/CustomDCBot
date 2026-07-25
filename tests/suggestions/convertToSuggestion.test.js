/*
 * Tests for the "Convert to Suggestion" MESSAGE context-menu command
 * (modules/suggestions/commands/convert-to-suggestion.js).
 *
 * The command reuses createSuggestion(guild, cleanContent, author) with the target message's
 * cleanContent and original author, then edits the deferred reply with the success embed.
 * createSuggestion and embedType are mocked so we assert on delegation, not suggestion creation.
 */
jest.mock('../../src/functions/localize', () => ({localize: (file, key) => `${file}.${key}`}));
jest.mock('../../src/functions/helpers', () => ({
    embedType: jest.fn((tpl, params) => ({
        tpl,
        params
    }))
}));
jest.mock('../../modules/suggestions/suggestion', () => ({createSuggestion: jest.fn()}));

const {createSuggestion} = require('../../modules/suggestions/suggestion');
const {embedType} = require('../../src/functions/helpers');
const command = require('../../modules/suggestions/commands/convert-to-suggestion');

function makeInteraction() {
    return {
        targetMessage: {
            cleanContent: 'please add dark mode',
            author: {id: 'author1'}
        },
        guild: {id: 'g1'},
        user: {id: 'staff1'},
        client: {configurations: {suggestions: {config: {successfullySubmitted: 'tpl'}}}},
        deferReply: jest.fn().mockResolvedValue(),
        editReply: jest.fn().mockResolvedValue()
    };
}

beforeEach(() => {
    createSuggestion.mockReset();
    embedType.mockClear();
});

describe('Convert to Suggestion context command', () => {
    test('config is a MANAGE_MESSAGES MESSAGE context command', () => {
        expect(command.config.name).toBe('Convert to Suggestion');
        expect(command.config.type).toBe('MESSAGE');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toEqual(['MANAGE_MESSAGES']);
    });

    test('defers, reuses createSuggestion with the target cleanContent + author, and confirms', async () => {
        createSuggestion.mockResolvedValue({id: 7});
        const interaction = makeInteraction();
        await command.run(interaction);

        expect(interaction.deferReply).toHaveBeenCalledWith({ephemeral: true});
        expect(createSuggestion).toHaveBeenCalledWith(interaction.guild, 'please add dark mode', interaction.targetMessage.author);
        expect(embedType).toHaveBeenCalledWith('tpl', {'%id%': 7});
        expect(interaction.editReply).toHaveBeenCalledWith({
            tpl: 'tpl',
            params: {'%id%': 7}
        });
    });
});
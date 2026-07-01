/*
 * Tests for the "Approve Suggestion" / "Deny Suggestion" MESSAGE context-menu commands
 * (commands/approve-suggestion.js, commands/deny-suggestion.js) and the modal-submit handler
 * that runs the actual decision (events/interactionCreate.js).
 *
 * Each command resolves the Suggestion by messageID === targetMessage.id, then opens a modal with
 * an optional comment whose customId encodes the action + suggestion message id. The modal-submit
 * handler re-resolves the suggestion and reuses the shared applySuggestionDecision flow. When no
 * suggestion matches, both the command and the handler reply ephemerally.
 */
jest.mock('../../src/functions/localize', () => ({localize: (file, key) => `${file}.${key}`}));
jest.mock('../../modules/suggestions/suggestion', () => ({applySuggestionDecision: jest.fn().mockResolvedValue()}));

const {applySuggestionDecision} = require('../../modules/suggestions/suggestion');
const approve = require('../../modules/suggestions/commands/approve-suggestion');
const deny = require('../../modules/suggestions/commands/deny-suggestion');
const event = require('../../modules/suggestions/events/interactionCreate');

function makeCommandInteraction({suggestion = {messageID: 'm1'}} = {}) {
    return {
        targetMessage: {id: 'm1'},
        client: {models: {suggestions: {Suggestion: {findOne: jest.fn().mockResolvedValue(suggestion)}}}},
        reply: jest.fn().mockResolvedValue(),
        showModal: jest.fn().mockResolvedValue(),
        deferReply: jest.fn().mockResolvedValue()
    };
}

beforeEach(() => applySuggestionDecision.mockClear());

describe('Approve / Deny Suggestion config', () => {
    test.each([
        ['approve', approve, 'Approve Suggestion'],
        ['deny', deny, 'Deny Suggestion']
    ])('%s is a MANAGE_MESSAGES MESSAGE context command', (_label, command, name) => {
        expect(command.config.name).toBe(name);
        expect(command.config.type).toBe('MESSAGE');
        expect(command.config.contextMenu).toBe(true);
        expect(command.config.defaultMemberPermissions).toEqual(['MANAGE_MESSAGES']);
    });
});

describe('Approve / Deny command run', () => {
    test.each([
        ['approve', approve],
        ['deny', deny]
    ])('%s opens a modal encoding the action + suggestion message id and does not defer', async (action, command) => {
        const interaction = makeCommandInteraction();
        await command.run(interaction);

        expect(interaction.deferReply).not.toHaveBeenCalled();
        expect(interaction.showModal).toHaveBeenCalledTimes(1);
        const json = interaction.showModal.mock.calls[0][0].toJSON();
        expect(json.custom_id).toBe(`suggestion-decision:${action}:m1`);
        const input = json.components[0].components[0];
        expect(input.custom_id).toBe('comment');
        expect(input.required).toBe(false);
    });

    test('replies ephemerally and opens no modal when no suggestion matches', async () => {
        const interaction = makeCommandInteraction({suggestion: null});
        await approve.run(interaction);
        expect(interaction.showModal).not.toHaveBeenCalled();
        const payload = interaction.reply.mock.calls[0][0];
        expect(payload.ephemeral).toBe(true);
        expect(payload.content).toContain('suggestions.suggestion-not-found');
    });
});

describe('modal-submit decision handler', () => {
    function makeModalInteraction({
                                      suggestion = {messageID: 'm1'},
                                      comment = 'looks good',
                                      customId = 'suggestion-decision:approve:m1'
                                  } = {}) {
        return {
            isModalSubmit: () => true,
            customId,
            fields: {getTextInputValue: jest.fn(() => comment)},
            user: {id: 'admin1'},
            reply: jest.fn().mockResolvedValue(),
            deferReply: jest.fn().mockResolvedValue(),
            editReply: jest.fn().mockResolvedValue(),
            _suggestion: suggestion
        };
    }

    function makeClient(suggestion) {
        return {models: {suggestions: {Suggestion: {findOne: jest.fn().mockResolvedValue(suggestion)}}}};
    }

    test('ignores non-decision modal submits', async () => {
        const interaction = makeModalInteraction({customId: 'something-else'});
        await event.run(makeClient({messageID: 'm1'}), interaction);
        expect(interaction.deferReply).not.toHaveBeenCalled();
        expect(applySuggestionDecision).not.toHaveBeenCalled();
    });

    test('ignores non-modal interactions', async () => {
        const interaction = makeModalInteraction();
        interaction.isModalSubmit = () => false;
        await event.run(makeClient({messageID: 'm1'}), interaction);
        expect(applySuggestionDecision).not.toHaveBeenCalled();
    });

    test('resolves the suggestion and delegates to applySuggestionDecision with the comment', async () => {
        const suggestion = {messageID: 'm1'};
        const client = makeClient(suggestion);
        const interaction = makeModalInteraction({
            comment: 'great idea',
            customId: 'suggestion-decision:deny:m1'
        });
        await event.run(client, interaction);

        expect(client.models.suggestions.Suggestion.findOne).toHaveBeenCalledWith({where: {messageID: 'm1'}});
        expect(interaction.deferReply).toHaveBeenCalledWith({ephemeral: true});
        expect(applySuggestionDecision).toHaveBeenCalledWith(client, suggestion, 'deny', 'great idea', 'admin1');
        expect(interaction.editReply.mock.calls[0][0].content).toContain('suggestions.updated-suggestion');
    });

    test('passes null when the comment is left empty', async () => {
        const suggestion = {messageID: 'm1'};
        const interaction = makeModalInteraction({comment: ''});
        await event.run(makeClient(suggestion), interaction);
        expect(applySuggestionDecision).toHaveBeenCalledWith(expect.anything(), suggestion, 'approve', null, 'admin1');
    });

    test('replies ephemerally when the suggestion is gone', async () => {
        const interaction = makeModalInteraction();
        await event.run(makeClient(null), interaction);
        expect(applySuggestionDecision).not.toHaveBeenCalled();
        const payload = interaction.reply.mock.calls[0][0];
        expect(payload.ephemeral).toBe(true);
        expect(payload.content).toContain('suggestions.suggestion-not-found');
    });
});
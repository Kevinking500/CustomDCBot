/*
 * The economy USER context-menu commands are thin adapters over the existing /economy
 * subcommands. "Rob User" delegates straight to the shared robUser core (no amount, no modal).
 * "Add Money" / "Remove Money" / "Set Balance" first run the shared admin guard, then open a
 * modal collecting the amount; their modal-submit (in events/interactionCreate.js) validates the
 * amount and calls the matching shared core so the output is identical to the slash command.
 *
 * The shared cores are mocked here so we assert only the adapter wiring (config shape, delegation,
 * modal opening, customId encoding). Tests must not depend on description/title localize keys.
 */
const mockRobUser = jest.fn().mockResolvedValue('robbed');
const mockAddMoney = jest.fn().mockResolvedValue('added');
const mockRemoveMoney = jest.fn().mockResolvedValue('removed');
const mockSetMoney = jest.fn().mockResolvedValue('set');
const mockAdminGuard = jest.fn().mockResolvedValue(true);

jest.mock('../../modules/economy-system/commands/economy-system', () => ({
    robUser: (...a) => mockRobUser(...a),
    addMoney: (...a) => mockAddMoney(...a),
    removeMoney: (...a) => mockRemoveMoney(...a),
    setMoney: (...a) => mockSetMoney(...a),
    adminGuard: (...a) => mockAdminGuard(...a)
}));

/*
 * Short return so modal title/label stay within Discord's builder length limits; the adapters'
 * wiring (customId, input name) is what these tests assert, not the localized text.
 */
jest.mock('../../src/functions/localize', () => ({localize: () => 'L'}));

const robUserCmd = require('../../modules/economy-system/commands/rob-user');
const addMoneyCmd = require('../../modules/economy-system/commands/add-money');
const removeMoneyCmd = require('../../modules/economy-system/commands/remove-money');
const setBalanceCmd = require('../../modules/economy-system/commands/set-balance');

const strings = {robSuccess: 'x'};
const config = {
    publicCommandReplies: false,
    robPercent: 50
};

function makeInteraction(targetUser = {
    id: 't1',
    tag: 'T#1'
}) {
    return {
        targetUser,
        showModal: jest.fn().mockResolvedValue(),
        client: {
            configurations: {
                'economy-system': {
                    strings,
                    config
                }
            }
        }
    };
}

beforeEach(() => {
    mockRobUser.mockClear();
    mockAddMoney.mockClear();
    mockRemoveMoney.mockClear();
    mockSetMoney.mockClear();
    mockAdminGuard.mockClear().mockResolvedValue(true);
});

describe('config shapes', () => {
    test('Rob User: USER context, everyone (no permissions)', () => {
        expect(robUserCmd.config.type).toBe('USER');
        expect(robUserCmd.config.contextMenu).toBe(true);
        expect(robUserCmd.config.defaultMemberPermissions).toBeUndefined();
        expect(robUserCmd.config.name).toBe('Rob User');
    });

    test('Add/Remove/Set: USER context, ADMINISTRATOR only', () => {
        for (const cmd of [addMoneyCmd, removeMoneyCmd, setBalanceCmd]) {
            expect(cmd.config.type).toBe('USER');
            expect(cmd.config.contextMenu).toBe(true);
            expect(cmd.config.defaultMemberPermissions).toEqual(['ADMINISTRATOR']);
        }
        expect(addMoneyCmd.config.name).toBe('Add Money');
        expect(removeMoneyCmd.config.name).toBe('Remove Money');
        expect(setBalanceCmd.config.name).toBe('Set Balance');
    });
});

describe('Rob User adapter', () => {
    test('delegates to robUser with the target user, wires str/config, opens no modal', async () => {
        const interaction = makeInteraction();
        await robUserCmd.run(interaction);
        expect(interaction.str).toBe(strings);
        expect(interaction.config).toBe(config);
        expect(mockRobUser).toHaveBeenCalledWith(interaction, interaction.targetUser);
        expect(interaction.showModal).not.toHaveBeenCalled();
    });
});

describe('Add/Remove/Set adapters open a modal', () => {
    const cases = [
        ['add', addMoneyCmd],
        ['remove', removeMoneyCmd],
        ['set', setBalanceCmd]
    ];

    test.each(cases)('%s: runs admin guard then shows a modal with eco-ctx:%s:<targetId>', async (action, cmd) => {
        const interaction = makeInteraction({
            id: 'victim',
            tag: 'V#1'
        });
        await cmd.run(interaction);
        expect(mockAdminGuard).toHaveBeenCalledWith(interaction, interaction.targetUser);
        expect(interaction.showModal).toHaveBeenCalledTimes(1);
        const modal = interaction.showModal.mock.calls[0][0].toJSON();
        expect(modal.custom_id).toBe(`eco-ctx:${action}:victim`);
        // single text input named 'amount'
        expect(modal.components[0].components[0].custom_id).toBe('amount');
    });

    test.each(cases)('%s: when the admin guard fails, no modal is shown', async (action, cmd) => {
        mockAdminGuard.mockResolvedValue(false);
        const interaction = makeInteraction();
        await cmd.run(interaction);
        expect(interaction.showModal).not.toHaveBeenCalled();
    });
});
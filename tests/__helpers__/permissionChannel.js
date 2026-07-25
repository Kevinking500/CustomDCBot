/*
 * Test helpers for the memberCanSendInChannel guard used by context-menu commands.
 * Build channel mocks whose permissionsFor() grants or denies the send permission
 * (and ViewChannel), mirroring how discord.js exposes channel.permissionsFor(member).
 */
const {PermissionFlagsBits} = require('discord.js');

/**
 * Builds a channel mock that grants ViewChannel + the relevant send permission.
 * @param {Object} extra Extra properties merged onto the channel
 * @param {boolean} isThread Whether the channel reports as a thread
 * @returns {Object} Channel mock
 */
function allowingChannel(extra = {}, isThread = false) {
    return {
        id: 'chan1',
        isThread: () => isThread,
        permissionsFor: () => ({
            has: (perm) => perm === PermissionFlagsBits.ViewChannel ||
                perm === PermissionFlagsBits.SendMessages ||
                perm === PermissionFlagsBits.SendMessagesInThreads
        }),
        ...extra
    };
}

/**
 * Builds a channel mock that denies the send permission (ViewChannel granted, send denied).
 * @param {Object} extra Extra properties merged onto the channel
 * @param {boolean} isThread Whether the channel reports as a thread
 * @returns {Object} Channel mock
 */
function denyingChannel(extra = {}, isThread = false) {
    return {
        id: 'chan1',
        isThread: () => isThread,
        permissionsFor: () => ({
            has: (perm) => perm === PermissionFlagsBits.ViewChannel
        }),
        ...extra
    };
}

module.exports = {
    allowingChannel,
    denyingChannel
};
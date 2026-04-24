# Custom-Bot v3

Create your own Discord bot - fully customizable and modular. This bot is for advanced JS users with experience in
JavaScript, discord.js, and JSON configuration.

## Get your own Custom-Bot for free

Go check it out on our [website](https://scnx.xyz) (the [dashboard](https://scnx.app) and bot are fully translated). In
addition to the features available here, we offer:

* Free hosting
* Custom commands
* Easy-to-use embed editor and configuration editor
* Send and edit messages in specific channels
* Human-readable issue reporting
* Modern dashboard
* and a lot more

[Get started now](https://scnx.xyz) - it's free, forever!

## License

Please read the [license](LICENSE) before using this bot.

In short:

* **Disclose source** - your source code must be made available when using this bot
* **State changes** - every change to the source code must be documented and published

Please read the full [license](LICENSE). This is not legal advice. For information on how this aligns with the
closed-source SCNX version, see [this issue](https://github.com/SCNetwork/CustomDCBot/issues/13).

## Support development

Our business model is hosting these bots for servers. Feel free
to [contribute](.github/CONTRIBUTING.md), [donate on Patreon](https://patreon.com/scnetwork), or
on [any other platform](https://github.com/SCNetwork/CustomDCBot?sponsor=1).

## Installation

1. Clone this repo
2. Run `npm ci`
3. Run `npm run generate-config`
4. Replace your token in `config/config.json`
5. Start the bot with `npm start`
6. The bot generates `modules.json` and `strings.json` in your `config` directory - see [Configuration](#configuration)
   for details

When reading the code, you may encounter tracking/issue-reporting sections. These are only active in the SCNX version
and are used for bug detection and user-facing diagnostics (users can opt out; we use Sentry SDK with our own Glitchtip
instance). The open-source version does not contact SCNX or share any data.

## Features

* **Modular architecture** - enable, configure, and disable each module independently
* **Highly configurable** - every message, role, channel, and behavior can be customized
* **Custom modules** - add your own modules with commands, events, and database models
* **Auto-generated configs** - every config field has a description and default value

### Modules

The bot ships with 30+ modules including:

| Module                | Description                                                                                                                                     |
|-----------------------|-------------------------------------------------------------------------------------------------------------------------------------------------|
| **Moderation**        | Auto-mod (bad words, invite blocking with smart resolution, scam links), lockdown with configurable notification channels, warnings, quarantine |
| **Levels**            | XP system with role rewards, leaderboard, multipliers per role/channel, custom formulas                                                         |
| **Birthdays**         | Birthday tracking with admin management (`/manage-birthday`), lock/unlock, auto-announcements                                                   |
| **Tickets**           | Multi-category ticket system with transcripts                                                                                                   |
| **Giveaways**         | Giveaway creation and management                                                                                                                |
| **Activity Streaks**  | Daily/weekly/monthly streak tracking with nickname display, milestone roles, leaderboard, hide option, staff-managed or automatic mode          |
| **Guess the Number**  | Number guessing game with leaderboard and player statistics                                                                                     |
| **Welcome/Leave**     | Customizable welcome and leave messages                                                                                                         |
| **Logging**           | Audit log forwarding to Discord channels                                                                                                        |
| **Auto-React**        | Automatic reactions per channel, role, or user                                                                                                  |
| **Temp Channels**     | Temporary voice channels                                                                                                                        |
| **RSS Notifications** | RSS feed monitoring with notifications                                                                                                          |
| **Status Roles**      | Roles based on user presence/status                                                                                                             |
| **Applications**      | Application/form system with approval workflow                                                                                                  |
| **Economy**           | Virtual currency with shop system                                                                                                               |
| **And more**          | Team list, team goals, polls, partner list, invite tracking, starboard, live messages, etc.                                                     |

## Configuration

All configuration files live in your `config` folder. Each enabled module gets its own subfolder with config files.
These files are auto-generated with defaults and descriptions.

For embed-capable fields (`allowEmbed: true`), the value can be a plain string or an embed object with: `title`,
`message`, `description`, `color`, `url`, `image`, `thumbnail`, `author`, `fields`, `footer`, `footerImgUrl`. The footer
and timestamp are controlled globally via `strings.json`.

For full details on writing config files, see [developer-docs/configuration.md](developer-docs/configuration.md).

## Developer Documentation

Detailed guides for module developers:

| Document                                                     | Description                                                                                                                |
|--------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| [Configuration](developer-docs/configuration.md)             | How to write `config.json` files - field types, categories, conditional fields, parameters, config elements                |
| [Migrations](developer-docs/migration.md)                    | How to write safe database migrations - the `DatabaseSchemeVersion` pattern, shutdown protection, multi-version migrations |
| [Config Localization](developer-docs/config-localization.md) | How config translations work - external localization files, what gets localized, extraction script                         |

## Creating modules

As per the [license](LICENSE), you **must** make every module publicly available under the same license.

Before building a module, create an issue with your suggestion so nobody duplicates work. Submit modules via pull
request.

### Module structure

```
modules/your-module/
  module.json          # Module metadata (required)
  configs/
    config.json        # Configuration schema
  commands/
    your-command.js    # Slash commands
  events/
    botReady.js        # Event handlers
    messageCreate.js
  models/
    YourModel.js       # Sequelize models
```

### module.json

```json
{
  "name": "your-module",
  "humanReadableName": {
    "en": "Your Module",
    "de": "Dein Modul"
  },
  "description": {
    "en": "Short description",
    "de": "Kurze Beschreibung"
  },
  "author": {
    "name": "Your Name",
    "link": "https://your-site.com"
  },
  "commands-dir": "/commands",
  "events-dir": "/events",
  "models-dir": "/models",
  "config-example-files": [
    "configs/config.json"
  ]
}
```

Optional fields: `cli`, `on-load-event`, `tags`, `openSourceURL`, `fa-icon` (set by us - browse and request icons
at https://scnx.app/developers/icons).

### Commands

Export `run`, `config`, and optionally `subcommands`, `beforeSubcommand`, `autoComplete`:

```js
module.exports.run = async function (interaction) { /* ... */
};

module.exports.config = {
    name: 'your-command',
    description: localize('your-module', 'command-description'),
    defaultMemberPermissions: null, // null = everyone, ['Administrator'] = admin only
    options: [] // or async function(client) { return [...]; }
};
```

Use subcommands over separate commands - there's a 100-command limit. Use
`disabled: function(client) { return !condition; }` to conditionally hide commands.

### Events

Export a `run` function:

```js
module.exports.run = async function (client, ...args) { /* ... */
};
```

Use `botReady` instead of discord.js `ready` when you need configs loaded. Remember that `botReady` re-fires on config
reload - clean up intervals by pushing to `client.intervals` or `client.jobs`.

### Models

Use Sequelize models with the standard pattern. See [developer-docs/migration.md](developer-docs/migration.md) for
adding fields to existing models.

### Rules for modules

* Use slash commands with subcommands wherever possible
* Reply with ephemeral messages where it makes sense
* Export functions for cross-module interaction
* Use the newest Discord API features (buttons, selects, modals)
* Process and store only needed user data
* Support localization (see below)
* Follow the [SCNX ToS](https://scootk.it/scnx-tos), [Discord ToS](https://discord.com/tos),
  and [Discord Developer ToS](https://discord.com/developers/docs/legal)

### Localization

Use `localize(module, key, replacements)` from `src/functions/localize.js` for non-user-editable strings. Translations
happen on [Weblate](https://localize.sc-network.net/projects/custombot/locales/).

For user-editable strings (config fields), provide values in multiple languages using the `{ "en": "...", "de": "..." }`
pattern - the bot and dashboard select the correct one automatically.

### Helper functions

Check `src/functions/helpers.js` for utilities: `embedType()`, `formatDiscordUserName()`, `parseEmbedColor()`,
`formatDate()`, `truncate()`, and more.
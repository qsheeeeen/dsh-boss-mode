# dsh-boss-mode

**Boss mode** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): the main agent never touches files. It plans, delegates, follows up, and verifies while subagents do all the work.

Adds one card to the mode picker: `老板模式` (id `orchestrator`). Built-in modes are unchanged.

## Install

1. Clone this repository.
2. Install it as a profile bundle: `plugin_manager` → `install_bundle`, target = this directory (or use Creator mode).
3. Restart DSH.

Requires a desktop/web profile with `dsh-base` + `dsh-web-app`; delegated children run the shipped Standard preset.

## Tools

`subagent` · `send_message` · `interrupt_agent` · `list_agents` · `todo_write` · `ask_user_question` · `get_goal` / `create_goal` / `update_goal`

Children are durable and resume with `send_message` (delivery only — the answer arrives later). They cannot message each other; the parent relays.

## Customize

The system prompt is `persona.prefix` under `preset-orchestrator` in `cordis.patch.yml` (`complete: true`). Reinstall and restart DSH after editing. `index.js` masks the Host's globally registered tools.

## License

[MIT](LICENSE) © 2026 Q S.

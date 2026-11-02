# dsh-orchestrator-preset

**Boss mode** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): the main agent never reads or writes files. It plans, delegates, follows up, interrupts, and verifies, while subagents do all the work.

This adds one card to the mode picker — `老板模式` (id `orchestrator`). Built-in modes are unchanged.

## Install

1. Clone this repository.
2. Install it into your profile: `plugin_manager` → `install_bundle`, target = this directory (or use Creator mode).
3. Restart DSH.

Requires a desktop/web profile with the `dsh-base` and `dsh-web-app` bundles, plus the shipped Standard preset (children run it).

## Tools

| Tool | Purpose |
|---|---|
| `subagent` | Start a delegated child |
| `send_message` | Follow up or reply (`agent_id`) |
| `interrupt_agent` | Stop a child's current turn |
| `list_agents` | List your children and their status |
| `todo_write` | Plan and track steps |
| `ask_user_question` | Ask you for a decision |
| `get_goal` / `create_goal` / `update_goal` | One persisted long-running goal |

## Behavior

- **Children are durable.** A child that reported stays resumable; `send_message` wakes it with its context intact.
- **Delivery, not answers.** `send_message` returns only "message delivered"; the reply arrives later as another message. End your turn instead of polling.
- **Interrupt keeps the child.** `interrupt_agent` stops one turn; the child and its context remain.
- **Children cannot message each other.** Sibling communication is not part of this mode; the parent relays.
- **A child can message the parent** on its own (Standard gives it `send_message`), and the parent can reply.

## Rules the prompt enforces

- Plan with `todo_write` before dispatching; mark items complete only after checking the report.
- Goals only from a direct user request; read `get_goal` before `update_goal`; complete only when achieved; blocked needs the same blocker for three rounds.
- Decide engineering details yourself; use `ask_user_question` only for user-owned choices.
- Send an incomplete report back to the same child instead of guessing.

## Customize

- **System prompt:** `cordis.patch.yml` → `preset-orchestrator` → `persona.prefix`. `complete: true` means it replaces everything; only `{{model}}` is interpolated.
- **More delegation:** set `tool-subagent` → `maxDepth: 2`, or `allowedAgentPresets` to let the main agent pick a child preset.
- **Fewer tools:** remove the row from `cordis.patch.yml` and the name from `PRESET_TOOL_NAMES` in `index.js`.
- After editing, reinstall (remove + install) and restart DSH; existing sessions keep the composition they started with.

## Design notes

- **No separate worker preset.** The registry exposes every declared preset to the picker, and `agentPreset` can only name a declared one, so a private child preset would become user-selectable. Children reuse Standard.
- **`index.js` exists** because a preset cannot delete Host-registered globals (currently `working_directory`). It registers a restriction in the preset scope instead; the allowlist must match the preset's own tool names exactly.
- **Children run Standard**, so they also carry `subagent` tools (the depth cap of 1 rejects real calls) and `ask_user_question`; the prompt tells them to decide ambiguity themselves and finish.

## License

[MIT](LICENSE) © 2026 Q S.

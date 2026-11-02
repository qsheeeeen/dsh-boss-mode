# dsh-orchestrator-preset

A **Boss mode** agent preset for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): the main agent never reads or writes files itself. It plans, delegates, follows up, interrupts, audits, and asks you for decisions, while subagents do all the actual work.

The mode picker gains exactly one card (`老板模式`, id `orchestrator`). The built-in modes — Standard, PTC, Minimal, Creator — are unchanged, and no second card appears.

## Install

The package is a local bundle with no dependencies:

1. Clone or copy this directory somewhere on the machine that runs DSH.
2. Install it into your profile from an agent session (`plugin_manager`, action `install_bundle`, target = the absolute directory), or through Creator mode.
3. Restart DSH. The new mode then appears in the mode picker and in Settings → General → Agent preset.

Only the desktop/web profile is supported: it needs the `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app` bundles, because the Web surface is what moves model-facing tools behind agent presets.

## What it composes

| Plugin | Role |
|---|---|
| `@deepseek-ai/dsh-persona` (`complete: true`) | Replaces the whole system prompt. Harness identity, tool guidance, and the persona suffix are not appended. |
| `@deepseek-ai/dsh-time-context` | Current time as runtime context (not a prompt section, so `complete` does not remove it). |
| `@local/dsh-orchestrator-preset` (`index.js`) | Masks every globally inherited tool, leaving only the preset's own tools. |
| `@deepseek-ai/dsh-tool-subagent` (`agentPreset: standard`) | `subagent`: start a delegated child. |
| `@deepseek-ai/dsh-tool-subagent-control` | `send_message`: follow up or reply; `interrupt_agent`: stop the current turn. |
| `@deepseek-ai/dsh-tool-subagent-control/list-agents` | `list_agents`: inventory the children you started. |
| `@deepseek-ai/dsh-tool-todo` | `todo_write`: the main agent's own step list (multiple `in_progress` allowed). |
| `@deepseek-ai/dsh-tool-ask-user` | `ask_user_question`: structured decisions from you. |
| `@deepseek-ai/dsh-tool-goal` | `get_goal` / `create_goal` / `update_goal`: one persisted long-running objective. |
| `dsh-compaction-basic` + `dsh-command-compact` | History compaction (`isolate: { compaction: true }`). |

So the main agent sees exactly nine tools:

| Tool | Management role |
|---|---|
| `subagent` | Create |
| `send_message` | Communicate |
| `interrupt_agent` | Control |
| `list_agents` | Inventory |
| `todo_write` | Plan and track steps |
| `ask_user_question` | Escalate decisions |
| `get_goal` / `create_goal` / `update_goal` | Cross-turn objective |

## Communication semantics

- Children are not one-shot. A `spawn`-backed child keeps a durable session: after it reports it becomes inactive, and `send_message` wakes it again with its own context intact.
- `send_message({ agent_id, message })` returns only delivery, never an answer. A running child receives the message at its next step (Steer); an inactive child starts a new turn. Its reply arrives later as another message, so end your turn after sending instead of polling.
- `interrupt_agent({ agent_id })` stops only the child's current turn. The child, its inbox, and its context survive, so you can keep sending messages afterwards.
- `list_agents({ scope })` lists direct children by default; `scope: "descendants"` walks the whole tree with each entry's parent and depth. Use it when a child id has scrolled out of view rather than starting a duplicate child.
- A child can also message the main agent on its own (the Standard composition gives it `send_message`), and the main agent can answer through the same `agent_id`.

## Management semantics

The system prompt enforces four things:

- **Plan before dispatching.** Anything past one step starts with `todo_write`: one item per delegated workstream. Dispatch marks an item `in_progress`; only a checked report marks it `completed`. The list is a ledger of what is still missing, not a report to the user.
- **Goals span turns; todos are steps.** `create_goal` only when the user's own request asks for a long-running objective. Read `get_goal` first to copy the exact id and revision. Only a direct user request can create, edit, pause, or resume a goal; a subagent's suggestion is not authority. Mark complete only when the objective is actually achieved; mark blocked only after the same concrete blocker persisted for at least three rounds, named in `blocked_reason`. After a session resume an active goal is disarmed — resume it when the user asks to continue.
- **Decide what you can decide.** File layout, naming, and test strategy belong to the subagent being briefed. `ask_user_question` is for scope, priorities, irreversible trade-offs, and access or credentials you cannot infer. Ask once, with the options already narrowed down, and keep working on everything that does not depend on the answer.
- **Verify.** A report can be incomplete or wrong. Send the same child a precise follow-up instead of guessing at the missing result.

## Why there is no separate "worker" preset

The preset registry returns **every declared preset** to the mode picker (`agentPresets/list`), and `tool-subagent`'s `agentPreset` can only name a **declared** preset. This Harness version has no "hidden" or "child-only" flag, so a dedicated worker preset would necessarily appear in the picker for users to select directly.

This bundle therefore declares no worker. Delegated children reuse the shipped Standard composition: full shell, file read/write/edit, search, web, and skills — and users can already select it, so the picker is not cluttered.

The trade-off: a Standard child also carries `subagent`-style tools (the default delegation depth cap is 1, so a real call fails with a depth error) and `ask_user_question`. The Boss-mode prompt therefore tells the main agent to instruct each subagent to pick the most reasonable interpretation of any ambiguity, state that choice, and finish.

## Why `index.js` exists

The Web surface moves model-facing tools behind presets, but the Host still registers a few tools globally — currently `working_directory` — and every agent inherits them. A preset can add tools to its own scope but cannot delete an inherited one. The only two ways to remove one are disabling the Host row (which strips it from every preset) or registering an intersecting restriction on the agent scope chain.

`index.js` takes the second route: it registers `ctx.tools.restrict({ deny })` in the preset's own scope, so only agents composed from this preset are affected. A restriction may name only tools the scope **inherits** — naming a tool the preset registers itself makes `restrict()` throw — so `PRESET_TOOL_NAMES` must match the preset's own tool names exactly:

- one missing name → `restrict()` throws and the whole preset fails to activate (loud, not silent);
- one extra name → that tool is masked away from the very agent that needs it.

The current list is the nine names above. A `tools/change` listener masks anything registered globally later, such as an MCP tool.

## Changing the system prompt

- The prompt lives in `cordis.patch.yml`, `preset-orchestrator` → `persona.prefix`. `complete: true` means this text is the entire system prompt.
- Because of `complete: true`, the goal policy section that `tool-goal` normally registers is dropped, which is why the "who may create a goal", the blocked threshold, and the resume rule are written into the prompt. If you change `tool-goal`'s `blockedAfterConsecutiveRounds`, update the "three rounds" wording too.
- The prefix is a template: only registered variables are allowed; `{{model}}` is available. An unknown `{{...}}` reference fails prompt assembly instead of being ignored.
- After editing, reinstall the bundle (remove it, then install again — installing the same version twice is refused) and restart DSH. The running process keeps the module it loaded, and existing sessions keep the composition they started with; new sessions and new children pick up the new version.

## Making it yours

- **Nested delegation:** give `tool-subagent` `maxDepth: 2` and mount delegation tools in the child preset.
- **Model choice for children:** add `allowedAgentPresets: [standard, minimal]` to `tool-subagent`; the tool gains an `agent_preset` parameter.
- **Fewer tools for the main agent:** delete the row from `cordis.patch.yml` and the matching name from `PRESET_TOOL_NAMES`.
- **Sibling communication between children:** not possible with plain subagents. The experimental Agent Teams bundle offers it (named teammates, peer messages, a shared task board), but its tools replace the `send_message` / `list_agents` / `interrupt_agent` names, so the two schemes cannot be mixed.

## Files

```
package.json        bundle manifest + display metadata exports
cordis.patch.yml    the Boss-mode preset declaration (system prompt lives here)
index.js            the preset-scoped global-tool mask
locale/{en,zh}.json plugin-page title and description
icon.svg            icon
```

## License

No license file is included yet. Add one before distributing the package if you want others to reuse it.

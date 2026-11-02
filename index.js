/**
 * Boss mode tool scope.
 *
 * A preset can compose the tools its agents add, but it cannot delete the tools
 * the Host registers globally: every agent inherits those. The only two ways to
 * take one away from an agent are a host-row disable (which would strip it from
 * every preset) or an intersecting restriction on the agent's scope chain.
 *
 * This row takes the second route. It runs inside the preset's own scope, so
 * the restriction it registers is inherited by every agent composed from the
 * preset, and no other preset is affected. The restriction may only name tools
 * the scope inherits, never tools the preset registers itself, so the preset's
 * own delegation tools are skipped here and stay visible.
 */

/**
 * Every tool this preset registers itself; keep in sync with `cordis.patch.yml`.
 *
 * Two reasons this set must be exact: `ctx.tools.restrict()` rejects a name the
 * calling scope registers itself, so a missing entry fails the preset at
 * activation; and a name added to the preset without adding it here would be
 * masked away from the very agent that needs it.
 */
const PRESET_TOOL_NAMES = new Set([
  'subagent',
  'send_message',
  'interrupt_agent',
  'list_agents',
  'todo_write',
  'ask_user_question',
  'get_goal',
  'create_goal',
  'update_goal',
])

export const name = 'boss-tool-scope'

export const inject = ['tools']

export function apply(ctx) {
  /** Global names already covered by a restriction registered here. */
  const masked = new Set()

  /**
   * Mask every tool this preset's agents would otherwise inherit. Called once
   * at activation and again whenever the tool set changes, so a globally
   * registered tool (an MCP server, a late host row) cannot slip past.
   */
  const maskInheritedTools = () => {
    const names = ctx.tools
      .schemas()
      .map((schema) => schema.name)
      .filter((name) => !PRESET_TOOL_NAMES.has(name) && !masked.has(name))
    if (names.length === 0) return
    // Record before restricting: registering the restriction emits
    // `tools/change`, which re-enters this function.
    for (const name of names) masked.add(name)
    ctx.effect(() => ctx.tools.restrict({ deny: names }))
  }

  maskInheritedTools()
  ctx.on('tools/change', maskInheritedTools)
}

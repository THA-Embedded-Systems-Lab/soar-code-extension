export const SOAR_MCP_TOOL_NAMES = {
  datamapGet: 'datamap_get_tree',
  datamapCreateAttribute: 'datamap_create_attribute_vertex',
  datamapCreateLinkedAttribute: 'datamap_create_linked_attribute_edge',
  datamapUpdateAttribute: 'datamap_update_attribute_edge',
  datamapDeleteAttribute: 'datamap_delete_attribute_edge',
  datamapCheckIntegrity: 'datamap_check_integrity',
  projectValidateAgainstDatamap: 'project_validate_soar_files_against_datamap',
  projectGetActive: 'project_get_active_soar_project',
  layoutAddOperator: 'layout_add_operator_node',
  layoutAddImpasseOperator: 'layout_add_impasse_operator_node',
  layoutAddFile: 'layout_add_production_file_node',
  layoutAddFolder: 'layout_add_folder_node',
  agentConnect: 'agent_runtime_connect',
  agentDisconnect: 'agent_runtime_disconnect',
  agentGetStatus: 'agent_runtime_get_status',
  getAgents: 'agent_runtime_list_agents',
  agentRun: 'agent_runtime_run_decision_cycles',
  agentStep: 'agent_runtime_step_decision_cycles',
  agentPause: 'agent_runtime_pause',
  executeCli: 'agent_runtime_exec_cli',
  // Individual Soar CLI command tools (for smaller/local LLMs)
  cliProduction: 'agent_runtime_cli_production',
  cliPrint: 'agent_runtime_cli_print',
  cliPreferences: 'agent_runtime_cli_preferences',
  cliEpmem: 'agent_runtime_cli_epmem',
  cliExplainTrackOperator: 'agent_runtime_cli_explain_track_operator',
  cliExplainUntrackOperator: 'agent_runtime_cli_explain_untrack_operator',
  cliExplainOperator: 'agent_runtime_cli_explain_operator',
} as const;

export const SOAR_MCP_TOOLS = [
  {
    name: SOAR_MCP_TOOL_NAMES.datamapGet,
    description: 'Get datamap tree for a Soar project file',
    inputSchema: {
      type: 'object',
      required: ['projectFile'],
      properties: {
        projectFile: { type: 'string' },
        rootVertexId: { type: 'string' },
        maxDepth: { type: 'integer', minimum: 1, maximum: 20 },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.datamapCreateAttribute,
    description: 'Create a new attribute and target vertex under a SOAR_ID parent',
    inputSchema: {
      type: 'object',
      required: ['projectFile', 'parentVertexId', 'attributeName', 'type'],
      properties: {
        projectFile: { type: 'string' },
        parentVertexId: { type: 'string' },
        attributeName: { type: 'string' },
        type: { type: 'string', enum: ['SOAR_ID', 'ENUMERATION', 'INTEGER', 'FLOAT', 'STRING'] },
        comment: { type: 'string' },
        enumChoices: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.datamapCreateLinkedAttribute,
    description: 'Create a linked attribute edge to an existing SOAR_ID vertex',
    inputSchema: {
      type: 'object',
      required: ['projectFile', 'parentVertexId', 'attributeName', 'targetVertexId'],
      properties: {
        projectFile: { type: 'string' },
        parentVertexId: { type: 'string' },
        attributeName: { type: 'string' },
        targetVertexId: { type: 'string' },
        comment: { type: 'string' },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.datamapUpdateAttribute,
    description: 'Update attribute name/comment, and enumeration values when applicable',
    inputSchema: {
      type: 'object',
      required: ['projectFile', 'parentVertexId', 'attributeName'],
      properties: {
        projectFile: { type: 'string' },
        parentVertexId: { type: 'string' },
        attributeName: { type: 'string' },
        newAttributeName: { type: 'string' },
        comment: { type: ['string', 'null'] },
        enumChoices: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.datamapDeleteAttribute,
    description: 'Delete attribute edge, and optionally remove only link edge',
    inputSchema: {
      type: 'object',
      required: ['projectFile', 'parentVertexId', 'attributeName'],
      properties: {
        projectFile: { type: 'string' },
        parentVertexId: { type: 'string' },
        attributeName: { type: 'string' },
        removeLinkOnly: { type: 'boolean' },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.datamapCheckIntegrity,
    description:
      'Check the datamap for structural integrity problems: dangling linked attributes (edge target missing from the datamap) and linked attributes whose target is not reachable from the datamap root',
    inputSchema: {
      type: 'object',
      required: ['projectFile'],
      properties: {
        projectFile: { type: 'string' },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.projectValidateAgainstDatamap,
    description: 'Validate all project Soar files against the project datamap',
    inputSchema: {
      type: 'object',
      required: ['projectFile'],
      properties: {
        projectFile: { type: 'string' },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.projectGetActive,
    description:
      'Get the currently active Soar project from workspace state persisted by the extension',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceRoot: { type: 'string' },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.layoutAddOperator,
    description: 'Add an operator node/file under a layout parent node and update datamap',
    inputSchema: {
      type: 'object',
      required: ['projectFile', 'parentNodeId', 'operatorName'],
      properties: {
        projectFile: { type: 'string' },
        parentNodeId: { type: 'string' },
        operatorName: { type: 'string' },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.layoutAddImpasseOperator,
    description: 'Add an impasse operator node/file under a layout parent node',
    inputSchema: {
      type: 'object',
      required: ['projectFile', 'parentNodeId', 'impasseName'],
      properties: {
        projectFile: { type: 'string' },
        parentNodeId: { type: 'string' },
        impasseName: {
          type: 'string',
          enum: [
            'Impasse__Operator_Tie',
            'Impasse__Operator_Conflict',
            'Impasse__Operator_Constraint-Failure',
            'Impasse__State_No-Change',
          ],
        },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.layoutAddFile,
    description: 'Add a production file node/file under a layout parent node',
    inputSchema: {
      type: 'object',
      required: ['projectFile', 'parentNodeId', 'fileName'],
      properties: {
        projectFile: { type: 'string' },
        parentNodeId: { type: 'string' },
        fileName: { type: 'string' },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.layoutAddFolder,
    description: 'Add a folder node/directory under a layout parent node',
    inputSchema: {
      type: 'object',
      required: ['projectFile', 'parentNodeId', 'folderName'],
      properties: {
        projectFile: { type: 'string' },
        parentNodeId: { type: 'string' },
        folderName: { type: 'string' },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.agentConnect,
    description: 'Connect to a running Soar kernel over SML socket for agent runtime control',
    inputSchema: {
      type: 'object',
      properties: {
        host: { type: 'string', default: '127.0.0.1' },
        port: { type: 'integer', minimum: 1, maximum: 65535, default: 12121 },
        agent: { type: 'string', default: '' },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.agentDisconnect,
    description: 'Disconnect from the Soar SML socket runtime session',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.agentGetStatus,
    description:
      'Get current agent runtime connection/session state. Requires agent_runtime_connect before.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.getAgents,
    description: 'List Soar agents currently available in the connected runtime',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.agentRun,
    description: 'Run decision cycles for an agent (or continue running)',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string' },
        count: { type: 'integer', minimum: 1 },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.agentStep,
    description: 'Step an agent by one or more single decision cycles',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string' },
        count: { type: 'integer', minimum: 1 },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.agentPause,
    description: 'Pause a running Soar agent (issues stop command)',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string' },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.executeCli,
    description: 'Evaluate a Soar command line against an agent runtime session',
    inputSchema: {
      type: 'object',
      required: ['line'],
      properties: {
        agent: { type: 'string' },
        line: { type: 'string' },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.cliProduction,
    description:
      'Run a Soar production command. Sub-commands: break [--clear|--print|--set <prod>], excise [<prod>|--all|--chunks|--default|--never-fired|--rl|--task|--templates|--user], find [--lhs|--rhs] <pattern> [--show-bindings] [--chunks|--nochunks], firing-counts [--all|--chunks|--default|--rl|--task|--templates|--user|--fired] [n|<prod>], matches [--names|--count] <prod> [--timetags|--wmes], memory-usage [<prod>], optimize-attribute [symbol [n]], watch [--disable|--enable] <prod>.',
    inputSchema: {
      type: 'object',
      required: ['subcommand'],
      properties: {
        agent: {
          type: 'string',
          description: 'Agent name (uses current session agent if omitted)',
        },
        subcommand: {
          type: 'string',
          description:
            'The production sub-command and its arguments, e.g. "firing-counts --all" or "excise my*production"',
        },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.cliPrint,
    description:
      'Print items from production memory or working memory. Options: --all/-a, --chunks/-c, --defaults/-D, --justifications/-j, --rl/-r, --template/-T, --user/-u, --full/-f, --filename/-F, --internal/-i, --name/-n, --depth/-d <n>, --exact/-e, --tree/-t, --varprint/-v, --stack/-s, --operators/-o, --states/-S, --gds. Accepts a production name, identifier, timetag, or WME pattern.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          description: 'Agent name (uses current session agent if omitted)',
        },
        target: {
          type: 'string',
          description:
            'What to print: a production name, identifier (e.g. "S1"), timetag, WME pattern (e.g. "(s1 ^* v2)"), or omit for current state/operator',
        },
        options: {
          type: 'string',
          description:
            'Additional flags and options, e.g. "--depth 2 --tree" or "--internal" or "--stack"',
        },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.cliPreferences,
    description:
      'Examine preferences supporting an identifier and attribute. Options: --none/-0/-n (preferences only), --names/-1/-N (+ production names), --timetags/-2/-t (+ timetags), --wmes/-3/-w (+ full WMEs), --object/-o (all WMEs for the identifier). Defaults to current state ^operator when no args given.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          description: 'Agent name (uses current session agent if omitted)',
        },
        identifier: {
          type: 'string',
          description: 'Soar identifier, e.g. "S1" or "O3". Omit to use current state.',
        },
        attribute: {
          type: 'string',
          description: 'Attribute to examine, e.g. "operator" or "jug". Omit to use ^operator.',
        },
        options: {
          type: 'string',
          description: 'Detail flags: --none, --names, --timetags, --wmes, --object',
        },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.cliEpmem,
    description:
      'Control or query episodic memory. Sub-commands: enable/disable/init/close, get <param>, set <param> <value>, stats [<stat>], timers [<timer>], viz <episode-id>, print <episode-id>, backup <file>. Key params: learning (on/off), database (file/memory), path, trigger (dc/output/none), balance [0-1], graph-match (on/off).',
    inputSchema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          description: 'Agent name (uses current session agent if omitted)',
        },
        subcommand: {
          type: 'string',
          description:
            'The epmem sub-command and arguments, e.g. "--enable", "--get learning", "--set learning on", "--stats", "--print 5"',
        },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.cliExplainTrackOperator,
    description:
      'Manage explain tracking list via `explain track-operator`. With `all=true`, tracks all operators. With `operatorName`, tracks one operator. With neither, returns current tracking list.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          description: 'Agent name (uses current session agent if omitted)',
        },
        operatorName: {
          type: 'string',
          description: 'Operator name to track, e.g. "move-north"',
        },
        all: {
          type: 'boolean',
          description: 'If true, appends --all to enable tracking all operators',
        },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.cliExplainUntrackOperator,
    description:
      'Remove one operator from tracking via `explain untrack-operator <name>`. Use `operatorName="all"` to disable all-mode tracking.',
    inputSchema: {
      type: 'object',
      required: ['operatorName'],
      properties: {
        agent: {
          type: 'string',
          description: 'Agent name (uses current session agent if omitted)',
        },
        operatorName: {
          type: 'string',
          description: 'Operator name to untrack, or "all" to disable all-mode',
        },
      },
    },
  },
  {
    name: SOAR_MCP_TOOL_NAMES.cliExplainOperator,
    description:
      'Get recorded decision-cycle explanations for one operator. Runs `explain operator <name>` and supports optional JSON output with --json.',
    inputSchema: {
      type: 'object',
      required: ['operatorName'],
      properties: {
        agent: {
          type: 'string',
          description: 'Agent name (uses current session agent if omitted)',
        },
        operatorName: {
          type: 'string',
          description: 'Operator name to explain, e.g. "move-north"',
        },
        json: {
          type: 'boolean',
          description: 'If true, appends --json for machine-readable output',
        },
      },
    },
  },
] as const;

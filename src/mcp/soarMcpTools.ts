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
  executeCli: 'agent_runtime_eval_command',
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
        host: { type: 'string' },
        port: { type: 'integer', minimum: 1, maximum: 65535 },
        agent: { type: 'string' },
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
    description: 'Get current agent runtime connection/session state',
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
] as const;

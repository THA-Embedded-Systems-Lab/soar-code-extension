export const SOAR_MCP_TOOL_NAMES = {
  datamapGet: 'datamap_get',
  datamapCreateAttribute: 'datamap_create_attribute',
  datamapCreateLinkedAttribute: 'datamap_create_linked_attribute',
  datamapUpdateAttribute: 'datamap_update_attribute',
  datamapDeleteAttribute: 'datamap_delete_attribute',
  projectValidateAgainstDatamap: 'project_validate_against_datamap',
  projectGetActive: 'project_get_active',
  layoutAddOperator: 'layout_add_operator',
  layoutAddImpasseOperator: 'layout_add_impasse_operator',
  layoutAddFile: 'layout_add_file',
  layoutAddFolder: 'layout_add_folder',
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
    description: 'Update attribute name and/or comment',
    inputSchema: {
      type: 'object',
      required: ['projectFile', 'parentVertexId', 'attributeName'],
      properties: {
        projectFile: { type: 'string' },
        parentVertexId: { type: 'string' },
        attributeName: { type: 'string' },
        newAttributeName: { type: 'string' },
        comment: { type: ['string', 'null'] },
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
] as const;

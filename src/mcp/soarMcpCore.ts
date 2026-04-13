import * as fs from 'fs';
import * as path from 'path';
import {
  DatamapIntegrityIssue,
  DatamapMetadataCache,
  DatamapProjectContext,
} from '../datamap/datamapMetadata';
import { DatamapOperations } from '../datamap/datamapOperations';
import { SoarTemplates } from '../layout/soarTemplates';
import { SourceScriptManager } from '../layout/sourceScriptManager';
import { DatamapValidator, ValidationError } from '../datamap/datamapValidator';
import { SmlArgument, SmlSocketClient } from '../debug/smlSocketClient';
import { generateVertexId } from '../server/idGeneration';
import { ProjectLoader } from '../server/projectLoader';
import { SoarParser } from '../server/soarParser';
import {
  DMVertex,
  ImpasseName,
  LayoutNode,
  OutEdge,
  ProjectContext,
  SoarIdVertex,
  hasChildren,
} from '../server/visualSoarProject';

export type DatamapValueType = 'SOAR_ID' | 'ENUMERATION' | 'INTEGER' | 'FLOAT' | 'STRING';

export interface CreateAttributeInput {
  projectFile: string;
  parentVertexId: string;
  attributeName: string;
  type: DatamapValueType;
  comment?: string;
  enumChoices?: string[];
}

export interface CreateLinkedAttributeInput {
  projectFile: string;
  parentVertexId: string;
  attributeName: string;
  targetVertexId: string;
  comment?: string;
}

export interface UpdateAttributeInput {
  projectFile: string;
  parentVertexId: string;
  attributeName: string;
  newAttributeName?: string;
  comment?: string | null;
  enumChoices?: string[];
}

export interface DeleteAttributeInput {
  projectFile: string;
  parentVertexId: string;
  attributeName: string;
  removeLinkOnly?: boolean;
}

export interface GetDatamapInput {
  projectFile: string;
  rootVertexId?: string;
  maxDepth?: number;
}

export interface ValidateProjectInput {
  projectFile: string;
}

export interface CheckDatamapIntegrityInput {
  projectFile: string;
}

export interface GetActiveProjectInput {
  workspaceRoot?: string;
}

export interface AddLayoutOperatorInput {
  projectFile: string;
  parentNodeId: string;
  operatorName: string;
}

export interface AddLayoutImpasseOperatorInput {
  projectFile: string;
  parentNodeId: string;
  impasseName: ImpasseName;
}

export interface AddLayoutFileInput {
  projectFile: string;
  parentNodeId: string;
  fileName: string;
}

export interface AddLayoutFolderInput {
  projectFile: string;
  parentNodeId: string;
  folderName: string;
}

export interface DebugConnectInput {
  host?: string;
  port?: number;
  agent?: string;
}

export interface DebugRunInput {
  agent?: string;
  count?: number;
}

export interface DebugStepInput {
  agent?: string;
  count?: number;
}

export interface DebugPauseInput {
  agent?: string;
}

export interface DebugEvalInput {
  agent?: string;
  line: string;
}

interface DebugSessionState {
  host: string;
  port: number;
  currentAgent: string;
  soarCycleExecuting: boolean;
}

export interface ValidationSummary {
  totalFiles: number;
  filesWithIssues: number;
  totalIssues: number;
  issuesByFile: Record<string, ValidationError[]>;
  datamapIssues: DatamapIntegrityIssue[];
}

export class SoarMcpCore {
  private readonly loader = new ProjectLoader();
  private readonly parser = new SoarParser();
  private readonly validator = new DatamapValidator();
  private debugClient: SmlSocketClient | undefined;
  private debugSession: DebugSessionState | undefined;

  async getDatamap(input: GetDatamapInput): Promise<any> {
    const context = await this.loadDatamapContext(input.projectFile);
    const maxDepth = Math.max(1, input.maxDepth ?? 8);
    const rootVertexId = input.rootVertexId || context.project.datamap.rootId;
    const root = this.buildDatamapTree(context, rootVertexId, maxDepth, new Set<string>());

    return {
      projectFile: context.projectFile,
      rootVertexId,
      root,
    };
  }

  async createAttribute(input: CreateAttributeInput): Promise<any> {
    const context = await this.loadDatamapContext(input.projectFile);
    const parent = this.getSoarIdVertex(context, input.parentVertexId);

    this.assertAttributeName(input.attributeName);
    if (parent.outEdges?.some(edge => edge.name === input.attributeName)) {
      throw new Error(`Attribute '${input.attributeName}' already exists on parent '${parent.id}'`);
    }

    const newVertexId = generateVertexId(context.project.datamap.vertices.map(vertex => vertex.id));
    const newVertex: DMVertex = {
      id: newVertexId,
      type: input.type,
      outEdges: input.type === 'SOAR_ID' ? [] : undefined,
      choices:
        input.type === 'ENUMERATION' ? this.normalizeEnumChoices(input.enumChoices) : undefined,
    } as DMVertex;

    context.project.datamap.vertices.push(newVertex);
    context.datamapIndex.set(newVertexId, newVertex);

    if (!parent.outEdges) {
      parent.outEdges = [];
    }

    parent.outEdges.push({
      name: input.attributeName,
      toId: newVertexId,
      comment: input.comment || undefined,
    });

    await this.saveContext(context);

    return {
      parentVertexId: parent.id,
      attributeName: input.attributeName,
      createdVertexId: newVertexId,
      createdVertexType: newVertex.type,
    };
  }

  async createLinkedAttribute(input: CreateLinkedAttributeInput): Promise<any> {
    const context = await this.loadDatamapContext(input.projectFile);
    const parent = this.getSoarIdVertex(context, input.parentVertexId);
    const target = context.datamapIndex.get(input.targetVertexId);

    if (!target || target.type !== 'SOAR_ID') {
      throw new Error(`Linked target '${input.targetVertexId}' must exist and be type SOAR_ID`);
    }

    this.assertAttributeName(input.attributeName);
    if (parent.outEdges?.some(edge => edge.name === input.attributeName)) {
      throw new Error(`Attribute '${input.attributeName}' already exists on parent '${parent.id}'`);
    }

    if (!parent.outEdges) {
      parent.outEdges = [];
    }

    parent.outEdges.push({
      name: input.attributeName,
      toId: input.targetVertexId,
      comment: input.comment || undefined,
    });

    await this.saveContext(context);

    return {
      parentVertexId: parent.id,
      attributeName: input.attributeName,
      targetVertexId: input.targetVertexId,
    };
  }

  async updateAttribute(input: UpdateAttributeInput): Promise<any> {
    const context = await this.loadDatamapContext(input.projectFile);
    const parent = this.getSoarIdVertex(context, input.parentVertexId);
    const edge = parent.outEdges?.find(candidate => candidate.name === input.attributeName);

    if (!edge) {
      throw new Error(
        `Attribute '${input.attributeName}' was not found under parent '${input.parentVertexId}'`
      );
    }

    if (input.newAttributeName && input.newAttributeName !== input.attributeName) {
      this.assertAttributeName(input.newAttributeName);
      if (parent.outEdges?.some(candidate => candidate.name === input.newAttributeName)) {
        throw new Error(
          `Attribute '${input.newAttributeName}' already exists on parent '${input.parentVertexId}'`
        );
      }
      edge.name = input.newAttributeName;
    }

    if (input.comment !== undefined) {
      edge.comment =
        input.comment === null || input.comment.trim().length === 0 ? undefined : input.comment;
    }

    if (input.enumChoices !== undefined) {
      const targetVertex = context.datamapIndex.get(edge.toId);
      if (!targetVertex) {
        throw new Error(`Target vertex '${edge.toId}' was not found for attribute '${edge.name}'`);
      }
      if (targetVertex.type !== 'ENUMERATION') {
        throw new Error(
          `Attribute '${edge.name}' is type '${targetVertex.type}' and does not support enum choices`
        );
      }

      targetVertex.choices = this.normalizeEnumChoices(input.enumChoices);
    }

    await this.saveContext(context);

    const resultVertex = context.datamapIndex.get(edge.toId);

    return {
      parentVertexId: parent.id,
      attributeName: edge.name,
      targetVertexId: edge.toId,
      comment: edge.comment ?? null,
      enumChoices:
        resultVertex && resultVertex.type === 'ENUMERATION' ? (resultVertex.choices ?? []) : null,
    };
  }

  async deleteAttribute(input: DeleteAttributeInput): Promise<any> {
    const context = await this.loadDatamapContext(input.projectFile);
    return DatamapOperations.deleteAttributeCore(
      context,
      input.parentVertexId,
      input.attributeName,
      input.removeLinkOnly
    );
  }

  async validateProjectAgainstDatamap(input: ValidateProjectInput): Promise<ValidationSummary> {
    const context = await this.loadDatamapContext(input.projectFile);
    const soarFiles = this.collectSoarFilesFromLayout(context.project.layout);
    const projectDir = path.dirname(context.projectFile);

    const issuesByFile: Record<string, ValidationError[]> = {};
    let totalIssues = 0;
    let filesWithIssues = 0;

    for (const relativePath of soarFiles) {
      const absolutePath = path.resolve(projectDir, relativePath);
      if (!fs.existsSync(absolutePath)) {
        continue;
      }

      const fileText = await fs.promises.readFile(absolutePath, 'utf-8');
      const soarDoc = this.parser.parse(absolutePath, fileText, 1);
      const errors = this.validator.validateDocument(soarDoc, context, fileText, {
        sourceFilePath: absolutePath,
      });

      if (errors.length > 0) {
        filesWithIssues += 1;
        totalIssues += errors.length;
        issuesByFile[relativePath] = errors;
      }
    }

    const datamapIssues = DatamapMetadataCache.checkLinkedAttributeIntegrity(
      context.project,
      context.datamapIndex
    );

    return {
      totalFiles: soarFiles.length,
      filesWithIssues,
      totalIssues,
      issuesByFile,
      datamapIssues,
    };
  }

  async checkDatamapIntegrity(input: CheckDatamapIntegrityInput): Promise<{
    projectFile: string;
    issueCount: number;
    issues: DatamapIntegrityIssue[];
  }> {
    const context = await this.loadDatamapContext(input.projectFile);
    const issues = DatamapMetadataCache.checkLinkedAttributeIntegrity(
      context.project,
      context.datamapIndex
    );
    return {
      projectFile: context.projectFile,
      issueCount: issues.length,
      issues,
    };
  }

  async getActiveProject(input: GetActiveProjectInput): Promise<{
    workspaceRoot: string;
    projectFile: string | null;
    source: 'state-file' | 'discovery' | 'none';
  }> {
    const workspaceRoot = this.resolveWorkspaceRoot(input.workspaceRoot);
    const statePath = path.join(workspaceRoot, '.vscode', 'soar-active-project.json');

    try {
      if (fs.existsSync(statePath)) {
        const parsed = JSON.parse(await fs.promises.readFile(statePath, 'utf-8')) as {
          projectFile?: string;
        };

        if (parsed.projectFile && fs.existsSync(parsed.projectFile)) {
          return {
            workspaceRoot,
            projectFile: parsed.projectFile,
            source: 'state-file',
          };
        }
      }
    } catch {
      // ignore state read issues and fall back to discovery
    }

    const discovered = await this.loader.findProjectFileRecursive(workspaceRoot, 4);
    if (discovered) {
      return {
        workspaceRoot,
        projectFile: discovered,
        source: 'discovery',
      };
    }

    return {
      workspaceRoot,
      projectFile: null,
      source: 'none',
    };
  }

  async debugConnect(input: DebugConnectInput): Promise<{
    connected: boolean;
    host: string;
    port: number;
    currentAgent: string;
    agents: string[];
    version: string;
  }> {
    const host = input.host?.trim() || '127.0.0.1';
    const port = this.normalizePort(input.port);
    const requestedAgent = input.agent?.trim();

    const reconnectNeeded =
      !this.debugClient ||
      !this.debugSession ||
      this.debugSession.host !== host ||
      this.debugSession.port !== port;

    if (reconnectNeeded) {
      this.debugClient?.disconnect();
      this.debugClient = new SmlSocketClient({ host, port });
      await this.debugClient.connect();
    }

    const client = this.debugClient;
    if (!client) {
      throw new Error('Failed to initialize debug client');
    }

    const versionResponse = await client.call('version', [], { output: 'raw' });
    if (versionResponse.errorText) {
      throw new Error(`Kernel returned error for version: ${versionResponse.errorText}`);
    }

    const agents = await this.getAgentListFromKernel();
    const currentAgent = this.pickDebugAgent(requestedAgent, agents);

    this.debugSession = {
      host,
      port,
      currentAgent,
      soarCycleExecuting: false,
    };

    return {
      connected: true,
      host,
      port,
      currentAgent,
      agents,
      version: versionResponse.result?.text ?? 'unknown',
    };
  }

  async debugDisconnect(): Promise<{ disconnected: boolean }> {
    this.debugClient?.disconnect();
    this.debugClient = undefined;
    this.debugSession = undefined;
    return { disconnected: true };
  }

  async debugGetStatus(): Promise<{
    running: boolean;
    host: string | null;
    port: number | null;
    currentAgent: string | null;
    soarCycleExecuting: boolean;
  }> {
    if (!this.debugClient || !this.debugSession) {
      return {
        running: false,
        host: null,
        port: null,
        currentAgent: null,
        soarCycleExecuting: false,
      };
    }

    return {
      running: true,
      host: this.debugSession.host,
      port: this.debugSession.port,
      currentAgent: this.debugSession.currentAgent,
      soarCycleExecuting: this.debugSession.soarCycleExecuting,
    };
  }

  async debugGetAgents(): Promise<{ agents: string[]; currentAgent: string }> {
    await this.ensureDebugSession();
    const agents = await this.getAgentListFromKernel();
    this.debugSession!.currentAgent = this.pickDebugAgent(this.debugSession!.currentAgent, agents);

    return {
      agents,
      currentAgent: this.debugSession!.currentAgent,
    };
  }

  async debugRun(input: DebugRunInput): Promise<{
    agent: string;
    command: string;
    output: string;
    soarCycleExecuting: boolean;
  }> {
    await this.ensureDebugSession();
    const agent = await this.resolveDebugAgent(input.agent);
    const count = this.normalizePositiveInteger(input.count, 'count');
    const command = count ? `run ${count}` : 'run';
    const output = await this.runSmlCmdline(command, agent);
    this.debugSession!.soarCycleExecuting = true;

    return {
      agent,
      command,
      output,
      soarCycleExecuting: true,
    };
  }

  async debugStep(input: DebugStepInput): Promise<{
    agent: string;
    count: number;
    output: string[];
    soarCycleExecuting: boolean;
  }> {
    await this.ensureDebugSession();
    const agent = await this.resolveDebugAgent(input.agent);
    const count = this.normalizePositiveInteger(input.count, 'count') ?? 1;
    const output: string[] = [];

    for (let index = 0; index < count; index += 1) {
      output.push(await this.runSmlCmdline('step', agent));
    }

    this.debugSession!.soarCycleExecuting = false;

    return {
      agent,
      count,
      output,
      soarCycleExecuting: false,
    };
  }

  async debugPause(input: DebugPauseInput): Promise<{
    agent: string;
    output: string;
    soarCycleExecuting: boolean;
  }> {
    await this.ensureDebugSession();
    const agent = await this.resolveDebugAgent(input.agent);
    const output = await this.runSmlCmdline('stop', agent);
    this.debugSession!.soarCycleExecuting = false;

    return {
      agent,
      output,
      soarCycleExecuting: false,
    };
  }

  async debugEval(input: DebugEvalInput): Promise<{
    agent: string;
    line: string;
    output: string;
  }> {
    await this.ensureDebugSession();
    const line = input.line?.trim();
    if (!line) {
      throw new Error("'line' must be a non-empty string");
    }

    const agent = await this.resolveDebugAgent(input.agent);
    const output = await this.runSmlCmdline(line, agent);
    return {
      agent,
      line,
      output,
    };
  }

  async addLayoutOperator(input: AddLayoutOperatorInput): Promise<{
    nodeId: string;
    parentNodeId: string;
    operatorName: string;
    filePath: string;
    datamapId?: string;
  }> {
    const context = await this.loadProjectContext(input.projectFile);
    this.assertAttributeName(input.operatorName);

    const parentNode = context.layoutIndex.get(input.parentNodeId);
    if (!parentNode || !hasChildren(parentNode)) {
      throw new Error(
        `Parent node '${input.parentNodeId}' cannot contain child operators. Choose a folder/high-level node.`
      );
    }

    const workspaceFolder = path.dirname(context.projectFile);
    const parentFolderPath = this.getNodeFolderPath(context, input.parentNodeId);
    const operatorFile = `${input.operatorName}.soar`;
    const fullPath = path.join(workspaceFolder, parentFolderPath, operatorFile);

    if (fs.existsSync(fullPath)) {
      throw new Error(`Operator file already exists: ${operatorFile}`);
    }

    const stateContext = this.findParentStateContext(context, input.parentNodeId);
    const operatorDmId = this.addOperatorToDatamap(
      context,
      stateContext.datamapId,
      input.operatorName
    );

    const nodeId = this.generateLayoutNodeId(context);
    const newNode: any = {
      type: 'OPERATOR',
      id: nodeId,
      name: input.operatorName,
      file: operatorFile,
      dmId: operatorDmId,
    };

    if (!parentNode.children) {
      parentNode.children = [];
    }

    parentNode.children.push(newNode);
    context.layoutIndex.set(nodeId, newNode);

    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(
      fullPath,
      SoarTemplates.generateOperatorFile(input.operatorName, stateContext.stateName),
      'utf-8'
    );

    const parentFolderAbsolute = this.resolveFolderAbsolute(workspaceFolder, parentFolderPath);
    await SourceScriptManager.appendReference(parentFolderAbsolute, operatorFile);

    await this.loader.saveProject(context);

    return {
      nodeId,
      parentNodeId: input.parentNodeId,
      operatorName: input.operatorName,
      filePath: fullPath,
      datamapId: operatorDmId,
    };
  }

  async addLayoutImpasseOperator(input: AddLayoutImpasseOperatorInput): Promise<{
    nodeId: string;
    parentNodeId: string;
    impasseName: ImpasseName;
    filePath: string;
  }> {
    const context = await this.loadProjectContext(input.projectFile);
    const allowedImpasseNames: ImpasseName[] = [
      'Impasse__Operator_Tie',
      'Impasse__Operator_Conflict',
      'Impasse__Operator_Constraint-Failure',
      'Impasse__State_No-Change',
    ];

    if (!allowedImpasseNames.includes(input.impasseName)) {
      throw new Error(`Invalid impasse name '${input.impasseName}'`);
    }

    const parentNode = context.layoutIndex.get(input.parentNodeId);
    if (!parentNode || !hasChildren(parentNode)) {
      throw new Error(
        `Parent node '${input.parentNodeId}' cannot contain child operators. Choose a folder/high-level node.`
      );
    }

    const workspaceFolder = path.dirname(context.projectFile);
    const parentFolderPath = this.getNodeFolderPath(context, input.parentNodeId);
    const operatorFile = `${input.impasseName}.soar`;
    const fullPath = path.join(workspaceFolder, parentFolderPath, operatorFile);

    if (fs.existsSync(fullPath)) {
      throw new Error(`Impasse operator file already exists: ${operatorFile}`);
    }

    const stateContext = this.findParentStateContext(context, input.parentNodeId);

    const nodeId = this.generateLayoutNodeId(context);
    const newNode: any = {
      type: 'IMPASSE_OPERATOR',
      id: nodeId,
      name: input.impasseName,
      file: operatorFile,
    };

    if (!parentNode.children) {
      parentNode.children = [];
    }

    parentNode.children.push(newNode);
    context.layoutIndex.set(nodeId, newNode);

    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(
      fullPath,
      SoarTemplates.generateImpasseOperatorFile(input.impasseName, stateContext.stateName),
      'utf-8'
    );

    const parentFolderAbsolute = this.resolveFolderAbsolute(workspaceFolder, parentFolderPath);
    await SourceScriptManager.appendReference(parentFolderAbsolute, operatorFile);

    await this.loader.saveProject(context);

    return {
      nodeId,
      parentNodeId: input.parentNodeId,
      impasseName: input.impasseName,
      filePath: fullPath,
    };
  }

  async addLayoutFile(input: AddLayoutFileInput): Promise<{
    nodeId: string;
    parentNodeId: string;
    fileName: string;
    filePath: string;
  }> {
    const context = await this.loadProjectContext(input.projectFile);
    this.assertAttributeName(input.fileName);

    const parentNode = context.layoutIndex.get(input.parentNodeId);
    if (!parentNode || !hasChildren(parentNode)) {
      throw new Error(`Parent node '${input.parentNodeId}' cannot contain files.`);
    }

    const workspaceFolder = path.dirname(context.projectFile);
    const parentFolderPath = this.getNodeFolderPath(context, input.parentNodeId);
    const filePath = `${input.fileName}.soar`;
    const fullPath = path.join(workspaceFolder, parentFolderPath, filePath);

    if (fs.existsSync(fullPath)) {
      throw new Error(`File already exists: ${filePath}`);
    }

    const nodeId = this.generateLayoutNodeId(context);
    const newNode: any = {
      type: 'FILE',
      id: nodeId,
      name: input.fileName,
      file: filePath,
    };

    if (!parentNode.children) {
      parentNode.children = [];
    }

    parentNode.children.push(newNode);
    context.layoutIndex.set(nodeId, newNode);

    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(
      fullPath,
      SoarTemplates.generateProductionFile(input.fileName),
      'utf-8'
    );

    const parentFolderAbsolute = this.resolveFolderAbsolute(workspaceFolder, parentFolderPath);
    await SourceScriptManager.appendReference(parentFolderAbsolute, filePath);

    await this.loader.saveProject(context);

    return {
      nodeId,
      parentNodeId: input.parentNodeId,
      fileName: `${input.fileName}.soar`,
      filePath: fullPath,
    };
  }

  async addLayoutFolder(input: AddLayoutFolderInput): Promise<{
    nodeId: string;
    parentNodeId: string;
    folderName: string;
    folderPath: string;
  }> {
    const context = await this.loadProjectContext(input.projectFile);
    this.assertAttributeName(input.folderName);

    const parentNode = context.layoutIndex.get(input.parentNodeId);
    if (!parentNode || !hasChildren(parentNode)) {
      throw new Error(`Parent node '${input.parentNodeId}' cannot contain folders.`);
    }

    const workspaceFolder = path.dirname(context.projectFile);
    const parentFolderPath = this.getNodeFolderPath(context, input.parentNodeId);
    const fullPath = path.join(workspaceFolder, parentFolderPath, input.folderName);

    if (fs.existsSync(fullPath)) {
      throw new Error(`Folder already exists: ${input.folderName}`);
    }

    await fs.promises.mkdir(fullPath, { recursive: true });

    const nodeId = this.generateLayoutNodeId(context);
    const newNode: any = {
      type: 'FOLDER',
      id: nodeId,
      name: input.folderName,
      folder: input.folderName,
      children: [],
    };

    if (!parentNode.children) {
      parentNode.children = [];
    }

    parentNode.children.push(newNode);
    context.layoutIndex.set(nodeId, newNode);

    await this.loader.saveProject(context);

    return {
      nodeId,
      parentNodeId: input.parentNodeId,
      folderName: input.folderName,
      folderPath: fullPath,
    };
  }

  private async loadDatamapContext(projectFile: string): Promise<DatamapProjectContext> {
    const base = await this.loader.loadProject(projectFile);
    const datamapMetadata = DatamapMetadataCache.build(base.project, base.datamapIndex);
    return {
      ...base,
      datamapMetadata,
    };
  }

  private async saveContext(context: DatamapProjectContext): Promise<void> {
    await this.loader.saveProject(context);
    context.datamapMetadata = DatamapMetadataCache.build(context.project, context.datamapIndex);
  }

  private getSoarIdVertex(context: DatamapProjectContext, vertexId: string): SoarIdVertex {
    const vertex = context.datamapIndex.get(vertexId);
    if (!vertex || vertex.type !== 'SOAR_ID') {
      throw new Error(`Vertex '${vertexId}' is not a SOAR_ID vertex`);
    }
    return vertex;
  }

  private assertAttributeName(name: string): void {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
      throw new Error(
        `Attribute name '${name}' is invalid. Use letters/numbers/underscore/hyphen and start with a letter.`
      );
    }
  }

  private normalizeEnumChoices(choices?: string[]): string[] {
    const normalized = (choices || [])
      .map(choice => choice.trim())
      .filter(choice => choice.length > 0);
    if (normalized.length === 0) {
      throw new Error('Enumeration attributes require at least one enum choice');
    }
    return normalized;
  }

  private buildDatamapTree(
    context: DatamapProjectContext,
    vertexId: string,
    maxDepth: number,
    ancestry: Set<string>
  ): any {
    const vertex = context.datamapIndex.get(vertexId);
    if (!vertex) {
      return null;
    }

    const alreadyVisited = ancestry.has(vertexId);
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(vertexId);

    const baseNode: any = {
      id: vertex.id,
      type: vertex.type,
    };

    if (vertex.type === 'ENUMERATION') {
      baseNode.choices = vertex.choices;
    }

    if (vertex.type !== 'SOAR_ID' || !vertex.outEdges || alreadyVisited || maxDepth <= 0) {
      if (alreadyVisited) {
        baseNode.recursiveReference = true;
      }
      return baseNode;
    }

    baseNode.attributes = vertex.outEdges.map((edge: OutEdge) => {
      const metadata = context.datamapMetadata.getEdgeMetadata(vertex.id, edge.name, edge.toId);
      return {
        name: edge.name,
        comment: edge.comment,
        targetId: edge.toId,
        linked: metadata?.isLink ?? false,
        target: this.buildDatamapTree(context, edge.toId, maxDepth - 1, nextAncestry),
      };
    });

    return baseNode;
  }

  private collectSoarFilesFromLayout(layoutNode: any): string[] {
    const results = new Set<string>();

    const visit = (node: any): void => {
      if (!node || typeof node !== 'object') {
        return;
      }

      if (typeof node.file === 'string' && node.file.endsWith('.soar')) {
        results.add(node.file);
      }

      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          visit(child);
        }
      }
    };

    visit(layoutNode);
    return Array.from(results.values());
  }

  private resolveWorkspaceRoot(explicitWorkspaceRoot?: string): string {
    if (explicitWorkspaceRoot && explicitWorkspaceRoot.trim().length > 0) {
      return explicitWorkspaceRoot;
    }

    const fromEnv = process.env.SOAR_MCP_WORKSPACE;
    if (fromEnv && fromEnv.trim().length > 0) {
      return fromEnv;
    }

    return process.cwd();
  }

  private async loadProjectContext(projectFile: string): Promise<ProjectContext> {
    return this.loader.loadProject(projectFile);
  }

  private findParentStateContext(
    projectContext: ProjectContext,
    nodeId: string
  ): { stateName: string; datamapId: string } {
    let currentNodeId = nodeId;
    let currentNode = projectContext.layoutIndex.get(currentNodeId);

    while (currentNode) {
      if (
        (currentNode.type === 'HIGH_LEVEL_OPERATOR' ||
          currentNode.type === 'HIGH_LEVEL_IMPASSE_OPERATOR') &&
        'dmId' in currentNode &&
        currentNode.dmId
      ) {
        return {
          stateName: currentNode.name,
          datamapId: currentNode.dmId,
        };
      }

      const parent = this.findParentNode(projectContext.project.layout, currentNodeId);
      if (!parent) {
        break;
      }

      currentNodeId = parent.id;
      currentNode = parent;
    }

    return {
      stateName: projectContext.project.layout.name || 'root',
      datamapId: projectContext.project.datamap.rootId,
    };
  }

  private findParentNode(node: LayoutNode, targetId: string): LayoutNode | null {
    if (hasChildren(node) && node.children) {
      for (const child of node.children) {
        if (child.id === targetId) {
          return node;
        }
        const found = this.findParentNode(child, targetId);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  private findParentId(projectContext: ProjectContext, nodeId: string): string | null {
    const findParent = (
      node: LayoutNode,
      targetId: string,
      parentId: string | null = null
    ): string | null => {
      if (node.id === targetId) {
        return parentId;
      }

      if (hasChildren(node) && node.children) {
        for (const child of node.children) {
          const found = findParent(child, targetId, node.id);
          if (found !== null) {
            return found;
          }
        }
      }

      return null;
    };

    return findParent(projectContext.project.layout, nodeId, null);
  }

  private getNodeFolderPath(
    projectContext: ProjectContext,
    nodeId: string,
    nodeOverride?: LayoutNode
  ): string {
    const pathParts: string[] = [];
    let currentId: string | null = nodeId;
    let currentNode: LayoutNode | undefined =
      nodeOverride ?? projectContext.layoutIndex.get(nodeId);

    while (currentId && currentNode) {
      if ('folder' in currentNode && currentNode.folder) {
        pathParts.unshift(currentNode.folder);
      }

      const parentId = this.findParentId(projectContext, currentId);
      currentId = parentId;
      currentNode = parentId ? projectContext.layoutIndex.get(parentId) : undefined;
    }

    return path.join(...pathParts);
  }

  private resolveFolderAbsolute(workspaceFolder: string, relativeFolderPath: string): string {
    if (!relativeFolderPath) {
      return workspaceFolder;
    }
    return path.join(workspaceFolder, relativeFolderPath);
  }

  private generateLayoutNodeId(projectContext: ProjectContext): string {
    const existingIds = new Set<string>();

    const collectIds = (node: LayoutNode): void => {
      existingIds.add(node.id);
      if (hasChildren(node) && node.children) {
        for (const child of node.children) {
          collectIds(child);
        }
      }
    };

    collectIds(projectContext.project.layout);
    return generateVertexId(existingIds);
  }

  private addOperatorToDatamap(
    projectContext: ProjectContext,
    stateVertexId: string,
    operatorName: string
  ): string | undefined {
    const stateVertex = projectContext.datamapIndex.get(stateVertexId);
    if (!stateVertex || stateVertex.type !== 'SOAR_ID') {
      return undefined;
    }

    if (stateVertex.outEdges) {
      for (const edge of stateVertex.outEdges) {
        if (edge.name !== 'operator') {
          continue;
        }

        const existingOperatorVertex = projectContext.datamapIndex.get(edge.toId);
        if (!existingOperatorVertex || existingOperatorVertex.type !== 'SOAR_ID') {
          continue;
        }

        const nameEdge = existingOperatorVertex.outEdges?.find(
          candidate => candidate.name === 'name'
        );
        if (!nameEdge) {
          continue;
        }

        const nameVertex = projectContext.datamapIndex.get(nameEdge.toId);
        if (
          nameVertex &&
          nameVertex.type === 'ENUMERATION' &&
          nameVertex.choices?.includes(operatorName)
        ) {
          return existingOperatorVertex.id;
        }
      }
    }

    const existingIds = new Set(projectContext.project.datamap.vertices.map(vertex => vertex.id));
    const operatorVertexId = generateVertexId(existingIds);
    existingIds.add(operatorVertexId);
    const operatorVertex: any = {
      id: operatorVertexId,
      type: 'SOAR_ID',
      outEdges: [],
    };

    const nameVertexId = generateVertexId(existingIds);
    const nameVertex: any = {
      id: nameVertexId,
      type: 'ENUMERATION',
      choices: [operatorName],
    };

    operatorVertex.outEdges.push({ name: 'name', toId: nameVertexId });

    projectContext.project.datamap.vertices.push(operatorVertex);
    projectContext.project.datamap.vertices.push(nameVertex);
    projectContext.datamapIndex.set(operatorVertexId, operatorVertex);
    projectContext.datamapIndex.set(nameVertexId, nameVertex);

    if (!stateVertex.outEdges) {
      stateVertex.outEdges = [];
    }

    const edgeExists = stateVertex.outEdges.some(
      edge => edge.name === 'operator' && edge.toId === operatorVertexId
    );

    if (!edgeExists) {
      stateVertex.outEdges.push({
        name: 'operator',
        toId: operatorVertexId,
      });
    }

    return operatorVertexId;
  }

  private normalizePort(value: number | undefined): number {
    if (value !== undefined && Number.isFinite(value) && value > 0 && value <= 65535) {
      return Math.floor(value);
    }
    return 12121;
  }

  private normalizePositiveInteger(
    value: number | undefined,
    fieldName: string
  ): number | undefined {
    if (value === undefined) {
      return undefined;
    }
    const n = Math.floor(value);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`'${fieldName}' must be a positive integer`);
    }
    return n;
  }

  private async ensureDebugClient(): Promise<void> {
    if (!this.debugClient) {
      throw new Error('Not connected to a Soar kernel. Call agent_runtime_connect first.');
    }
  }

  private async ensureDebugSession(): Promise<void> {
    await this.ensureDebugClient();
    if (!this.debugSession) {
      throw new Error('No active debug session. Call agent_runtime_connect first.');
    }
  }

  private async resolveDebugAgent(agentOverride?: string): Promise<string> {
    await this.ensureDebugSession();
    const trimmed = agentOverride?.trim();
    if (trimmed) {
      this.debugSession!.currentAgent = trimmed;
      return trimmed;
    }
    return this.debugSession!.currentAgent;
  }

  private async runSmlCmdline(line: string, agent: string): Promise<string> {
    await this.ensureDebugSession();
    const args: SmlArgument[] = [
      { param: 'agent', value: agent },
      { param: 'line', value: line },
    ];

    const response = await this.debugClient!.call('cmdline', args, { output: 'raw' });
    if (response.errorText) {
      throw new Error(response.errorText);
    }

    return response.result?.text ?? '';
  }

  private async getAgentListFromKernel(): Promise<string[]> {
    await this.ensureDebugClient();
    const response = await this.debugClient!.call('get_agent_list', [], { output: 'structured' });
    if (response.errorText) {
      throw new Error(response.errorText);
    }

    const names = response.result?.names ?? [];
    if (names.length > 0) {
      return [...names];
    }

    const text = response.result?.text ?? '';
    if (!text.trim()) {
      return [];
    }

    return text
      .split(/[\r\n\s,]+/)
      .map(value => value.trim())
      .filter(value => value.length > 0);
  }

  private pickDebugAgent(requested: string | undefined, agents: string[]): string {
    if (requested && agents.includes(requested)) {
      return requested;
    }
    if (agents.length > 0) {
      return agents[0];
    }
    return 'soar';
  }
}

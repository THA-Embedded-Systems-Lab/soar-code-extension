import * as fs from 'fs';
import * as path from 'path';
import { DatamapMetadataCache, DatamapProjectContext } from '../datamap/datamapMetadata';
import { DatamapValidator, ValidationError } from '../datamap/datamapValidator';
import { ProjectLoader } from '../server/projectLoader';
import { SoarParser } from '../server/soarParser';
import { DMVertex, OutEdge, SoarIdVertex } from '../server/visualSoarProject';

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

export interface GetActiveProjectInput {
  workspaceRoot?: string;
}

export interface ValidationSummary {
  totalFiles: number;
  filesWithIssues: number;
  totalIssues: number;
  issuesByFile: Record<string, ValidationError[]>;
}

export class SoarMcpCore {
  private readonly loader = new ProjectLoader();
  private readonly parser = new SoarParser();
  private readonly validator = new DatamapValidator();

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

    const newVertexId = this.generateVertexId(context);
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

    await this.saveContext(context);

    return {
      parentVertexId: parent.id,
      attributeName: edge.name,
      targetVertexId: edge.toId,
      comment: edge.comment ?? null,
    };
  }

  async deleteAttribute(input: DeleteAttributeInput): Promise<any> {
    const context = await this.loadDatamapContext(input.projectFile);
    const parent = this.getSoarIdVertex(context, input.parentVertexId);

    if (!parent.outEdges) {
      throw new Error(`Parent vertex '${input.parentVertexId}' has no attributes`);
    }

    const edgeIndex = parent.outEdges.findIndex(edge => edge.name === input.attributeName);
    if (edgeIndex === -1) {
      throw new Error(
        `Attribute '${input.attributeName}' was not found under parent '${input.parentVertexId}'`
      );
    }

    const [edge] = parent.outEdges.splice(edgeIndex, 1);
    const edgeMetadata = context.datamapMetadata.getEdgeMetadata(parent.id, edge.name, edge.toId);
    const shouldDeleteTarget =
      !input.removeLinkOnly &&
      (!edgeMetadata || (!edgeMetadata.isLink && edgeMetadata.inboundCount <= 1));

    if (shouldDeleteTarget) {
      this.removeVertexRecursive(context, edge.toId);
    }

    await this.saveContext(context);

    return {
      parentVertexId: parent.id,
      attributeName: edge.name,
      targetVertexId: edge.toId,
      removedAsLinkOnly: !shouldDeleteTarget,
    };
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
      const errors = this.validator.validateDocument(soarDoc, context, fileText);

      if (errors.length > 0) {
        filesWithIssues += 1;
        totalIssues += errors.length;
        issuesByFile[relativePath] = errors;
      }
    }

    return {
      totalFiles: soarFiles.length,
      filesWithIssues,
      totalIssues,
      issuesByFile,
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

  private generateVertexId(context: DatamapProjectContext): string {
    let maxNumericId = 0;
    for (const vertex of context.project.datamap.vertices) {
      const numericId = Number.parseInt(vertex.id, 10);
      if (!Number.isNaN(numericId) && numericId > maxNumericId) {
        maxNumericId = numericId;
      }
    }
    return String(maxNumericId + 1);
  }

  private removeVertexRecursive(context: DatamapProjectContext, vertexId: string): void {
    const vertex = context.datamapIndex.get(vertexId);
    if (!vertex) {
      return;
    }

    if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
      for (const edge of vertex.outEdges) {
        this.removeVertexRecursive(context, edge.toId);
      }
    }

    context.datamapIndex.delete(vertexId);
    const index = context.project.datamap.vertices.findIndex(
      candidate => candidate.id === vertexId
    );
    if (index !== -1) {
      context.project.datamap.vertices.splice(index, 1);
    }
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
}

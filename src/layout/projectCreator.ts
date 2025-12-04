/**
 * Project Creator for new Soar projects
 *
 * Creates a new Soar project with default datamap and file scaffolding,
 * matching VisualSoar's project creation behavior.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { VisualSoarProject } from '../server/visualSoarProject';

export interface ProjectCreationOptions {
  directory: string; // Parent directory where project will be created
  agentName: string; // Name of the agent/project
}

export class ProjectCreator {
  /**
   * Create a new Soar project with default structure
   */
  static async createProject(options: ProjectCreationOptions): Promise<string> {
    const { directory, agentName } = options;

    // Validate inputs
    if (!agentName || agentName.trim().length === 0) {
      throw new Error('Agent name cannot be empty');
    }

    if (!directory || !fs.existsSync(directory)) {
      throw new Error('Directory does not exist');
    }

    // Create project directory structure
    const projectPath = path.join(directory, agentName);
    const agentFolderPath = path.join(projectPath, agentName);

    // Check if project already exists
    if (fs.existsSync(projectPath)) {
      throw new Error(`Project already exists at ${projectPath}`);
    }

    // Create directories
    await fs.promises.mkdir(projectPath, { recursive: true });
    await fs.promises.mkdir(agentFolderPath, { recursive: true });
    await fs.promises.mkdir(path.join(agentFolderPath, 'all'), { recursive: true });
    await fs.promises.mkdir(path.join(agentFolderPath, 'elaborations'), { recursive: true });

    // Create the project structure
    const project = this.createDefaultProject(agentName);

    // Write project file
    const projectFilePath = path.join(projectPath, `${agentName}.vsa.json`);
    await fs.promises.writeFile(projectFilePath, JSON.stringify(project, null, 2), 'utf-8');

    // Create Soar files
    await this.createProjectFiles(agentFolderPath, agentName);

    // Create main load file
    await this.createMainLoadFile(projectPath, agentName);

    return projectFilePath;
  }

  /**
   * Create default project structure with standard Soar datamap
   */
  private static createDefaultProject(agentName: string): VisualSoarProject {
    // Generate IDs for all vertices
    const rootId = this.generateId();
    const ioId = this.generateId();
    const inputLinkId = this.generateId();
    const outputLinkId = this.generateId();
    const nameEnumId = this.generateId();
    const typeEnumId = this.generateId();
    const superstateEnumId = this.generateId();
    const operatorId = this.generateId();
    const operatorNameEnumId = this.generateId();
    const epmemId = this.generateId();
    const epmemCommandId = this.generateId();
    const epmemPresentIdId = this.generateId();
    const epmemResultId = this.generateId();
    const smemId = this.generateId();
    const smemCommandId = this.generateId();
    const smemResultId = this.generateId();
    const rewardLinkId = this.generateId();
    const rewardId = this.generateId();
    const rewardValueId = this.generateId();

    // Layout node IDs
    const rootNodeId = this.generateId();
    const firstloadId = this.generateId();
    const allFolderId = this.generateId();
    const elabFolderId = this.generateId();
    const elabAllId = this.generateId();
    const elabTopStateId = this.generateId();
    const initOperatorId = this.generateId();

    return {
      version: '6',
      datamap: {
        rootId: rootId,
        vertices: [
          // Root state vertex
          {
            id: rootId,
            type: 'SOAR_ID',
            outEdges: [
              { name: 'epmem', toId: epmemId },
              { name: 'io', toId: ioId },
              { name: 'name', toId: nameEnumId },
              { name: 'operator', toId: operatorId },
              { name: 'reward-link', toId: rewardLinkId },
              { name: 'smem', toId: smemId },
              { name: 'superstate', toId: superstateEnumId },
              { name: 'top-state', toId: rootId },
              { name: 'type', toId: typeEnumId },
            ],
          },
          // IO vertex
          {
            id: ioId,
            type: 'SOAR_ID',
            outEdges: [
              { name: 'input-link', toId: inputLinkId },
              { name: 'output-link', toId: outputLinkId },
            ],
          },
          // Input-link (empty SOAR_ID)
          {
            id: inputLinkId,
            type: 'SOAR_ID',
            outEdges: [],
          },
          // Output-link (empty SOAR_ID)
          {
            id: outputLinkId,
            type: 'SOAR_ID',
            outEdges: [],
          },
          // Name enumeration
          {
            id: nameEnumId,
            type: 'ENUMERATION',
            choices: [agentName],
          },
          // Type enumeration
          {
            id: typeEnumId,
            type: 'ENUMERATION',
            choices: ['state'],
          },
          // Superstate enumeration (nil for top state)
          {
            id: superstateEnumId,
            type: 'ENUMERATION',
            choices: ['nil'],
          },
          // Operator vertex
          {
            id: operatorId,
            type: 'SOAR_ID',
            outEdges: [{ name: 'name', toId: operatorNameEnumId }],
          },
          // Operator name enumeration (initialize operator)
          {
            id: operatorNameEnumId,
            type: 'ENUMERATION',
            choices: [`initialize-${agentName}`],
          },
          // Epmem vertex
          {
            id: epmemId,
            type: 'SOAR_ID',
            outEdges: [
              { name: 'command', toId: epmemCommandId },
              { name: 'present-id', toId: epmemPresentIdId },
              { name: 'result', toId: epmemResultId },
            ],
          },
          {
            id: epmemCommandId,
            type: 'SOAR_ID',
            outEdges: [],
          },
          {
            id: epmemPresentIdId,
            type: 'INTEGER',
          },
          {
            id: epmemResultId,
            type: 'SOAR_ID',
            outEdges: [],
          },
          // Smem vertex
          {
            id: smemId,
            type: 'SOAR_ID',
            outEdges: [
              { name: 'command', toId: smemCommandId },
              { name: 'result', toId: smemResultId },
            ],
          },
          {
            id: smemCommandId,
            type: 'SOAR_ID',
            outEdges: [],
          },
          {
            id: smemResultId,
            type: 'SOAR_ID',
            outEdges: [],
          },
          // Reward-link vertex
          {
            id: rewardLinkId,
            type: 'SOAR_ID',
            outEdges: [{ name: 'reward', toId: rewardId }],
          },
          {
            id: rewardId,
            type: 'SOAR_ID',
            outEdges: [{ name: 'value', toId: rewardValueId }],
          },
          {
            id: rewardValueId,
            type: 'FLOAT',
          },
        ],
      },
      layout: {
        id: rootNodeId,
        name: agentName,
        type: 'OPERATOR_ROOT',
        folder: agentName,
        children: [
          {
            id: firstloadId,
            name: '_firstload',
            type: 'FILE_OPERATOR',
            file: '_firstload.soar',
          },
          {
            id: allFolderId,
            name: 'all',
            type: 'FOLDER',
            folder: 'all',
          },
          {
            id: elabFolderId,
            name: 'elaborations',
            type: 'FOLDER',
            folder: 'elaborations',
            children: [
              {
                id: elabAllId,
                name: '_all',
                type: 'FILE_OPERATOR',
                file: '_all.soar',
              },
              {
                id: elabTopStateId,
                name: 'top-state',
                type: 'FILE_OPERATOR',
                file: 'top-state.soar',
              },
            ],
          },
          {
            id: initOperatorId,
            name: `initialize-${agentName}`,
            type: 'OPERATOR',
            file: `initialize-${agentName}.soar`,
          },
        ],
      },
    };
  }

  /**
   * Create Soar source files with standard content
   */
  private static async createProjectFiles(
    agentFolderPath: string,
    agentName: string
  ): Promise<void> {
    // _firstload.soar (empty file)
    await fs.promises.writeFile(path.join(agentFolderPath, '_firstload.soar'), '', 'utf-8');

    // elaborations/_all.soar
    const allElabContent = `sp {elaborate*state*name
   (state <s> ^superstate.operator.name <name>)
-->
   (<s> ^name <name>)
}

sp {elaborate*state*top-state
   (state <s> ^superstate.top-state <ts>)
-->
   (<s> ^top-state <ts>)
}

`;
    await fs.promises.writeFile(
      path.join(agentFolderPath, 'elaborations', '_all.soar'),
      allElabContent,
      'utf-8'
    );

    // elaborations/top-state.soar
    const topStateContent = `sp {elaborate*top-state*top-state
   (state <s> ^superstate nil)
-->
   (<s> ^top-state <s>)
}

`;
    await fs.promises.writeFile(
      path.join(agentFolderPath, 'elaborations', 'top-state.soar'),
      topStateContent,
      'utf-8'
    );

    // initialize operator file
    const initContent = `sp {propose*initialize-${agentName}
   (state <s> ^superstate nil
             -^name)
-->
   (<s> ^operator <o> +)
   (<o> ^name initialize-${agentName})
}

sp {apply*initialize-${agentName}
   (state <s> ^operator <op>)
   (<op> ^name initialize-${agentName})
-->
   (<s> ^name ${agentName})
}

`;
    await fs.promises.writeFile(
      path.join(agentFolderPath, `initialize-${agentName}.soar`),
      initContent,
      'utf-8'
    );

    // Create source files for folder loading
    const sourceContent = `source _firstload.soar
pushd all
source all_source.soar
popd
pushd elaborations
source elaborations_source.soar
popd
source initialize-${agentName}.soar
`;
    await fs.promises.writeFile(
      path.join(agentFolderPath, `${agentName}_source.soar`),
      sourceContent,
      'utf-8'
    );

    // Create elaborations_source.soar
    const elabSourceContent = `source _all.soar
source top-state.soar
`;
    await fs.promises.writeFile(
      path.join(agentFolderPath, 'elaborations', 'elaborations_source.soar'),
      elabSourceContent,
      'utf-8'
    );

    // Create all_source.soar (empty)
    await fs.promises.writeFile(path.join(agentFolderPath, 'all', 'all_source.soar'), '', 'utf-8');
  }

  /**
   * Create main project load file
   */
  private static async createMainLoadFile(projectPath: string, agentName: string): Promise<void> {
    const mainContent = `pushd ${agentName}
source ${agentName}_source.soar
popd
`;
    await fs.promises.writeFile(path.join(projectPath, `${agentName}.soar`), mainContent, 'utf-8');
  }

  /**
   * Generate a unique hex ID for vertex/node IDs (matching VisualSoar format)
   */
  private static generateId(): string {
    return crypto.randomBytes(16).toString('hex');
  }
}

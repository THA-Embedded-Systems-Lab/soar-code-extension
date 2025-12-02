/**
 * TypeScript definitions for VisualSoar Project Schema v6
 * 
 * Based on: https://github.com/SoarGroup/VisualSoar/blob/master/doc/project_schema.json
 * Documentation: VISUALSOAR-INTEGRATION.md
 * 
 * This ensures full compatibility with VisualSoar 9.6.4 project files.
 */

// Main Project Structure

export interface VisualSoarProject {
    version: "6";
    datamap: Datamap;
    layout: LayoutNode;
}

// Datamap Types

export interface Datamap {
    rootId: string;
    vertices: DMVertex[];
}

export type DMVertex =
    | SoarIdVertex
    | EnumerationVertex
    | IntegerRangeVertex
    | FloatRangeVertex
    | StringVertex
    | ForeignVertex;

export interface BaseDMVertex {
    id: string;
    type: "SOAR_ID" | "ENUMERATION" | "INTEGER" | "FLOAT" | "STRING" | "FOREIGN";
}

export interface SoarIdVertex extends BaseDMVertex {
    type: "SOAR_ID";
    outEdges?: OutEdge[];
}

export interface EnumerationVertex extends BaseDMVertex {
    type: "ENUMERATION";
    choices: string[];
}

export interface IntegerRangeVertex extends BaseDMVertex {
    type: "INTEGER";
    min?: number;
    max?: number;
}

export interface FloatRangeVertex extends BaseDMVertex {
    type: "FLOAT";
    min?: number;
    max?: number;
}

export interface StringVertex extends BaseDMVertex {
    type: "STRING";
}

export interface ForeignVertex extends BaseDMVertex {
    type: "FOREIGN";
    foreignDMPath: string;
    importedVertex: DMVertex;
}

export interface OutEdge {
    name: string;
    toId: string;
    comment?: string;
    generated?: boolean;
}

// Layout Types

export type LayoutNode =
    | FileNode
    | FileOperatorNode
    | FolderNode
    | OperatorNode
    | HighLevelOperatorNode
    | HighLevelFileOperatorNode
    | ImpasseOperatorNode
    | HighLevelImpasseOperatorNode
    | OperatorRootNode
    | LinkNode;

export interface BaseLayoutNode {
    type: string;
    id: string;
    children?: LayoutNode[];
}

export interface FileNode extends BaseLayoutNode {
    type: "FILE";
    name: string;
    file: string;
}

export interface FileOperatorNode extends BaseLayoutNode {
    type: "FILE_OPERATOR";
    name: string;
    file: string;
}

export interface FolderNode extends BaseLayoutNode {
    type: "FOLDER";
    name: string;
    folder: string;
    children?: LayoutNode[];
}

export interface OperatorNode extends BaseLayoutNode {
    type: "OPERATOR";
    name: string;
    file: string;
}

export interface HighLevelOperatorNode extends BaseLayoutNode {
    type: "HIGH_LEVEL_OPERATOR";
    name: string;
    file: string;
    dmId: string;
    folder: string;
    children?: LayoutNode[];
}

export interface HighLevelFileOperatorNode extends BaseLayoutNode {
    type: "HIGH_LEVEL_FILE_OPERATOR";
    name: string;
    file: string;
    dmId: string;
    folder: string;
    children?: LayoutNode[];
}

export type ImpasseName =
    | "Impasse__Operator_Tie"
    | "Impasse__Operator_Conflict"
    | "Impasse__Operator_Constraint-Failure"
    | "Impasse__State_No-Change";

export interface ImpasseOperatorNode extends BaseLayoutNode {
    type: "IMPASSE_OPERATOR";
    name: ImpasseName;
    file: string;
}

export interface HighLevelImpasseOperatorNode extends BaseLayoutNode {
    type: "HIGH_LEVEL_IMPASSE_OPERATOR";
    name: ImpasseName;
    file: string;
    dmId: string;
    folder: string;
    children?: LayoutNode[];
}

export interface OperatorRootNode extends BaseLayoutNode {
    type: "OPERATOR_ROOT";
    name: string;
    folder: string;
    children?: LayoutNode[];
}

export interface LinkNode extends BaseLayoutNode {
    type: "LINK";
    name: string;
    file: string;
    linkedNodeId: string;
}

// Utility Types

export interface ProjectContext {
    projectFile: string;
    project: VisualSoarProject;
    datamapIndex: Map<string, DMVertex>;
    layoutIndex: Map<string, LayoutNode>;
}

// Type Guards

export function isSoarIdVertex(vertex: DMVertex): vertex is SoarIdVertex {
    return vertex.type === "SOAR_ID";
}

export function isEnumerationVertex(vertex: DMVertex): vertex is EnumerationVertex {
    return vertex.type === "ENUMERATION";
}

export function isIntegerRangeVertex(vertex: DMVertex): vertex is IntegerRangeVertex {
    return vertex.type === "INTEGER";
}

export function isFloatRangeVertex(vertex: DMVertex): vertex is FloatRangeVertex {
    return vertex.type === "FLOAT";
}

export function hasDatamapId(node: LayoutNode): node is HighLevelOperatorNode | HighLevelFileOperatorNode | HighLevelImpasseOperatorNode {
    return 'dmId' in node;
}

export function hasChildren(node: LayoutNode): node is FolderNode | HighLevelOperatorNode | HighLevelFileOperatorNode | HighLevelImpasseOperatorNode | OperatorRootNode {
    return 'children' in node && node.children !== undefined;
}

# Phase 4: DataMap Logic Port

## Objective

Port VisualSoar's DataMap logic from Java to TypeScript. This includes the core data structures, parser, and operations needed to work with Soar datamaps.

## Prerequisites

- Completed Phase 1, 2, and 3
- Access to VisualSoar source code
- Understanding of Soar datamaps and working memory structure
- Familiarity with TypeScript classes and interfaces

## Background

A DataMap in Soar represents the structure of working memory, tracking:

- **States**: Top-level working memory structures
- **Attributes**: Properties of states (^name, ^operator, etc.)
- **Values**: Values of attributes (constants, other states, identifiers)
- **Hierarchy**: Parent-child relationships between elements
- **Links**: References between different parts of the datamap

VisualSoar's datamap logic is found in:
- `src/main/java/edu/umich/soar/visualsoar/datamap/`
- `src/main/java/edu/umich/soar/visualsoar/parser/`

## Steps

### 4.1 Define Core Type Definitions

Create `src/datamap/types.ts`:

```typescript
/**
 * Represents a unique identifier for datamap nodes
 */
export type NodeId = string;

/**
 * Types of datamap nodes
 */
export enum DataMapNodeType {
    STATE = 'state',
    ATTRIBUTE = 'attribute',
    VALUE = 'value',
    IDENTIFIER = 'identifier',
    ENUMERATION = 'enumeration',
    FLOAT = 'float',
    INTEGER = 'integer',
    STRING = 'string'
}

/**
 * Base interface for all datamap nodes
 */
export interface DataMapNode {
    id: NodeId;
    name: string;
    type: DataMapNodeType;
    parent?: NodeId;
    children: NodeId[];
    comment?: string;
    sourceFile?: string;
    sourceLine?: number;
}

/**
 * Represents a state in the datamap
 */
export interface StateNode extends DataMapNode {
    type: DataMapNodeType.STATE;
    isTopState: boolean;
}

/**
 * Represents an attribute
 */
export interface AttributeNode extends DataMapNode {
    type: DataMapNodeType.ATTRIBUTE;
    attributeName: string;
}

/**
 * Represents a value (can be identifier, enumeration, or primitive)
 */
export interface ValueNode extends DataMapNode {
    type: DataMapNodeType.VALUE | DataMapNodeType.IDENTIFIER | 
          DataMapNodeType.ENUMERATION | DataMapNodeType.FLOAT | 
          DataMapNodeType.INTEGER | DataMapNodeType.STRING;
    value?: string | number;
    linkedTo?: NodeId; // For identifier references
}

/**
 * Represents a link between nodes
 */
export interface DataMapLink {
    from: NodeId;
    to: NodeId;
    attribute: string;
    type: 'addition' | 'removal' | 'test';
}

/**
 * Represents the complete datamap structure
 */
export interface DataMap {
    id: string;
    name: string;
    nodes: Map<NodeId, DataMapNode>;
    links: DataMapLink[];
    rootNode?: NodeId;
    metadata: {
        version: string;
        createdDate: Date;
        modifiedDate: Date;
        description?: string;
    };
}

/**
 * Error types for datamap validation
 */
export enum DataMapErrorType {
    UNDEFINED_NODE = 'undefined_node',
    DUPLICATE_ATTRIBUTE = 'duplicate_attribute',
    CIRCULAR_REFERENCE = 'circular_reference',
    UNREACHABLE_NODE = 'unreachable_node',
    INVALID_TYPE = 'invalid_type',
    MISSING_PARENT = 'missing_parent'
}

/**
 * Represents a validation error in the datamap
 */
export interface DataMapError {
    type: DataMapErrorType;
    message: string;
    nodeId?: NodeId;
    sourceFile?: string;
    sourceLine?: number;
    severity: 'error' | 'warning' | 'info';
}
```

### 4.2 Create DataMap Core Class

Create `src/datamap/index.ts`:

```typescript
import { DataMap, DataMapNode, DataMapLink, NodeId, DataMapNodeType, StateNode, AttributeNode, ValueNode } from './types';

/**
 * Core DataMap class for managing Soar datamap structure
 */
export class SoarDataMap {
    private datamap: DataMap;
    private nodeIndex: Map<NodeId, DataMapNode>;
    private nameIndex: Map<string, Set<NodeId>>;

    constructor(name: string) {
        this.datamap = {
            id: this.generateId(),
            name: name,
            nodes: new Map(),
            links: [],
            metadata: {
                version: '1.0',
                createdDate: new Date(),
                modifiedDate: new Date()
            }
        };
        this.nodeIndex = this.datamap.nodes;
        this.nameIndex = new Map();
    }

    /**
     * Generate a unique ID for nodes
     */
    private generateId(): string {
        return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Add a node to the datamap
     */
    addNode(node: Omit<DataMapNode, 'id'>): NodeId {
        const id = this.generateId();
        const newNode: DataMapNode = { ...node, id, children: node.children || [] };
        
        this.nodeIndex.set(id, newNode);
        
        // Update name index
        if (!this.nameIndex.has(newNode.name)) {
            this.nameIndex.set(newNode.name, new Set());
        }
        this.nameIndex.get(newNode.name)!.add(id);

        // Update parent's children
        if (newNode.parent) {
            const parent = this.nodeIndex.get(newNode.parent);
            if (parent && !parent.children.includes(id)) {
                parent.children.push(id);
            }
        }

        this.datamap.metadata.modifiedDate = new Date();
        return id;
    }

    /**
     * Remove a node from the datamap
     */
    removeNode(nodeId: NodeId): boolean {
        const node = this.nodeIndex.get(nodeId);
        if (!node) {
            return false;
        }

        // Remove from parent's children
        if (node.parent) {
            const parent = this.nodeIndex.get(node.parent);
            if (parent) {
                parent.children = parent.children.filter(id => id !== nodeId);
            }
        }

        // Recursively remove children
        for (const childId of [...node.children]) {
            this.removeNode(childId);
        }

        // Remove from name index
        const nameSet = this.nameIndex.get(node.name);
        if (nameSet) {
            nameSet.delete(nodeId);
            if (nameSet.size === 0) {
                this.nameIndex.delete(node.name);
            }
        }

        // Remove links
        this.datamap.links = this.datamap.links.filter(
            link => link.from !== nodeId && link.to !== nodeId
        );

        this.nodeIndex.delete(nodeId);
        this.datamap.metadata.modifiedDate = new Date();
        return true;
    }

    /**
     * Get a node by ID
     */
    getNode(nodeId: NodeId): DataMapNode | undefined {
        return this.nodeIndex.get(nodeId);
    }

    /**
     * Find nodes by name
     */
    findNodesByName(name: string): DataMapNode[] {
        const nodeIds = this.nameIndex.get(name);
        if (!nodeIds) {
            return [];
        }
        return Array.from(nodeIds)
            .map(id => this.nodeIndex.get(id))
            .filter((node): node is DataMapNode => node !== undefined);
    }

    /**
     * Get all children of a node
     */
    getChildren(nodeId: NodeId): DataMapNode[] {
        const node = this.nodeIndex.get(nodeId);
        if (!node) {
            return [];
        }
        return node.children
            .map(id => this.nodeIndex.get(id))
            .filter((child): child is DataMapNode => child !== undefined);
    }

    /**
     * Get parent of a node
     */
    getParent(nodeId: NodeId): DataMapNode | undefined {
        const node = this.nodeIndex.get(nodeId);
        if (!node || !node.parent) {
            return undefined;
        }
        return this.nodeIndex.get(node.parent);
    }

    /**
     * Get path from root to node
     */
    getPath(nodeId: NodeId): DataMapNode[] {
        const path: DataMapNode[] = [];
        let current = this.nodeIndex.get(nodeId);
        
        while (current) {
            path.unshift(current);
            if (!current.parent) {
                break;
            }
            current = this.nodeIndex.get(current.parent);
        }
        
        return path;
    }

    /**
     * Add a link between nodes
     */
    addLink(link: DataMapLink): void {
        this.datamap.links.push(link);
        this.datamap.metadata.modifiedDate = new Date();
    }

    /**
     * Get all links from a node
     */
    getLinksFrom(nodeId: NodeId): DataMapLink[] {
        return this.datamap.links.filter(link => link.from === nodeId);
    }

    /**
     * Get all links to a node
     */
    getLinksTo(nodeId: NodeId): DataMapLink[] {
        return this.datamap.links.filter(link => link.to === nodeId);
    }

    /**
     * Get all nodes
     */
    getAllNodes(): DataMapNode[] {
        return Array.from(this.nodeIndex.values());
    }

    /**
     * Get the root node (top state)
     */
    getRootNode(): DataMapNode | undefined {
        if (this.datamap.rootNode) {
            return this.nodeIndex.get(this.datamap.rootNode);
        }
        
        // Find first node without parent (should be top state)
        for (const node of this.nodeIndex.values()) {
            if (!node.parent && node.type === DataMapNodeType.STATE) {
                this.datamap.rootNode = node.id;
                return node;
            }
        }
        
        return undefined;
    }

    /**
     * Set the root node
     */
    setRootNode(nodeId: NodeId): boolean {
        const node = this.nodeIndex.get(nodeId);
        if (!node || node.type !== DataMapNodeType.STATE) {
            return false;
        }
        this.datamap.rootNode = nodeId;
        return true;
    }

    /**
     * Clear the entire datamap
     */
    clear(): void {
        this.nodeIndex.clear();
        this.nameIndex.clear();
        this.datamap.links = [];
        this.datamap.rootNode = undefined;
        this.datamap.metadata.modifiedDate = new Date();
    }

    /**
     * Get datamap statistics
     */
    getStatistics(): {
        totalNodes: number;
        stateNodes: number;
        attributeNodes: number;
        valueNodes: number;
        totalLinks: number;
        maxDepth: number;
    } {
        let stateCount = 0;
        let attributeCount = 0;
        let valueCount = 0;
        let maxDepth = 0;

        for (const node of this.nodeIndex.values()) {
            if (node.type === DataMapNodeType.STATE) {
                stateCount++;
            } else if (node.type === DataMapNodeType.ATTRIBUTE) {
                attributeCount++;
            } else {
                valueCount++;
            }

            const depth = this.getPath(node.id).length;
            maxDepth = Math.max(maxDepth, depth);
        }

        return {
            totalNodes: this.nodeIndex.size,
            stateNodes: stateCount,
            attributeNodes: attributeCount,
            valueNodes: valueCount,
            totalLinks: this.datamap.links.length,
            maxDepth
        };
    }

    /**
     * Export datamap to JSON
     */
    toJSON(): string {
        const exportData = {
            ...this.datamap,
            nodes: Array.from(this.nodeIndex.entries())
        };
        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Import datamap from JSON
     */
    static fromJSON(json: string): SoarDataMap {
        const data = JSON.parse(json);
        const dataMap = new SoarDataMap(data.name);
        
        dataMap.datamap = {
            ...data,
            nodes: new Map(data.nodes),
            metadata: {
                ...data.metadata,
                createdDate: new Date(data.metadata.createdDate),
                modifiedDate: new Date(data.metadata.modifiedDate)
            }
        };
        
        dataMap.nodeIndex = dataMap.datamap.nodes;
        
        // Rebuild name index
        for (const [id, node] of dataMap.nodeIndex) {
            if (!dataMap.nameIndex.has(node.name)) {
                dataMap.nameIndex.set(node.name, new Set());
            }
            dataMap.nameIndex.get(node.name)!.add(id);
        }
        
        return dataMap;
    }
}
```

### 4.3 Create DataMap Parser

Create `src/datamap/parser.ts`:

```typescript
import { SoarDataMap } from './index';
import { DataMapNodeType, NodeId } from './types';

/**
 * Parser for Soar productions to extract datamap information
 */
export class DataMapParser {
    private datamap: SoarDataMap;
    private currentState?: NodeId;

    constructor(datamap: SoarDataMap) {
        this.datamap = datamap;
    }

    /**
     * Parse a Soar production and extract datamap information
     */
    parseProduction(productionText: string, sourceFile?: string): void {
        // This is a simplified parser - a full implementation would need
        // a proper Soar grammar parser (potentially using the LSP server)
        
        const lines = productionText.split('\n');
        let inLHS = false;
        let inRHS = false;
        let lineNumber = 0;

        for (const line of lines) {
            lineNumber++;
            const trimmed = line.trim();

            if (trimmed.startsWith('sp {') || trimmed.startsWith('gp {')) {
                inLHS = true;
                continue;
            }

            if (trimmed === '-->') {
                inLHS = false;
                inRHS = true;
                continue;
            }

            if (inLHS) {
                this.parseLHSLine(trimmed, sourceFile, lineNumber);
            } else if (inRHS) {
                this.parseRHSLine(trimmed, sourceFile, lineNumber);
            }
        }
    }

    /**
     * Parse a line from the LHS (conditions)
     */
    private parseLHSLine(line: string, sourceFile?: string, lineNumber?: number): void {
        // Extract state patterns: (state <s> ^attribute value)
        const stateMatch = line.match(/\(state\s+<(\w+)>/);
        if (stateMatch) {
            const stateName = stateMatch[1];
            // Check if state already exists
            let stateNodes = this.datamap.findNodesByName(stateName);
            if (stateNodes.length === 0) {
                this.currentState = this.datamap.addNode({
                    name: stateName,
                    type: DataMapNodeType.STATE,
                    children: [],
                    sourceFile,
                    sourceLine: lineNumber
                });
            } else {
                this.currentState = stateNodes[0].id;
            }
        }

        // Extract attributes: ^attribute-name
        const attributeMatches = line.matchAll(/\^([\w-]+)/g);
        for (const match of attributeMatches) {
            const attributeName = match[1];
            if (this.currentState) {
                this.addAttribute(attributeName, sourceFile, lineNumber);
            }
        }
    }

    /**
     * Parse a line from the RHS (actions)
     */
    private parseRHSLine(line: string, sourceFile?: string, lineNumber?: number): void {
        // Similar to LHS but for additions
        const attributeMatches = line.matchAll(/\^([\w-]+)\s+([<\w|.-]+)/g);
        for (const match of attributeMatches) {
            const attributeName = match[1];
            const value = match[2];
            if (this.currentState) {
                const attrId = this.addAttribute(attributeName, sourceFile, lineNumber);
                this.addValue(attrId, value, sourceFile, lineNumber);
            }
        }
    }

    /**
     * Add an attribute to the current state
     */
    private addAttribute(name: string, sourceFile?: string, lineNumber?: number): NodeId {
        if (!this.currentState) {
            throw new Error('No current state for attribute');
        }

        // Check if attribute already exists under this state
        const children = this.datamap.getChildren(this.currentState);
        const existing = children.find(
            child => child.type === DataMapNodeType.ATTRIBUTE && child.name === name
        );

        if (existing) {
            return existing.id;
        }

        return this.datamap.addNode({
            name: name,
            type: DataMapNodeType.ATTRIBUTE,
            parent: this.currentState,
            children: [],
            sourceFile,
            sourceLine: lineNumber
        });
    }

    /**
     * Add a value to an attribute
     */
    private addValue(
        parentId: NodeId, 
        value: string, 
        sourceFile?: string, 
        lineNumber?: number
    ): NodeId {
        // Determine value type
        let valueType = DataMapNodeType.VALUE;
        
        if (value.startsWith('<') && value.endsWith('>')) {
            valueType = DataMapNodeType.IDENTIFIER;
        } else if (value.startsWith('|') && value.endsWith('|')) {
            valueType = DataMapNodeType.STRING;
        } else if (!isNaN(Number(value))) {
            valueType = value.includes('.') ? DataMapNodeType.FLOAT : DataMapNodeType.INTEGER;
        }

        return this.datamap.addNode({
            name: value,
            type: valueType,
            parent: parentId,
            children: [],
            sourceFile,
            sourceLine: lineNumber
        });
    }

    /**
     * Parse a datamap file (.dm format from VisualSoar)
     */
    static parseDataMapFile(content: string): SoarDataMap {
        // VisualSoar uses a custom format for datamap files
        // This would need to be implemented based on the actual format
        // For now, return a simple parser implementation
        
        const datamap = new SoarDataMap('parsed-datamap');
        const lines = content.split('\n');
        
        // Simple line-by-line parser
        // Format: depth attribute-name [type] [comment]
        const nodeStack: NodeId[] = [];
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }
            
            // Calculate depth from indentation
            const depth = (line.length - line.trimLeft().length) / 2;
            const parts = trimmed.split(/\s+/);
            const name = parts[0];
            const type = parts[1] || 'identifier';
            
            // Create node
            const nodeType = type === 'state' ? DataMapNodeType.STATE : DataMapNodeType.ATTRIBUTE;
            const parent = depth > 0 ? nodeStack[depth - 1] : undefined;
            
            const nodeId = datamap.addNode({
                name,
                type: nodeType,
                parent,
                children: []
            });
            
            nodeStack[depth] = nodeId;
        }
        
        return datamap;
    }
}
```

### 4.4 Create Helper Utilities

Create `src/datamap/utils.ts`:

```typescript
import { SoarDataMap } from './index';
import { DataMapNode, NodeId, DataMapNodeType } from './types';

/**
 * Utility functions for working with datamaps
 */
export class DataMapUtils {
    /**
     * Find all attributes of a specific node
     */
    static getAttributes(datamap: SoarDataMap, nodeId: NodeId): DataMapNode[] {
        return datamap.getChildren(nodeId).filter(
            child => child.type === DataMapNodeType.ATTRIBUTE
        );
    }

    /**
     * Get attribute by name from a node
     */
    static getAttribute(datamap: SoarDataMap, nodeId: NodeId, attributeName: string): DataMapNode | undefined {
        return datamap.getChildren(nodeId).find(
            child => child.type === DataMapNodeType.ATTRIBUTE && child.name === attributeName
        );
    }

    /**
     * Build a path string for a node
     */
    static getPathString(datamap: SoarDataMap, nodeId: NodeId): string {
        const path = datamap.getPath(nodeId);
        return path.map(node => {
            if (node.type === DataMapNodeType.STATE) {
                return `<${node.name}>`;
            } else if (node.type === DataMapNodeType.ATTRIBUTE) {
                return `^${node.name}`;
            } else {
                return node.name;
            }
        }).join(' ');
    }

    /**
     * Search datamap by attribute path
     */
    static findByPath(datamap: SoarDataMap, path: string[]): DataMapNode[] {
        if (path.length === 0) {
            return [];
        }

        let currentNodes = [datamap.getRootNode()].filter((n): n is DataMapNode => n !== undefined);
        
        for (const segment of path) {
            const nextNodes: DataMapNode[] = [];
            for (const node of currentNodes) {
                const children = datamap.getChildren(node.id).filter(
                    child => child.name === segment
                );
                nextNodes.push(...children);
            }
            currentNodes = nextNodes;
        }
        
        return currentNodes;
    }

    /**
     * Get all possible attribute completions at a given path
     */
    static getCompletionsAtPath(datamap: SoarDataMap, path: string[]): string[] {
        const nodes = this.findByPath(datamap, path);
        const completions = new Set<string>();
        
        for (const node of nodes) {
            for (const child of datamap.getChildren(node.id)) {
                if (child.type === DataMapNodeType.ATTRIBUTE) {
                    completions.add(child.name);
                }
            }
        }
        
        return Array.from(completions).sort();
    }

    /**
     * Create a visualization-friendly tree structure
     */
    static toTree(datamap: SoarDataMap, nodeId?: NodeId): any {
        const root = nodeId ? datamap.getNode(nodeId) : datamap.getRootNode();
        if (!root) {
            return null;
        }

        const buildTree = (node: DataMapNode): any => {
            return {
                id: node.id,
                name: node.name,
                type: node.type,
                children: datamap.getChildren(node.id).map(buildTree)
            };
        };

        return buildTree(root);
    }
}
```

### 4.5 Create Tests

Create `test/suite/datamap.test.ts`:

```typescript
import * as assert from 'assert';
import { SoarDataMap } from '../../src/datamap/index';
import { DataMapNodeType } from '../../src/datamap/types';
import { DataMapUtils } from '../../src/datamap/utils';

suite('DataMap Test Suite', () => {
    
    test('Create empty datamap', () => {
        const datamap = new SoarDataMap('test-datamap');
        assert.ok(datamap);
        assert.strictEqual(datamap.getAllNodes().length, 0);
    });

    test('Add nodes to datamap', () => {
        const datamap = new SoarDataMap('test-datamap');
        
        const stateId = datamap.addNode({
            name: 's1',
            type: DataMapNodeType.STATE,
            children: []
        });
        
        const attrId = datamap.addNode({
            name: 'name',
            type: DataMapNodeType.ATTRIBUTE,
            parent: stateId,
            children: []
        });
        
        assert.strictEqual(datamap.getAllNodes().length, 2);
        assert.strictEqual(datamap.getChildren(stateId).length, 1);
    });

    test('Find nodes by name', () => {
        const datamap = new SoarDataMap('test-datamap');
        
        datamap.addNode({
            name: 'operator',
            type: DataMapNodeType.ATTRIBUTE,
            children: []
        });
        
        const found = datamap.findNodesByName('operator');
        assert.strictEqual(found.length, 1);
        assert.strictEqual(found[0].name, 'operator');
    });

    test('Get path to node', () => {
        const datamap = new SoarDataMap('test-datamap');
        
        const stateId = datamap.addNode({
            name: 's1',
            type: DataMapNodeType.STATE,
            children: []
        });
        
        const attrId = datamap.addNode({
            name: 'name',
            type: DataMapNodeType.ATTRIBUTE,
            parent: stateId,
            children: []
        });
        
        const path = datamap.getPath(attrId);
        assert.strictEqual(path.length, 2);
        assert.strictEqual(path[0].id, stateId);
        assert.strictEqual(path[1].id, attrId);
    });

    test('Export and import JSON', () => {
        const datamap = new SoarDataMap('test-datamap');
        
        datamap.addNode({
            name: 's1',
            type: DataMapNodeType.STATE,
            children: []
        });
        
        const json = datamap.toJSON();
        const imported = SoarDataMap.fromJSON(json);
        
        assert.strictEqual(imported.getAllNodes().length, 1);
        assert.strictEqual(imported.getAllNodes()[0].name, 's1');
    });
});
```

## Verification Checklist

- [ ] Type definitions created with all necessary interfaces
- [ ] SoarDataMap class implements core operations
- [ ] Node addition and removal work correctly
- [ ] Parent-child relationships maintained
- [ ] Name-based search works
- [ ] Path traversal works
- [ ] Links between nodes can be created
- [ ] DataMap parser can extract basic information
- [ ] Utility functions work as expected
- [ ] JSON export/import works
- [ ] Tests pass
- [ ] No TypeScript compilation errors

## Next Steps

Proceed to Phase 5: `instructions/phase5-datamap-completions.md` to implement datamap-based code suggestions.

## Files Created

- `src/datamap/types.ts` - Type definitions
- `src/datamap/index.ts` - Core DataMap class
- `src/datamap/parser.ts` - DataMap parser
- `src/datamap/utils.ts` - Utility functions
- `test/suite/datamap.test.ts` - Unit tests

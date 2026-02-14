import { DMVertex, ProjectContext, VisualSoarProject } from '../server/visualSoarProject';

export interface InboundEdgeInfo {
  parentId: string;
  edgeName: string;
  targetId: string;
}

export interface DatamapEdgeMetadata extends InboundEdgeInfo {
  ownerParentId: string | null;
  inboundCount: number;
  isLink: boolean;
  isCycle: boolean;
  hasLinkedSiblings: boolean;
}

export interface DatamapProjectContext extends ProjectContext {
  datamapMetadata: DatamapMetadataCache;
}

export class DatamapMetadataCache {
  private readonly attributeIndex: Map<string, InboundEdgeInfo[]>;
  private readonly datamapIndex: Map<string, DMVertex>;

  private constructor(
    private readonly vertexOwners: Map<string, string | null>,
    private readonly inboundMap: Map<string, InboundEdgeInfo[]>,
    private readonly edgeIndex: Map<string, DatamapEdgeMetadata>,
    attributeIndex: Map<string, InboundEdgeInfo[]>,
    datamapIndex: Map<string, DMVertex>
  ) {
    this.attributeIndex = attributeIndex;
    this.datamapIndex = datamapIndex;
  }

  static build(
    project: VisualSoarProject,
    datamapIndex: Map<string, DMVertex>
  ): DatamapMetadataCache {
    const inboundMap = new Map<string, InboundEdgeInfo[]>();

    for (const vertex of project.datamap.vertices) {
      if (vertex.type !== 'SOAR_ID' || !vertex.outEdges) {
        continue;
      }

      for (const edge of vertex.outEdges) {
        const entry: InboundEdgeInfo = {
          parentId: vertex.id,
          edgeName: edge.name,
          targetId: edge.toId,
        };

        const inboundEdges = inboundMap.get(edge.toId) || [];
        inboundEdges.push(entry);
        inboundMap.set(edge.toId, inboundEdges);
      }
    }

    const vertexOwners = DatamapMetadataCache.buildOwnershipMap(project, datamapIndex, inboundMap);
    const edgeIndex = new Map<string, DatamapEdgeMetadata>();
    const attributeIndex = new Map<string, InboundEdgeInfo[]>();

    // Build attribute index: map attribute name -> list of inbound edge infos (parents that have this attribute)
    for (const vertex of project.datamap.vertices) {
      if (vertex.type !== 'SOAR_ID' || !vertex.outEdges) {
        continue;
      }
      for (const edge of vertex.outEdges) {
        const entry: InboundEdgeInfo = {
          parentId: vertex.id,
          edgeName: edge.name,
          targetId: edge.toId,
        };
        const arr = attributeIndex.get(edge.name) || [];
        arr.push(entry);
        attributeIndex.set(edge.name, arr);
      }
    }

    for (const [targetId, inboundEdges] of inboundMap.entries()) {
      const ownerParentId = vertexOwners.get(targetId) ?? null;
      const inboundCount = inboundEdges.length;

      for (const inboundEdge of inboundEdges) {
        const isCycle = DatamapMetadataCache.isMutuallyLinked(
          inboundEdge.parentId,
          targetId,
          datamapIndex
        );
        const hasLinkedSiblings = inboundCount > 1 && !isCycle;
        const isOwnerEdge = ownerParentId !== null && inboundEdge.parentId === ownerParentId;
        const isLink = hasLinkedSiblings && !isOwnerEdge;

        edgeIndex.set(DatamapMetadataCache.makeEdgeKey(inboundEdge), {
          ...inboundEdge,
          ownerParentId,
          inboundCount,
          isLink,
          isCycle,
          hasLinkedSiblings,
        });
      }
    }

    return new DatamapMetadataCache(
      vertexOwners,
      inboundMap,
      edgeIndex,
      attributeIndex,
      datamapIndex
    );
  }

  /**
   * Check if an attribute (or dotted path) exists anywhere in the datamap.
   */
  attributeExists(attributeName: string, project: VisualSoarProject): boolean {
    const pathSegments = attributeName.split('.');
    if (pathSegments.length === 1) {
      return this.attributeIndex.has(attributeName);
    }

    const first = pathSegments[0];
    const remaining = pathSegments.slice(1);

    if (first === 'superstate') {
      const rootId = project.datamap.rootId;
      return this.canNavigatePath(rootId, remaining, project);
    }

    const parents = this.attributeIndex.get(first) || [];
    for (const p of parents) {
      if (this.canNavigatePath(p.targetId, remaining, project)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Navigate a path from a starting vertex id and determine if it can be followed.
   */
  canNavigatePath(
    startVertexId: string,
    pathSegments: string[],
    project: VisualSoarProject
  ): boolean {
    if (pathSegments.length === 0) {
      return true;
    }
    const vertex = this.datamapIndex.get(startVertexId as any);
    if (!vertex || vertex.type !== 'SOAR_ID') {
      return false;
    }

    const first = pathSegments[0];
    const remaining = pathSegments.slice(1);
    const matchingEdges = vertex.outEdges?.filter((e: any) => e.name === first) || [];
    for (const edge of matchingEdges) {
      if (remaining.length > 0) {
        if (this.canNavigatePath(edge.toId, remaining, project)) {
          return true;
        }
      } else {
        return true;
      }
    }
    return false;
  }

  /**
   * Find the first invalid segment for a dotted attribute path.
   */
  findFirstInvalidSegment(
    attributeName: string,
    project: VisualSoarProject
  ): { invalidSegment?: string; lastValidParent?: string } {
    const pathSegments = attributeName.split('.');
    if (pathSegments.length === 1) {
      return { invalidSegment: attributeName };
    }

    const first = pathSegments[0];
    const remaining = pathSegments.slice(1);

    if (first === 'superstate') {
      const rootId = project.datamap.rootId;
      const res = this.findInvalidSegmentInPath(rootId, remaining, project, 'superstate');
      if (res) {
        return res;
      }
    }

    const parents = this.attributeIndex.get(first) || [];
    for (const p of parents) {
      const res = this.findInvalidSegmentInPath(p.targetId, pathSegments.slice(1), project, first);
      if (res) {
        return res;
      }
    }

    return { invalidSegment: first };
  }

  private findInvalidSegmentInPath(
    startVertexId: string,
    pathSegments: string[],
    project: VisualSoarProject,
    lastValidParent: string
  ): { invalidSegment: string; lastValidParent: string } | null {
    if (pathSegments.length === 0) {
      return null;
    }
    const vertex = this.datamapIndex.get(startVertexId as any);
    if (!vertex || vertex.type !== 'SOAR_ID') {
      return { invalidSegment: pathSegments[0], lastValidParent };
    }

    const first = pathSegments[0];
    const remaining = pathSegments.slice(1);
    const matchingEdges = vertex.outEdges?.filter((e: any) => e.name === first) || [];
    if (matchingEdges.length === 0) {
      return { invalidSegment: first, lastValidParent };
    }

    for (const edge of matchingEdges) {
      if (remaining.length > 0) {
        const result = this.findInvalidSegmentInPath(edge.toId, remaining, project, first);
        if (result) {
          return result;
        }
      } else {
        return null;
      }
    }
    return null;
  }

  /**
   * Return enumeration vertices reachable from any SOAR_ID via the path.
   */
  findAllEnumerationsForAttribute(
    pathSegments: string[],
    project: VisualSoarProject
  ): Array<{ vertexId: string; choices: string[] }> {
    const enumerations: Array<{ vertexId: string; choices: string[] }> = [];
    const seen = new Set<string>();
    for (const vertex of project.datamap.vertices) {
      if (vertex.type !== 'SOAR_ID' || !vertex.outEdges) {
        continue;
      }
      const found = this.navigatePathFromVertex(vertex.id, pathSegments, project);
      for (const f of found) {
        if (!seen.has(f.vertexId)) {
          seen.add(f.vertexId);
          enumerations.push(f);
        }
      }
    }
    return enumerations;
  }

  navigatePathFromVertex(
    vertexId: string,
    pathSegments: string[],
    project: VisualSoarProject
  ): Array<{ vertexId: string; choices: string[] }> {
    if (pathSegments.length === 0) {
      return [];
    }
    const vertex = this.datamapIndex.get(vertexId as any);
    if (!vertex || vertex.type !== 'SOAR_ID') {
      return [];
    }

    const first = pathSegments[0];
    const remaining = pathSegments.slice(1);
    const enumerations: Array<{ vertexId: string; choices: string[] }> = [];
    const matchingEdges = vertex.outEdges?.filter((e: any) => e.name === first) || [];
    for (const edge of matchingEdges) {
      if (remaining.length === 0) {
        const target = this.datamapIndex.get(edge.toId as any);
        if (target && target.type === 'ENUMERATION') {
          enumerations.push({ vertexId: edge.toId, choices: target.choices });
        }
      } else {
        const deeper = this.navigatePathFromVertex(edge.toId, remaining, project);
        enumerations.push(...deeper);
      }
    }
    return enumerations;
  }

  /**
   * Find target vertices for a path starting from many start ids.
   */
  findTargetVerticesForPath(
    startVertexIds: string[],
    pathSegments: string[],
    project: VisualSoarProject
  ): string[] {
    if (pathSegments.length === 0) {
      return startVertexIds;
    }
    const targets = new Set<string>();
    for (const s of startVertexIds) {
      const vertex = this.datamapIndex.get(s as any);
      if (!vertex || vertex.type !== 'SOAR_ID') {
        continue;
      }
      const first = pathSegments[0];
      const remaining = pathSegments.slice(1);
      const matchingEdges = vertex.outEdges?.filter((e: any) => e.name === first) || [];
      for (const edge of matchingEdges) {
        if (remaining.length > 0) {
          const results = this.findTargetVerticesForPath([edge.toId], remaining, project);
          for (const r of results) {
            targets.add(r);
          }
        } else {
          targets.add(edge.toId);
        }
      }
    }
    return Array.from(targets);
  }

  private static buildOwnershipMap(
    project: VisualSoarProject,
    datamapIndex: Map<string, DMVertex>,
    inboundMap: Map<string, InboundEdgeInfo[]>
  ): Map<string, string | null> {
    const owners = new Map<string, string | null>();
    const rootId = project.datamap.rootId;
    owners.set(rootId, null);

    const stack: string[] = [rootId];
    const visited = new Set<string>([rootId]);

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      const vertex = datamapIndex.get(currentId);
      if (!vertex || vertex.type !== 'SOAR_ID' || !vertex.outEdges) {
        continue;
      }

      for (const edge of vertex.outEdges) {
        if (!owners.has(edge.toId)) {
          owners.set(edge.toId, currentId);
        }
        if (!visited.has(edge.toId)) {
          stack.push(edge.toId);
          visited.add(edge.toId);
        }
      }
    }

    for (const [targetId, inboundEdges] of inboundMap.entries()) {
      if (!owners.has(targetId)) {
        owners.set(targetId, inboundEdges[0]?.parentId ?? null);
      }
    }

    return owners;
  }

  getEdgeMetadata(
    parentId: string,
    edgeName: string,
    targetId: string
  ): DatamapEdgeMetadata | undefined {
    return this.edgeIndex.get(DatamapMetadataCache.makeEdgeKey({ parentId, edgeName, targetId }));
  }

  getOwner(vertexId: string): string | null {
    return this.vertexOwners.get(vertexId) ?? null;
  }

  getInboundReferences(vertexId: string): InboundEdgeInfo[] {
    return this.inboundMap.get(vertexId) ?? [];
  }

  private static isMutuallyLinked(
    parentId: string,
    targetId: string,
    datamapIndex: Map<string, DMVertex>
  ): boolean {
    const targetVertex = datamapIndex.get(targetId);
    if (!targetVertex || targetVertex.type !== 'SOAR_ID' || !targetVertex.outEdges) {
      return false;
    }
    return targetVertex.outEdges.some(edge => edge.toId === parentId);
  }

  private static makeEdgeKey(edge: InboundEdgeInfo): string {
    return `${edge.parentId}::${edge.edgeName}::${edge.targetId}`;
  }
}

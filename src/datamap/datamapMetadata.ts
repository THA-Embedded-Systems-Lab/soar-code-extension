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
}

export interface DatamapProjectContext extends ProjectContext {
  datamapMetadata: DatamapMetadataCache;
}

export class DatamapMetadataCache {
  private constructor(
    private readonly vertexOwners: Map<string, string | null>,
    private readonly inboundMap: Map<string, InboundEdgeInfo[]>,
    private readonly edgeIndex: Map<string, DatamapEdgeMetadata>
  ) {}

  static build(
    project: VisualSoarProject,
    datamapIndex: Map<string, DMVertex>
  ): DatamapMetadataCache {
    const vertexOwners = new Map<string, string | null>();
    const inboundMap = new Map<string, InboundEdgeInfo[]>();
    const edgeIndex = new Map<string, DatamapEdgeMetadata>();

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

        if (!vertexOwners.has(edge.toId)) {
          vertexOwners.set(edge.toId, vertex.id);
        }
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
        const isLink =
          inboundCount > 1 &&
          ownerParentId !== null &&
          inboundEdge.parentId !== ownerParentId &&
          !isCycle;

        edgeIndex.set(DatamapMetadataCache.makeEdgeKey(inboundEdge), {
          ...inboundEdge,
          ownerParentId,
          inboundCount,
          isLink,
          isCycle,
        });
      }
    }

    return new DatamapMetadataCache(vertexOwners, inboundMap, edgeIndex);
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

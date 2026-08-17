/**
 * Datamap Operations
 *
 * Pure (VS Code UI-free) CRUD logic on the datamap structure. Runs both
 * inside the extension host and in the standalone MCP process, so this file
 * must never import `vscode`. Interactive/prompt-driven variants live in
 * datamapOperationsUi.ts, which is imported only from the extension host.
 */

import * as fs from 'fs';
import { OutEdge, SoarIdVertex } from '../server/visualSoarProject.js';
import { DatamapProjectContext, DatamapMetadataCache } from './datamapMetadata.js';

export class DatamapOperations {
  /**
   * Core deletion logic (no VS Code UI).
   *
   * Looks up the attribute by parentVertexId + attributeName, removes the edge,
   * and – unless removeLinkOnly is true – deletes the target vertex (and its
   * whole subtree) when this edge is the ownership edge.
   *
   * Returns a result object on success, or throws on invalid input.
   */
  static async deleteAttributeCore(
    projectContext: DatamapProjectContext,
    parentVertexId: string,
    attributeName: string,
    removeLinkOnly?: boolean
  ): Promise<{
    parentVertexId: string;
    attributeName: string;
    targetVertexId: string;
    removedAsLinkOnly: boolean;
  }> {
    const parentVertex = projectContext.datamapIndex.get(parentVertexId);
    if (!parentVertex || parentVertex.type !== 'SOAR_ID') {
      throw new Error(`Parent vertex '${parentVertexId}' not found or is not a SOAR_ID`);
    }

    const soarParent = parentVertex as SoarIdVertex;
    if (!soarParent.outEdges) {
      throw new Error(`Parent vertex '${parentVertexId}' has no attributes`);
    }

    const edgeIndex = soarParent.outEdges.findIndex((e: OutEdge) => e.name === attributeName);
    if (edgeIndex === -1) {
      throw new Error(
        `Attribute '${attributeName}' was not found under parent '${parentVertexId}'`
      );
    }

    const [edge] = soarParent.outEdges.splice(edgeIndex, 1);
    const edgeMetadata = projectContext.datamapMetadata.getEdgeMetadata(
      parentVertex.id,
      edge.name,
      edge.toId
    );

    // Delete the target vertex when:
    //   - removeLinkOnly is not set, AND
    //   - either this edge is the ownership edge (ownerParentId === parent.id),
    //     or there are no other inbound edges (inboundCount <= 1).
    const isOwnerEdge =
      !edgeMetadata ||
      edgeMetadata.ownerParentId === parentVertex.id ||
      edgeMetadata.inboundCount <= 1;
    const shouldDeleteTarget = !removeLinkOnly && isOwnerEdge;

    if (shouldDeleteTarget) {
      DatamapOperations.removeVertexRecursive(edge.toId, projectContext);
    }

    await this.saveProject(projectContext);

    return {
      parentVertexId: parentVertex.id,
      attributeName: edge.name,
      targetVertexId: edge.toId,
      removedAsLinkOnly: !shouldDeleteTarget,
    };
  }

  /**
   * Helper: Recursively remove a vertex and all its descendants
   */
  static removeVertexRecursive(vertexId: string, projectContext: DatamapProjectContext): void {
    // First pass: collect every vertex ID that will be deleted in this subtree.
    // Linked targets (owned by a vertex outside this subtree) are skipped –
    // only their edge is removed, not the vertex they point to.
    const toDelete = new Set<string>();
    DatamapOperations.collectSubtreeIds(vertexId, projectContext, toDelete);

    // Second pass: sweep all SOAR_ID vertices and remove any outgoing edge that
    // references a vertex scheduled for deletion (covers dangling link edges).
    for (const vertex of projectContext.project.datamap.vertices) {
      if (vertex.type !== 'SOAR_ID' || !vertex.outEdges) {
        continue;
      }
      (vertex as SoarIdVertex).outEdges = (vertex as SoarIdVertex).outEdges!.filter(
        (edge: OutEdge) => !toDelete.has(edge.toId)
      );
    }

    // Third pass: remove the vertices themselves.
    for (const id of toDelete) {
      projectContext.datamapIndex.delete(id);
    }
    projectContext.project.datamap.vertices = projectContext.project.datamap.vertices.filter(
      v => !toDelete.has(v.id)
    );
  }

  /**
   * Collect the IDs of a vertex and all descendants reachable via outEdges,
   * skipping children whose designated owner is a vertex outside this subtree
   * (i.e. linked targets).  A linked target is shared with another part of the
   * tree; its vertex must survive and only the edge pointing to it will be
   * pruned by the caller's second pass.
   */
  static collectSubtreeIds(
    vertexId: string,
    projectContext: DatamapProjectContext,
    result: Set<string>
  ): void {
    // Phase 1: naively collect all vertices reachable from vertexId.
    const candidates = new Set<string>();
    DatamapOperations.collectReachable(vertexId, projectContext, candidates);

    // Phase 2: iteratively remove any candidate vertex that has at least one
    // inbound edge from a vertex OUTSIDE the candidate set that would keep it
    // alive.  Two rules apply:
    //   (a) An external OWNERSHIP edge always preserves the target.
    //   (b) If the designated owner of a candidate vertex is itself inside the
    //       candidate set (i.e. being deleted), then ANY external inbound edge
    //       preserves the target – because once the original owner is removed
    //       that edge becomes the new effective owner.
    // Iterate to fixpoint because removing a vertex from candidates may expose
    // further vertices that should also be preserved.
    let changed = true;
    while (changed) {
      changed = false;
      for (const v of projectContext.project.datamap.vertices) {
        // Only inspect external vertices (potential external owners).
        if (candidates.has(v.id) || v.type !== 'SOAR_ID' || !v.outEdges) {
          continue;
        }
        for (const edge of (v as SoarIdVertex).outEdges!) {
          if (!candidates.has(edge.toId)) {
            continue;
          }
          const meta = projectContext.datamapMetadata.getEdgeMetadata(v.id, edge.name, edge.toId);
          const isOwnershipEdge = !meta || !meta.isLink;

          // Rule (b): if the designated owner of the candidate is inside the
          // subtree being deleted, promote any external reference to ownership.
          const ownerBeingDeleted =
            meta?.ownerParentId !== undefined &&
            meta.ownerParentId !== null &&
            candidates.has(meta.ownerParentId);

          if (isOwnershipEdge || ownerBeingDeleted) {
            candidates.delete(edge.toId);
            changed = true;
          }
        }
      }
    }

    for (const id of candidates) {
      result.add(id);
    }
  }

  /**
   * Naively collect all vertices reachable from vertexId via outEdges
   * (ignoring link/ownership semantics).
   */
  private static collectReachable(
    vertexId: string,
    projectContext: DatamapProjectContext,
    result: Set<string>
  ): void {
    if (result.has(vertexId)) {
      return;
    }
    const vertex = projectContext.datamapIndex.get(vertexId);
    if (!vertex) {
      return;
    }
    result.add(vertexId);
    if (vertex.type === 'SOAR_ID') {
      const soarIdVertex = vertex as SoarIdVertex;
      if (soarIdVertex.outEdges) {
        for (const edge of soarIdVertex.outEdges) {
          DatamapOperations.collectReachable(edge.toId, projectContext, result);
        }
      }
    }
  }

  /**
   * Helper: Save project to file
   */
  static async saveProject(projectContext: DatamapProjectContext): Promise<void> {
    try {
      const json = JSON.stringify(projectContext.project, null, 2);
      await fs.promises.writeFile(projectContext.projectFile, json, 'utf-8');
      console.log(`Successfully saved project to: ${projectContext.projectFile}`);

      projectContext.datamapMetadata = DatamapMetadataCache.build(
        projectContext.project,
        projectContext.datamapIndex
      );
    } catch (error: any) {
      console.error(`Failed to save project: ${error.message}`);
      throw error;
    }
  }
}

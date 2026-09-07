/**
 * Datamap usage analysis
 *
 * Finds "stale" datamap items: attribute edges in the project datamap whose
 * name is never tested (LHS) or created (RHS) by any production in any project
 * Soar file. These are candidates for removal — they add datamap noise and can
 * signal a renamed/deleted attribute that was never cleaned up.
 *
 * The check is name-based (an edge is considered used if its attribute name
 * appears anywhere as an attribute segment in the project), matching the
 * deliberately conservative philosophy of {@link DatamapValidator}: it only
 * flags an item when the name is referenced *nowhere*, so a rename typo is
 * caught without false-flagging attributes that are used through a different
 * datamap path.
 */

import { DMVertex, VisualSoarProject } from '../server/visualSoarProject';
import { SoarDocument } from '../server/soarTypes';

export interface StaleDatamapItem {
  /** The SOAR_ID vertex that owns the unused edge. */
  parentVertexId: string;
  /** The attribute name of the unused edge. */
  attributeName: string;
  /** The vertex the unused edge points at. */
  targetVertexId: string;
  /** Best-effort dotted path from the datamap root to this edge. */
  path: string;
  /** Human-readable explanation (warning text). */
  message: string;
}

/**
 * Attributes supplied by the Soar architecture (or only meaningful
 * structurally) that routinely appear in a datamap without an explicit
 * user-written test or action. Never reported as stale.
 */
export const ARCHITECTURAL_ATTRIBUTES: ReadonlySet<string> = new Set([
  'superstate',
  'top-state',
  'type',
  'impasse',
  'choices',
  'item',
  'item-count',
  'non-numeric',
  'quiescence',
  'attribute',
  'io',
  'input-link',
  'output-link',
  'reward-link',
  'epmem',
  'smem',
  'operator',
  'name',
]);

export class DatamapUsageAnalyzer {
  /**
   * Collect every attribute-name segment referenced by any production in the
   * given documents. Dotted paths are split into segments so `^io.input-link.x`
   * contributes `io`, `input-link`, and `x`. Fully-dynamic attribute tests
   * (`^<var>`, whose parsed name is `''`) contribute nothing.
   */
  static collectReferencedAttributeNames(documents: SoarDocument[]): Set<string> {
    const names = new Set<string>();
    for (const document of documents) {
      for (const production of document.productions) {
        for (const attr of production.attributes) {
          if (!attr.name) {
            continue;
          }
          for (const segment of attr.name.split('.')) {
            if (segment.length > 0) {
              names.add(segment);
            }
          }
        }
      }
    }
    return names;
  }

  /**
   * True if any production anywhere uses a fully-dynamic attribute test
   * (`(<id> ^<var> <value>)`). When present, a name-based stale check can
   * report false positives (the dynamic test could resolve to any attribute),
   * so callers may wish to soften or suppress the result.
   */
  static hasDynamicAttributeTests(documents: SoarDocument[]): boolean {
    for (const document of documents) {
      for (const production of document.productions) {
        for (const attr of production.attributes) {
          if (attr.attributeVariable) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Find datamap edges whose attribute name is referenced nowhere in the
   * project's Soar files.
   */
  static findStaleDatamapItems(
    project: VisualSoarProject,
    datamapIndex: Map<string, DMVertex>,
    documents: SoarDocument[],
    options: { extraExemptAttributes?: Iterable<string> } = {}
  ): StaleDatamapItem[] {
    const referenced = this.collectReferencedAttributeNames(documents);

    const exempt = new Set<string>(ARCHITECTURAL_ATTRIBUTES);
    for (const name of options.extraExemptAttributes ?? []) {
      exempt.add(name);
    }

    const pathToVertex = this.buildRootPaths(project, datamapIndex);

    const seen = new Set<string>();
    const stale: StaleDatamapItem[] = [];

    for (const vertex of project.datamap.vertices) {
      if (vertex.type !== 'SOAR_ID' || !vertex.outEdges) {
        continue;
      }
      for (const edge of vertex.outEdges) {
        if (referenced.has(edge.name) || exempt.has(edge.name)) {
          continue;
        }

        const key = `${vertex.id}::${edge.name}::${edge.toId}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        const parentPath = pathToVertex.get(vertex.id);
        const fullPath =
          parentPath === undefined
            ? edge.name
            : parentPath
              ? `${parentPath}.${edge.name}`
              : edge.name;

        stale.push({
          parentVertexId: vertex.id,
          attributeName: edge.name,
          targetVertexId: edge.toId,
          path: fullPath,
          message:
            `Datamap attribute '^${edge.name}' (${fullPath}) is never tested or created in ` +
            `any project Soar file. It may be stale/unused and can likely be removed.`,
        });
      }
    }

    return stale;
  }

  /** BFS from the datamap root, recording the first dotted path found to each vertex. */
  private static buildRootPaths(
    project: VisualSoarProject,
    datamapIndex: Map<string, DMVertex>
  ): Map<string, string> {
    const pathToVertex = new Map<string, string>();
    const rootId = project.datamap.rootId;
    pathToVertex.set(rootId, '');

    const queue: string[] = [rootId];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const vertex = datamapIndex.get(currentId);
      if (!vertex || vertex.type !== 'SOAR_ID' || !vertex.outEdges) {
        continue;
      }
      const base = pathToVertex.get(currentId) ?? '';
      for (const edge of vertex.outEdges) {
        if (!pathToVertex.has(edge.toId)) {
          pathToVertex.set(edge.toId, base ? `${base}.${edge.name}` : edge.name);
          queue.push(edge.toId);
        }
      }
    }

    return pathToVertex;
  }
}

/**
 * Datamap usage analysis
 *
 * Cross-references the project datamap against every production in the project's
 * Soar files and classifies each datamap attribute edge by whether its name is
 * ever *tested* (appears on a condition / LHS) and/or *created* (appears on an
 * action / RHS). This mirrors VisualSoar's five datamap "search" sweeps
 * (never-tested-or-created, tested-not-created, created-not-tested,
 * never-tested, never-created).
 *
 * The check is name-based (an edge counts as tested/created if its attribute
 * name appears anywhere as an attribute path segment on the matching side),
 * matching the deliberately conservative philosophy of {@link DatamapValidator}:
 * an item is only flagged when the name is absent from the relevant side
 * *everywhere*, so a rename/typo is caught without false-flagging attributes
 * that are reached through a different datamap path.
 */

import { DMVertex, VisualSoarProject } from '../server/visualSoarProject';
import { SoarDocument } from '../server/soarTypes';

export type DatamapUsageKind =
  | 'never-tested-or-created'
  | 'tested-not-created'
  | 'created-not-tested'
  | 'never-tested'
  | 'never-created';

export interface StaleDatamapItem {
  /** The SOAR_ID vertex that owns the edge. */
  parentVertexId: string;
  /** The attribute name of the edge. */
  attributeName: string;
  /** The vertex the edge points at. */
  targetVertexId: string;
  /** Best-effort dotted path from the datamap root to this edge. */
  path: string;
  /** Which usage category this item falls into. */
  kind: DatamapUsageKind;
  /** Human-readable explanation (warning text). */
  message: string;
}

/** Attribute-name segments referenced by productions, split by production side. */
export interface DatamapAttributeUsage {
  /** Names that appear on a condition (LHS) of some production. */
  tested: Set<string>;
  /** Names that appear on an action (RHS) of some production. */
  created: Set<string>;
}

/** One report bucket per {@link DatamapUsageKind}. */
export interface DatamapUsageReport {
  neverTestedOrCreated: StaleDatamapItem[];
  testedNotCreated: StaleDatamapItem[];
  createdNotTested: StaleDatamapItem[];
  neverTested: StaleDatamapItem[];
  neverCreated: StaleDatamapItem[];
}

/**
 * Attributes supplied by the Soar architecture (or only meaningful
 * structurally) that routinely appear in a datamap without an explicit
 * user-written test or action. Never reported in any usage category.
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

/* eslint-disable @typescript-eslint/naming-convention -- keys are DatamapUsageKind literals */
const KIND_MESSAGE: Record<DatamapUsageKind, string> = {
  'never-tested-or-created':
    'is never tested or created in any project Soar file. It may be stale/unused and can likely be removed.',
  'tested-not-created':
    'is tested by a rule condition but never created by any rule action in the project. Those conditions can never match.',
  'created-not-tested':
    'is created by a rule action but never tested by any rule condition in the project. It may be a dead working-memory element.',
  'never-tested': 'is never tested by any rule condition in the project.',
  'never-created': 'is never created by any rule action in the project.',
};
/* eslint-enable @typescript-eslint/naming-convention */

export class DatamapUsageAnalyzer {
  /**
   * Collect every attribute-name segment referenced by any production, split by
   * production side. Dotted paths are split into segments so `^io.input-link.x`
   * contributes `io`, `input-link`, and `x`. Fully-dynamic attribute tests
   * (`^<var>`, whose parsed name is `''`) contribute nothing. An attribute with
   * no recorded `side` is counted on both sides (conservative).
   */
  static collectAttributeUsage(documents: SoarDocument[]): DatamapAttributeUsage {
    const tested = new Set<string>();
    const created = new Set<string>();

    for (const document of documents) {
      for (const production of document.productions) {
        for (const attr of production.attributes) {
          if (!attr.name) {
            continue;
          }
          const targets: Set<string>[] =
            attr.side === 'lhs' ? [tested] : attr.side === 'rhs' ? [created] : [tested, created];
          for (const segment of attr.name.split('.')) {
            if (segment.length === 0) {
              continue;
            }
            for (const target of targets) {
              target.add(segment);
            }
          }
        }
      }
    }

    return { tested, created };
  }

  /**
   * Collect every attribute-name segment referenced by any production on either
   * side (union of {@link collectAttributeUsage}).
   */
  static collectReferencedAttributeNames(documents: SoarDocument[]): Set<string> {
    const { tested, created } = this.collectAttributeUsage(documents);
    return new Set<string>([...tested, ...created]);
  }

  /**
   * True if any production anywhere uses a fully-dynamic attribute test
   * (`(<id> ^<var> <value>)`). When present, a name-based usage check can
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
   * Classify every datamap attribute edge by test/create usage across the
   * project's Soar files. Architectural attributes are always exempt.
   *
   * The `^io.input-link` subtree is exempt from the `neverCreated` bucket and
   * the `^io.output-link` subtree from the `neverTested` bucket, since the
   * environment (not rules) creates the input-link and consumes the
   * output-link. The other buckets are unaffected.
   */
  static analyzeDatamapUsage(
    project: VisualSoarProject,
    datamapIndex: Map<string, DMVertex>,
    documents: SoarDocument[],
    options: { extraExemptAttributes?: Iterable<string> } = {}
  ): DatamapUsageReport {
    const { tested, created } = this.collectAttributeUsage(documents);

    const exempt = new Set<string>(ARCHITECTURAL_ATTRIBUTES);
    for (const name of options.extraExemptAttributes ?? []) {
      exempt.add(name);
    }

    const pathToVertex = this.buildRootPaths(project, datamapIndex);

    // The environment (not rules) creates the input-link and consumes the
    // output-link, so:
    //  - attributes under `^io.input-link` are never "created" by a rule → do
    //    not report them as never-created,
    //  - attributes under `^io.output-link` are never "tested" by a rule → do
    //    not report them as never-tested.
    // Mirrors VisualSoar's search sweeps, which skip descending into the
    // respective subtree.
    const inputLinkSubtree = this.collectSubtree(project, datamapIndex, 'input-link');
    const outputLinkSubtree = this.collectSubtree(project, datamapIndex, 'output-link');

    const report: DatamapUsageReport = {
      neverTestedOrCreated: [],
      testedNotCreated: [],
      createdNotTested: [],
      neverTested: [],
      neverCreated: [],
    };

    const seen = new Set<string>();

    for (const vertex of project.datamap.vertices) {
      if (vertex.type !== 'SOAR_ID' || !vertex.outEdges) {
        continue;
      }
      for (const edge of vertex.outEdges) {
        if (exempt.has(edge.name)) {
          continue;
        }

        const key = `${vertex.id}::${edge.name}::${edge.toId}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        const isTested = tested.has(edge.name);
        const isCreated = created.has(edge.name);
        if (isTested && isCreated) {
          continue;
        }

        const parentPath = pathToVertex.get(vertex.id);
        const fullPath =
          parentPath === undefined
            ? edge.name
            : parentPath
              ? `${parentPath}.${edge.name}`
              : edge.name;

        const make = (kind: DatamapUsageKind): StaleDatamapItem => ({
          parentVertexId: vertex.id,
          attributeName: edge.name,
          targetVertexId: edge.toId,
          path: fullPath,
          kind,
          message: `Datamap attribute '^${edge.name}' (${fullPath}) ${KIND_MESSAGE[kind]}`,
        });

        if (!isTested && !isCreated) {
          report.neverTestedOrCreated.push(make('never-tested-or-created'));
        }
        if (isTested && !isCreated) {
          report.testedNotCreated.push(make('tested-not-created'));
        }
        if (isCreated && !isTested) {
          report.createdNotTested.push(make('created-not-tested'));
        }
        if (!isTested && !outputLinkSubtree.has(vertex.id)) {
          report.neverTested.push(make('never-tested'));
        }
        if (!isCreated && !inputLinkSubtree.has(vertex.id)) {
          report.neverCreated.push(make('never-created'));
        }
      }
    }

    return report;
  }

  /**
   * Datamap edges whose name is never tested *and* never created anywhere in
   * the project — the strictest usage category and the one surfaced by
   * `soar.checkProject`. Thin wrapper over {@link analyzeDatamapUsage}.
   */
  static findStaleDatamapItems(
    project: VisualSoarProject,
    datamapIndex: Map<string, DMVertex>,
    documents: SoarDocument[],
    options: { extraExemptAttributes?: Iterable<string> } = {}
  ): StaleDatamapItem[] {
    return this.analyzeDatamapUsage(project, datamapIndex, documents, options).neverTestedOrCreated;
  }

  /**
   * Datamap edges tested by some rule condition but created by no rule action
   * anywhere in the project — those conditions can never match. Thin wrapper
   * over {@link analyzeDatamapUsage}.
   */
  static findTestedNotCreatedDatamapItems(
    project: VisualSoarProject,
    datamapIndex: Map<string, DMVertex>,
    documents: SoarDocument[],
    options: { extraExemptAttributes?: Iterable<string> } = {}
  ): StaleDatamapItem[] {
    return this.analyzeDatamapUsage(project, datamapIndex, documents, options).testedNotCreated;
  }

  /**
   * All vertex ids reachable from the target of any edge named `edgeName`
   * (e.g. every vertex under an `^input-link`). Cycle-safe.
   */
  private static collectSubtree(
    project: VisualSoarProject,
    datamapIndex: Map<string, DMVertex>,
    edgeName: string
  ): Set<string> {
    const queue: string[] = [];
    for (const vertex of project.datamap.vertices) {
      if (vertex.type !== 'SOAR_ID' || !vertex.outEdges) {
        continue;
      }
      for (const edge of vertex.outEdges) {
        if (edge.name === edgeName) {
          queue.push(edge.toId);
        }
      }
    }

    const seen = new Set<string>();
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      const vertex = datamapIndex.get(id);
      if (vertex?.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          if (!seen.has(edge.toId)) {
            queue.push(edge.toId);
          }
        }
      }
    }

    return seen;
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

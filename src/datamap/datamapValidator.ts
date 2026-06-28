/**
 * Datamap Validator
 *
 * Validates Soar code against the datamap structure in the project file
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectContext } from '../server/visualSoarProject';
import { SoarDocument, SoarProduction, SoarAttribute } from '../server/soarTypes';
import { DatamapMetadataCache } from './datamapMetadata';

const vscodeApi: typeof import('vscode') | undefined = (() => {
  try {
    return require('vscode') as typeof import('vscode');
  } catch {
    return undefined;
  }
})();

export interface ValidationError {
  production: string;
  attribute: string;
  attributePath: string;
  line: number;
  column: number;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface DatamapValidationContext {
  sourceFilePath?: string;
}

export class DatamapValidator {
  /**
   * Validate a parsed Soar document against the project datamap
   */
  validateDocument(
    document: SoarDocument,
    projectContext: ProjectContext,
    documentText?: string,
    validationContext: DatamapValidationContext = {}
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const production of document.productions) {
      const productionErrors = this.validateProduction(
        production,
        projectContext,
        documentText,
        validationContext
      );
      errors.push(...productionErrors);
    }

    errors.push(
      ...this.validateOperatorProposeApplyConsistency(document, projectContext, documentText)
    );

    return errors;
  }

  private static readonly OPERATOR_ATTR_EXEMPT = new Set(['name', 'operator']);

  private static isOperatorAttributeName(name: string): boolean {
    return name === 'operator' || name.endsWith('.operator');
  }

  /**
   * For one production, find the variables bound to an operator (`^operator
   * <op>`) and, where determinable, the operator name each is constrained to
   * (`<op> ^name <const>`).
   */
  private resolveOperatorContext(production: SoarProduction): {
    operatorVars: Set<string>;
    varToName: Map<string, string>;
  } {
    const operatorVars = new Set<string>();
    for (const attr of production.attributes) {
      if (
        !attr.isNegated &&
        DatamapValidator.isOperatorAttributeName(attr.name) &&
        attr.value?.startsWith('<')
      ) {
        operatorVars.add(attr.value.slice(1, -1));
      }
    }

    const varToName = new Map<string, string>();
    if (operatorVars.size > 0) {
      for (const attr of production.attributes) {
        if (
          attr.parentId &&
          attr.name === 'name' &&
          attr.value &&
          !attr.value.startsWith('<') &&
          operatorVars.has(attr.parentId)
        ) {
          varToName.set(attr.parentId, this.normalizeSoarConstant(attr.value));
        }
      }
    }

    return { operatorVars, varToName };
  }

  /**
   * Build the project-wide index of operator name → set of first-segment
   * attribute names created (RHS) on that operator across all given documents.
   * Attach the result to `projectContext.operatorAugmentationIndex` to enable
   * the propose/apply consistency check.
   */
  static buildOperatorAugmentationIndex(documents: SoarDocument[]): Map<string, Set<string>> {
    const validator = new DatamapValidator();
    const index = new Map<string, Set<string>>();

    for (const document of documents) {
      for (const production of document.productions) {
        const { operatorVars, varToName } = validator.resolveOperatorContext(production);
        if (operatorVars.size === 0) {
          continue;
        }
        for (const attr of production.attributes) {
          if (attr.side !== 'rhs' || !attr.parentId || !operatorVars.has(attr.parentId)) {
            continue;
          }
          const operatorName = varToName.get(attr.parentId);
          if (!operatorName) {
            continue;
          }
          const firstSegment = attr.name.split('.')[0];
          if (DatamapValidator.OPERATOR_ATTR_EXEMPT.has(firstSegment)) {
            continue;
          }
          if (!index.has(operatorName)) {
            index.set(operatorName, new Set());
          }
          index.get(operatorName)!.add(firstSegment);
        }
      }
    }

    return index;
  }

  /**
   * Project-wide check: an operator attribute tested on the apply side (LHS)
   * must be created (RHS) for that operator *somewhere in the project*, or the
   * apply rule can never match. Requires `projectContext.operatorAugmentationIndex`
   * (project-wide scan); skipped otherwise to avoid false positives.
   *
   * `^name`/`^operator` and negated tests are exempt, and comparison is by first
   * path segment so a tested `^desired.x` is satisfied by a created `^desired`.
   */
  private validateOperatorProposeApplyConsistency(
    document: SoarDocument,
    projectContext: ProjectContext,
    documentText?: string
  ): ValidationError[] {
    const createdIndex = projectContext.operatorAugmentationIndex;
    if (!createdIndex) {
      return [];
    }

    const errors: ValidationError[] = [];
    const seen = new Set<string>();

    for (const production of document.productions) {
      const { operatorVars, varToName } = this.resolveOperatorContext(production);
      if (operatorVars.size === 0) {
        continue;
      }

      for (const attr of production.attributes) {
        if (
          attr.side !== 'lhs' ||
          attr.isNegated ||
          !attr.parentId ||
          !operatorVars.has(attr.parentId)
        ) {
          continue;
        }
        const operatorName = varToName.get(attr.parentId);
        if (!operatorName) {
          continue; // generic operator rule (no ^name) — cannot attribute reliably
        }
        const firstSegment = attr.name.split('.')[0];
        if (DatamapValidator.OPERATOR_ATTR_EXEMPT.has(firstSegment)) {
          continue;
        }

        const created = createdIndex.get(operatorName);
        if (created && created.has(firstSegment)) {
          continue;
        }

        // The attribute may expand to several entries (one per value); report once.
        const dedupeKey = `${production.name}|${operatorName}|${attr.name}|${attr.range.start.line}:${attr.range.start.character}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);

        const preciseRange = this.findAttributeRange(attr, documentText);
        errors.push({
          production: production.name,
          attribute: attr.name,
          attributePath: `^${attr.name}`,
          line: preciseRange.start.line,
          column: preciseRange.start.character,
          range: preciseRange,
          message: `Operator '${operatorName}' is tested with '^${attr.name}' on the apply side, but no rule in the project creates '^${firstSegment}' on it. This rule can never match.`,
          severity: 'error',
        });
      }
    }

    return errors;
  }

  /**
   * Validate a single production against the datamap
   */
  private validateProduction(
    production: SoarProduction,
    projectContext: ProjectContext,
    documentText?: string,
    validationContext: DatamapValidationContext = {}
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Build a map of variable bindings to their potential vertex IDs
    const variableBindings = new Map<string, Set<string>>();

    // Start with the best available state binding for <s>
    const initialStateBindings = this.resolveInitialStateBindings(
      production,
      projectContext,
      validationContext
    );
    variableBindings.set('s', new Set(initialStateBindings));

    // First pass: build variable bindings by following attribute paths with variable values
    for (const attr of production.attributes) {
      if (!attr.parentId || !attr.value || !attr.value.startsWith('<')) {
        continue; // Only process variable bindings like (<s> ^operator <o>)
      }

      // Get the parent vertex IDs
      const parentVertices = variableBindings.get(attr.parentId);
      if (!parentVertices) {
        continue; // Parent not bound yet
      }

      const dmMeta = (projectContext as any).datamapMetadata as DatamapMetadataCache | undefined;
      const pathSegments = attr.name.split('.');
      const targetVertices =
        (dmMeta &&
          dmMeta.findTargetVerticesForPath(
            Array.from(parentVertices),
            pathSegments,
            projectContext.project
          )) ||
        this.findTargetVerticesForPath(Array.from(parentVertices), pathSegments, projectContext);

      // Bind the variable to these target vertices
      const varName = attr.value.substring(1, attr.value.length - 1); // Remove < >
      if (!variableBindings.has(varName)) {
        variableBindings.set(varName, new Set());
      }
      targetVertices.forEach(v => variableBindings.get(varName)!.add(v));
    }

    // Narrow bindings using explicit ^name constant tests so that, e.g.,
    // (<o> ^name some-operator) restricts <o> to the operator vertices whose
    // ^name enumeration actually includes that constant. This enables
    // context-aware checking of augmentations on a specific named operator.
    const variableNameConstraints = this.applyNameConstraints(
      production,
      variableBindings,
      projectContext
    );

    // Check for unbound variables (except <s> which is always bound to root)
    for (const attr of production.attributes) {
      if (attr.parentId && attr.parentId !== 's' && !variableBindings.has(attr.parentId)) {
        // Calculate precise range for the variable identifier
        const line = attr.range.start.line;
        const variableText = `<${attr.parentId}>`;
        const variableLength = variableText.length;

        let varStartCol = attr.range.start.character - variableLength - 2; // Default estimate

        // If we have document text, find the exact position
        if (documentText) {
          const lines = documentText.split('\n');
          if (line < lines.length) {
            const lineText = lines[line];
            const varIndex = lineText.indexOf(variableText);
            if (varIndex !== -1) {
              varStartCol = varIndex;
            }
          }
        }

        errors.push({
          production: production.name,
          attribute: attr.name,
          attributePath: `<${attr.parentId}> ^${attr.name}`,
          line: line,
          column: varStartCol,
          range: {
            start: { line: line, character: varStartCol },
            end: { line: line, character: varStartCol + variableLength },
          },
          message: `Variable <${attr.parentId}> is not bound. Variables must be connected to the state through attribute paths.`,
          severity: 'error',
        });
      }
    }

    // Second pass: validate attributes
    for (const attr of production.attributes) {
      // Try to validate this attribute
      const error = this.validateAttribute(
        attr,
        production,
        projectContext,
        variableBindings,
        variableNameConstraints,
        documentText
      );

      if (error) {
        errors.push(error);
      }
    }

    return errors;
  }

  /**
   * Narrow variable bindings using explicit `^name <constant>` tests.
   *
   * For each `(<var> ^name X)` test (X a non-variable constant), keep only the
   * bound vertices whose `^name` enumeration includes X. If no bound vertex
   * matches (inconsistent test, or a name that enum validation will flag), the
   * binding is left untouched to avoid cascading false positives.
   *
   * Returns a map of variable name -> the set of constant names constraining it
   * (used to produce helpful context-aware error messages).
   */
  private applyNameConstraints(
    production: SoarProduction,
    variableBindings: Map<string, Set<string>>,
    projectContext: ProjectContext
  ): Map<string, Set<string>> {
    const constraints = new Map<string, Set<string>>();

    for (const attr of production.attributes) {
      if (
        attr.isNegated ||
        !attr.parentId ||
        attr.name !== 'name' ||
        !attr.value ||
        attr.value.startsWith('<')
      ) {
        continue;
      }

      const constant = this.normalizeSoarConstant(attr.value);
      if (constant.length === 0) {
        continue;
      }

      if (!constraints.has(attr.parentId)) {
        constraints.set(attr.parentId, new Set());
      }
      constraints.get(attr.parentId)!.add(constant);
    }

    for (const [varName, names] of constraints) {
      const bound = variableBindings.get(varName);
      if (!bound || bound.size === 0) {
        continue;
      }

      const narrowed = new Set<string>();
      for (const vertexId of bound) {
        if (this.vertexNameMatches(vertexId, names, projectContext)) {
          narrowed.add(vertexId);
        }
      }

      if (narrowed.size > 0) {
        variableBindings.set(varName, narrowed);
      }
    }

    return constraints;
  }

  /**
   * True if the vertex has a `^name` edge to an ENUMERATION that includes every
   * required name constant.
   */
  private vertexNameMatches(
    vertexId: string,
    requiredNames: Set<string>,
    projectContext: ProjectContext
  ): boolean {
    const vertex = projectContext.datamapIndex.get(vertexId);
    if (!vertex || vertex.type !== 'SOAR_ID' || !vertex.outEdges) {
      return false;
    }

    const available = new Set<string>();
    for (const edge of vertex.outEdges) {
      if (edge.name !== 'name') {
        continue;
      }
      const target = projectContext.datamapIndex.get(edge.toId);
      if (target && target.type === 'ENUMERATION') {
        for (const choice of target.choices) {
          available.add(this.normalizeSoarConstant(choice));
        }
      }
    }

    for (const required of requiredNames) {
      if (!available.has(required)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Resolve the initial datamap vertex binding for <s>.
   *
   * Priority:
   * 1. Explicit (state <s> ^name X) tests in the production
   * 2. Layout/file context (the file's nearest high-level ancestor state)
   * 3. Root datamap state
   */
  private resolveInitialStateBindings(
    production: SoarProduction,
    projectContext: ProjectContext,
    validationContext: DatamapValidationContext
  ): string[] {
    const explicitStateNames = this.getExplicitStateNames(production);
    const explicitCandidates = this.resolveStateCandidatesByName(
      explicitStateNames,
      projectContext
    );
    if (explicitCandidates.length > 0) {
      return explicitCandidates;
    }

    if (validationContext.sourceFilePath) {
      const fileContextState = this.resolveStateBindingFromFilePath(
        validationContext.sourceFilePath,
        projectContext
      );
      if (fileContextState) {
        return [fileContextState];
      }
    }

    return [projectContext.project.datamap.rootId];
  }

  private getExplicitStateNames(production: SoarProduction): string[] {
    const names = new Set<string>();

    for (const attr of production.attributes) {
      if (attr.isNegated || attr.parentId !== 's' || attr.name !== 'name' || !attr.value) {
        continue;
      }

      if (attr.value.startsWith('<')) {
        continue;
      }

      const normalized = this.normalizeSoarConstant(attr.value);
      if (normalized.length > 0) {
        names.add(normalized);
      }
    }

    return Array.from(names);
  }

  private normalizeSoarConstant(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return '';
    }

    if (
      (trimmed.startsWith('|') && trimmed.endsWith('|')) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1).trim();
    }

    return trimmed;
  }

  private resolveStateCandidatesByName(
    stateNames: string[],
    projectContext: ProjectContext
  ): string[] {
    if (stateNames.length === 0) {
      return [];
    }

    const candidates = new Set<string>();
    const rootId = projectContext.project.datamap.rootId;

    for (const stateName of stateNames) {
      if (this.rootStateNameIncludes(stateName, projectContext)) {
        candidates.add(rootId);
      }

      for (const node of projectContext.layoutIndex.values()) {
        if (!('name' in node) || node.name !== stateName || !('dmId' in node) || !node.dmId) {
          continue;
        }

        if (
          node.type === 'HIGH_LEVEL_OPERATOR' ||
          node.type === 'HIGH_LEVEL_FILE_OPERATOR' ||
          node.type === 'HIGH_LEVEL_IMPASSE_OPERATOR'
        ) {
          candidates.add(node.dmId);
        }
      }
    }

    return Array.from(candidates);
  }

  private rootStateNameIncludes(stateName: string, projectContext: ProjectContext): boolean {
    const rootVertex = projectContext.datamapIndex.get(projectContext.project.datamap.rootId);
    if (!rootVertex || rootVertex.type !== 'SOAR_ID') {
      return false;
    }

    const nameEdges = rootVertex.outEdges?.filter(edge => edge.name === 'name') || [];
    for (const edge of nameEdges) {
      const target = projectContext.datamapIndex.get(edge.toId);
      if (
        target &&
        target.type === 'ENUMERATION' &&
        target.choices.some(choice => this.normalizeSoarConstant(choice) === stateName)
      ) {
        return true;
      }
    }

    return false;
  }

  private resolveStateBindingFromFilePath(
    sourceFilePath: string,
    projectContext: ProjectContext
  ): string | undefined {
    const nodeId = this.findLayoutNodeIdByFilePath(sourceFilePath, projectContext);
    if (!nodeId) {
      return undefined;
    }

    return this.findNearestAncestorStateDatamapId(projectContext, nodeId, true);
  }

  private findLayoutNodeIdByFilePath(
    sourceFilePath: string,
    projectContext: ProjectContext
  ): string | undefined {
    const projectDir = path.dirname(projectContext.projectFile);
    const relativeFilePath = path.normalize(path.relative(projectDir, sourceFilePath));
    if (!relativeFilePath || relativeFilePath.startsWith('..')) {
      return undefined;
    }

    const normalizedTarget = relativeFilePath.split(path.sep).join('/');

    const walk = (node: any, parentFolder: string = ''): string | undefined => {
      let currentFolder = parentFolder;
      if (typeof node.folder === 'string' && node.folder.length > 0) {
        currentFolder = parentFolder ? path.join(parentFolder, node.folder) : node.folder;
      }

      if (typeof node.file === 'string' && node.file.length > 0) {
        const filePath =
          node.type === 'HIGH_LEVEL_OPERATOR' ||
          node.type === 'HIGH_LEVEL_FILE_OPERATOR' ||
          node.type === 'HIGH_LEVEL_IMPASSE_OPERATOR'
            ? parentFolder
              ? path.join(parentFolder, node.file)
              : node.file
            : currentFolder
              ? path.join(currentFolder, node.file)
              : node.file;

        if (filePath.split(path.sep).join('/') === normalizedTarget) {
          return node.id;
        }
      }

      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          const found = walk(child, currentFolder);
          if (found) {
            return found;
          }
        }
      }

      return undefined;
    };

    return walk(projectContext.project.layout);
  }

  private findNearestAncestorStateDatamapId(
    projectContext: ProjectContext,
    nodeId: string,
    excludeSelf: boolean
  ): string {
    let currentNodeId: string | null = excludeSelf
      ? this.findParentNodeId(projectContext.project.layout, nodeId)
      : nodeId;

    while (currentNodeId) {
      const currentNode = projectContext.layoutIndex.get(currentNodeId);
      if (
        currentNode &&
        'dmId' in currentNode &&
        currentNode.dmId &&
        (currentNode.type === 'HIGH_LEVEL_OPERATOR' ||
          currentNode.type === 'HIGH_LEVEL_FILE_OPERATOR' ||
          currentNode.type === 'HIGH_LEVEL_IMPASSE_OPERATOR')
      ) {
        return currentNode.dmId;
      }

      currentNodeId = this.findParentNodeId(projectContext.project.layout, currentNodeId);
    }

    return projectContext.project.datamap.rootId;
  }

  private findParentNodeId(
    node: any,
    targetId: string,
    parentId: string | null = null
  ): string | null {
    if (node.id === targetId) {
      return parentId;
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = this.findParentNodeId(child, targetId, node.id);
        if (found !== null) {
          return found;
        }
      }
    }

    return null;
  }

  /**
   * Validate a single attribute
   *
   * Strategy: Only warn about attributes that don't exist ANYWHERE in the datamap.
   * This catches obvious typos while avoiding false positives from context issues.
   * Also validates enumeration values if the attribute has a value.
   */
  private validateAttribute(
    attr: SoarAttribute,
    production: SoarProduction,
    projectContext: ProjectContext,
    variableBindings: Map<string, Set<string>>,
    variableNameConstraints: Map<string, Set<string>>,
    documentText?: string
  ): ValidationError | null {
    // Skip negated attributes for now (they test for absence)
    if (attr.isNegated) {
      return null;
    }

    // Check if datamap has any vertices
    if (
      !projectContext.project.datamap.vertices ||
      projectContext.project.datamap.vertices.length === 0
    ) {
      return null; // Don't report errors if datamap isn't loaded
    }

    const dmMeta = (projectContext as any).datamapMetadata as DatamapMetadataCache | undefined;
    const existsInDatamap = dmMeta
      ? dmMeta.attributeExists(attr.name, projectContext.project)
      : this.attributeExistsInDatamap(attr.name, projectContext);

    if (!existsInDatamap) {
      const pathAnalysis = dmMeta
        ? dmMeta.findFirstInvalidSegment(attr.name, projectContext.project)
        : this.findFirstInvalidSegment(attr.name, projectContext);
      let message: string;
      if (pathAnalysis.invalidSegment) {
        // Dotted path with a specific invalid segment
        if (pathAnalysis.lastValidParent) {
          message = `'${pathAnalysis.invalidSegment}' is not a valid attribute for '${pathAnalysis.lastValidParent}'`;
        } else {
          message = `Attribute '^${pathAnalysis.invalidSegment}' not found in project datamap`;
        }
      } else {
        // Simple attribute not found
        message = `Attribute '^${attr.name}' not found in project datamap`;
      }

      // Get precise range for the attribute
      const preciseRange = this.findAttributeRange(attr, documentText);

      return {
        production: production.name,
        attribute: attr.name,
        attributePath: `^${attr.name}`,
        line: preciseRange.start.line,
        column: preciseRange.start.character,
        range: preciseRange,
        message,
        severity: 'error',
      };
    }

    // Context-aware check: the attribute exists somewhere in the datamap, but if
    // its parent variable is bound to a specific, narrowed set of vertices (e.g.
    // a single named operator), the attribute must exist on at least one of those
    // bound vertices. This catches augmenting an operator with an attribute that
    // belongs to a *different* operator. Skip <s> (root/substate handling, plus
    // ^superstate paths, are covered by the global check above).
    const contextError = this.validateAttributeInContext(
      attr,
      production,
      projectContext,
      variableBindings,
      variableNameConstraints,
      documentText
    );
    if (contextError) {
      return contextError;
    }

    // If attribute has a value, check if it's valid for enumeration types
    if (attr.value && !attr.value.startsWith('<')) {
      // Skip if value is a variable (starts with '<')
      const enumError = this.validateEnumerationValue(
        attr,
        production,
        projectContext,
        variableBindings,
        documentText
      );
      if (enumError) {
        return enumError;
      }
    }

    // Attribute exists somewhere in datamap - assume it's valid
    return null;
  }

  /**
   * Context-aware validation of an attribute against the specific datamap
   * vertices its parent variable is bound to.
   *
   * Only fires when:
   *  - the parent is a non-`s` variable (root/superstate special-casing makes
   *    `<s>` unsafe for a strict context check), and
   *  - that variable was narrowed by an explicit `^name <constant>` test (this
   *    is the operator-distinguishing case the check targets, and it keeps us
   *    from false-flagging variables bound through imprecise paths such as
   *    `^io.output-link.<cmd>` where the binding set is incomplete), and
   *  - that variable is bound to a non-empty set of vertices, and
   *  - the attribute does NOT exist on any of those bound vertices.
   */
  private validateAttributeInContext(
    attr: SoarAttribute,
    production: SoarProduction,
    projectContext: ProjectContext,
    variableBindings: Map<string, Set<string>>,
    variableNameConstraints: Map<string, Set<string>>,
    documentText?: string
  ): ValidationError | null {
    if (!attr.parentId || attr.parentId === 's') {
      return null;
    }

    // The `^name` constraint test itself is always valid here.
    if (attr.name === 'name') {
      return null;
    }

    const constraintNames = variableNameConstraints.get(attr.parentId);
    if (!constraintNames || constraintNames.size === 0) {
      return null;
    }

    const boundSet = variableBindings.get(attr.parentId);
    if (!boundSet || boundSet.size === 0) {
      return null;
    }

    const boundVertices = Array.from(boundSet);
    if (this.attributeExistsFromVertices(boundVertices, attr.name, projectContext)) {
      return null;
    }

    const pathSegments = attr.name.split('.');
    const lastSegment = pathSegments[pathSegments.length - 1];

    const contextDescription = Array.from(constraintNames)
      .map(name => `'${name}'`)
      .join(', ');

    const preciseRange = this.findAttributeRange(attr, documentText);

    return {
      production: production.name,
      attribute: attr.name,
      attributePath: `^${attr.name}`,
      line: preciseRange.start.line,
      column: preciseRange.start.character,
      range: preciseRange,
      message: `'${lastSegment}' is not a valid attribute for ${contextDescription} in the datamap`,
      severity: 'error',
    };
  }

  /**
   * Check whether an attribute path exists starting from a specific set of
   * vertices (rather than searching the whole datamap). Mirrors the dotted-path
   * and trailing-dot semantics of {@link attributeExistsInDatamap}, but anchors
   * the first segment to the provided vertices.
   */
  private attributeExistsFromVertices(
    vertexIds: string[],
    attributeName: string,
    projectContext: ProjectContext
  ): boolean {
    const trailingDot = attributeName.endsWith('.');
    const normalizedName = trailingDot ? attributeName.slice(0, -1) : attributeName;
    const pathSegments = normalizedName.split('.');
    const firstSegment = pathSegments[0];
    const remainingSegments = pathSegments.slice(1);

    for (const vertexId of vertexIds) {
      const vertex = projectContext.datamapIndex.get(vertexId);
      if (!vertex || vertex.type !== 'SOAR_ID' || !vertex.outEdges) {
        continue;
      }

      for (const edge of vertex.outEdges) {
        if (edge.name !== firstSegment) {
          continue;
        }

        if (remainingSegments.length === 0) {
          if (!trailingDot) {
            return true;
          }
          const target = projectContext.datamapIndex.get(edge.toId);
          if (target?.type === 'SOAR_ID') {
            return true;
          }
        } else {
          const ok = trailingDot
            ? this.pathResolvesToSoarId(edge.toId, remainingSegments, projectContext)
            : this.canNavigatePath(edge.toId, remainingSegments, projectContext);
          if (ok) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Check if an attribute exists anywhere in the datamap
   * Handles both simple attributes and dotted paths (e.g., "inplace-object.name", "above.type")
   *
   * For dotted paths (parent.child):
   * - Find all vertices that have an attribute named "parent"
   * - Check if the target vertex of "parent" has an attribute named "child"
   *
   * Special handling for ^superstate paths:
   * In the top state, ^superstate points to an ENUMERATION ("nil"), but in substates,
   * ^superstate points to the parent state (a SOAR_ID with the same structure as the root).
   * Generic substate elaborations like "^superstate.operator.name" are valid even though
   * they don't apply to the top state. We validate such paths against the root state structure.
   */
  private attributeExistsInDatamap(attributeName: string, projectContext: ProjectContext): boolean {
    // A trailing dot means the final segment is a Soar variable (e.g. ^io.output-link.<cmd>).
    // We only need to verify the prefix path resolves to a SOAR_ID.
    const trailingDot = attributeName.endsWith('.');
    const normalizedName = trailingDot ? attributeName.slice(0, -1) : attributeName;
    const pathSegments = normalizedName.split('.');

    if (pathSegments.length === 1) {
      for (const vertex of projectContext.project.datamap.vertices) {
        if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
          for (const edge of vertex.outEdges) {
            if (edge.name === normalizedName) {
              if (!trailingDot) {
                return true;
              }
              // For trailing dot, the target must be a SOAR_ID
              const target = projectContext.datamapIndex.get(edge.toId);
              if (target?.type === 'SOAR_ID') {
                return true;
              }
            }
          }
        }
      }
      return false;
    }

    const firstSegment = pathSegments[0];
    const remainingSegments = pathSegments.slice(1);

    if (firstSegment === 'superstate') {
      const rootId = projectContext.project.datamap.rootId;
      const check = trailingDot
        ? this.pathResolvesToSoarId(rootId, remainingSegments, projectContext)
        : this.canNavigatePath(rootId, remainingSegments, projectContext);
      if (check) {
        return true;
      }
    }

    for (const vertex of projectContext.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          if (edge.name === firstSegment) {
            const check = trailingDot
              ? this.pathResolvesToSoarId(edge.toId, remainingSegments, projectContext)
              : this.canNavigatePath(edge.toId, remainingSegments, projectContext);
            if (check) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  /** Check if a path resolves to a SOAR_ID (i.e. can have any child attributes). */
  private pathResolvesToSoarId(
    startVertexId: string,
    pathSegments: string[],
    projectContext: ProjectContext
  ): boolean {
    if (pathSegments.length === 0) {
      const v = projectContext.datamapIndex.get(startVertexId);
      return v?.type === 'SOAR_ID';
    }
    const vertex = projectContext.datamapIndex.get(startVertexId);
    if (!vertex || vertex.type !== 'SOAR_ID') {
      return false;
    }
    const first = pathSegments[0];
    const remaining = pathSegments.slice(1);
    const matchingEdges = vertex.outEdges?.filter(e => e.name === first) || [];
    for (const edge of matchingEdges) {
      if (this.pathResolvesToSoarId(edge.toId, remaining, projectContext)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Find the first invalid segment in a dotted attribute path
   * Returns the invalid segment and the last valid parent attribute
   */
  private findFirstInvalidSegment(
    attributeName: string,
    projectContext: ProjectContext
  ): { invalidSegment?: string; lastValidParent?: string } {
    // Trailing dot means variable final segment — validate only the prefix path.
    const trailingDot = attributeName.endsWith('.');
    const normalizedName = trailingDot ? attributeName.slice(0, -1) : attributeName;
    const pathSegments = normalizedName.split('.');

    if (pathSegments.length === 1) {
      return { invalidSegment: normalizedName };
    }

    const firstSegment = pathSegments[0];

    if (firstSegment === 'superstate') {
      const rootId = projectContext.project.datamap.rootId;
      const result = this.findInvalidSegmentInPath(
        rootId,
        pathSegments.slice(1),
        projectContext,
        'superstate'
      );
      if (result) {
        return result;
      }
    }

    for (const vertex of projectContext.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          if (edge.name === firstSegment) {
            const result = this.findInvalidSegmentInPath(
              edge.toId,
              pathSegments.slice(1),
              projectContext,
              firstSegment
            );
            if (result) {
              return result;
            }
          }
        }
      }
    }

    return { invalidSegment: firstSegment };
  }

  /**
   * Helper: Navigate a path and find where it becomes invalid
   */
  private findInvalidSegmentInPath(
    startVertexId: string,
    pathSegments: string[],
    projectContext: ProjectContext,
    lastValidParent: string
  ): { invalidSegment: string; lastValidParent: string } | null {
    if (pathSegments.length === 0) {
      return null; // Path is valid
    }

    const vertex = projectContext.datamapIndex.get(startVertexId);
    if (!vertex || vertex.type !== 'SOAR_ID') {
      // The parent exists but isn't a SOAR_ID, so the next segment is invalid
      return {
        invalidSegment: pathSegments[0],
        lastValidParent,
      };
    }

    const firstSegment = pathSegments[0];
    const remainingSegments = pathSegments.slice(1);

    // Find edge with the name of the first segment
    const matchingEdges = vertex.outEdges?.filter(e => e.name === firstSegment) || [];

    if (matchingEdges.length === 0) {
      // This segment doesn't exist on the current vertex
      return {
        invalidSegment: firstSegment,
        lastValidParent,
      };
    }

    // Try to navigate deeper from each matching edge
    for (const edge of matchingEdges) {
      if (remainingSegments.length > 0) {
        const result = this.findInvalidSegmentInPath(
          edge.toId,
          remainingSegments,
          projectContext,
          firstSegment
        );
        if (result) {
          return result;
        }
      } else {
        // Successfully navigated the entire path
        return null;
      }
    }

    return null;
  }

  /**
   * Helper: Check if a path can be navigated from a starting vertex
   * Handles cases where an attribute has multiple possible target vertices
   * (e.g., holding can point to both "nothing" enum and a block object)
   */
  private canNavigatePath(
    startVertexId: string,
    pathSegments: string[],
    projectContext: ProjectContext
  ): boolean {
    if (pathSegments.length === 0) {
      return true;
    }

    const vertex = projectContext.datamapIndex.get(startVertexId);
    if (!vertex || vertex.type !== 'SOAR_ID') {
      return false;
    }

    const firstSegment = pathSegments[0];
    const remainingSegments = pathSegments.slice(1);

    // Find ALL edges with the name of the first segment
    // Try to navigate the remaining path from each target
    const matchingEdges = vertex.outEdges?.filter(e => e.name === firstSegment) || [];

    for (const edge of matchingEdges) {
      // If there are more segments, recursively check if we can navigate from the target
      if (remainingSegments.length > 0) {
        if (this.canNavigatePath(edge.toId, remainingSegments, projectContext)) {
          return true;
        }
      } else {
        // No more segments - we successfully navigated the path
        return true;
      }
    }

    return false;
  }

  /**
   * Validate enumeration values using variable bindings for context
   * Only checks enumerations that the attribute actually points to based on variable bindings
   */
  private validateEnumerationValue(
    attr: SoarAttribute,
    production: SoarProduction,
    projectContext: ProjectContext,
    variableBindings: Map<string, Set<string>>,
    documentText?: string
  ): ValidationError | null {
    if (!attr.value) {
      return null;
    }

    // Skip validation for '-' which is used for WME removal on RHS
    if (attr.value === '-') {
      return null;
    }

    const attrValue = attr.value;
    const pathSegments = attr.name.split('.');
    const lastSegment = pathSegments[pathSegments.length - 1];

    const dmMeta = (projectContext as any).datamapMetadata as DatamapMetadataCache | undefined;

    // Try to find the specific vertices this attribute refers to based on variable bindings
    let enumerations: Array<{ vertexId: string; choices: string[] }> = [];

    if (attr.parentId && variableBindings.has(attr.parentId)) {
      // We know which vertices the parent variable is bound to - use specific context
      const parentVertices = Array.from(variableBindings.get(attr.parentId)!);
      const targetVertices =
        (dmMeta &&
          dmMeta.findTargetVerticesForPath(parentVertices, pathSegments, projectContext.project)) ||
        this.findTargetVerticesForPath(parentVertices, pathSegments, projectContext);

      // Check if any target vertices are enumerations
      for (const vertexId of targetVertices) {
        const vertex = projectContext.datamapIndex.get(vertexId);
        if (vertex && vertex.type === 'ENUMERATION') {
          enumerations.push({
            vertexId: vertexId,
            choices: vertex.choices,
          });
        }
      }
    } else {
      // No binding information - fall back to global search (for RHS or unbound variables)
      enumerations = dmMeta
        ? dmMeta.findAllEnumerationsForAttribute(pathSegments, projectContext.project)
        : this.findAllEnumerationsForAttribute(pathSegments, projectContext);
    }

    // If no enumerations found, the attribute doesn't point to an enum - no error
    if (enumerations.length === 0) {
      return null;
    }

    // Check if value is valid in any of the enumerations
    const isValid = enumerations.some(enumInfo => enumInfo.choices.includes(attrValue));

    if (isValid) {
      return null;
    }

    // Collect all valid choices
    const allValidChoices = new Set<string>();
    for (const enumInfo of enumerations) {
      enumInfo.choices.forEach(choice => allValidChoices.add(choice));
    }

    const validChoices = Array.from(allValidChoices).sort().join(', ');

    // Get precise range for the attribute
    const preciseRange = this.findAttributeRange(attr, documentText);

    return {
      production: production.name,
      attribute: attr.name,
      attributePath: `^${attr.name}`,
      line: preciseRange.start.line,
      column: preciseRange.start.character,
      range: preciseRange,
      message: `Invalid enumeration value '${attrValue}' for attribute '^${lastSegment}'. Valid choices: ${validChoices}`,
      severity: 'error',
    };
  }

  /**
   * Find all enumerations for an attribute path anywhere in the datamap
   * This is a simplified approach that searches globally
   */
  private findAllEnumerationsForAttribute(
    pathSegments: string[],
    projectContext: ProjectContext
  ): Array<{ vertexId: string; choices: string[] }> {
    const enumerations: Array<{ vertexId: string; choices: string[] }> = [];
    const seenVertexIds = new Set<string>();

    // Search all vertices in the datamap
    for (const vertex of projectContext.project.datamap.vertices) {
      if (vertex.type !== 'SOAR_ID' || !vertex.outEdges) {
        continue;
      }

      // Try to navigate the path from this vertex
      const reachableEnums = this.navigatePathFromVertex(vertex.id, pathSegments, projectContext);

      for (const enumInfo of reachableEnums) {
        if (!seenVertexIds.has(enumInfo.vertexId)) {
          seenVertexIds.add(enumInfo.vertexId);
          enumerations.push(enumInfo);
        }
      }
    }

    return enumerations;
  }

  /**
   * Navigate a path from a vertex and return any enumerations found
   */
  private navigatePathFromVertex(
    vertexId: string,
    pathSegments: string[],
    projectContext: ProjectContext
  ): Array<{ vertexId: string; choices: string[] }> {
    if (pathSegments.length === 0) {
      return [];
    }

    const vertex = projectContext.datamapIndex.get(vertexId);
    if (!vertex || vertex.type !== 'SOAR_ID') {
      return [];
    }

    const firstSegment = pathSegments[0];
    const remainingSegments = pathSegments.slice(1);
    const enumerations: Array<{ vertexId: string; choices: string[] }> = [];

    // Find all edges matching the first segment
    const matchingEdges = vertex.outEdges?.filter(e => e.name === firstSegment) || [];

    for (const edge of matchingEdges) {
      if (remainingSegments.length === 0) {
        // End of path - check if target is an enumeration
        const targetVertex = projectContext.datamapIndex.get(edge.toId);
        if (targetVertex && targetVertex.type === 'ENUMERATION') {
          enumerations.push({
            vertexId: edge.toId,
            choices: targetVertex.choices,
          });
        }
      } else {
        // Continue navigating
        const found = this.navigatePathFromVertex(edge.toId, remainingSegments, projectContext);
        enumerations.push(...found);
      }
    }

    return enumerations;
  }

  /**
   * Find target vertices reachable via an attribute path from starting vertices
   * Used to build variable bindings (e.g., (<s> ^operator <o>) binds <o> to operator vertices)
   */
  private findTargetVerticesForPath(
    startVertexIds: string[],
    pathSegments: string[],
    projectContext: ProjectContext
  ): string[] {
    if (pathSegments.length === 0) {
      return startVertexIds;
    }

    const targetVertices = new Set<string>();

    for (const startVertexId of startVertexIds) {
      const vertex = projectContext.datamapIndex.get(startVertexId);
      if (!vertex || vertex.type !== 'SOAR_ID') {
        continue;
      }

      const firstSegment = pathSegments[0];
      const remainingSegments = pathSegments.slice(1);

      // Find ALL edges with this attribute name (can have multiple, e.g., ^operator -> multiple operator types)
      const matchingEdges = vertex.outEdges?.filter(e => e.name === firstSegment) || [];
      for (const matchingEdge of matchingEdges) {
        if (remainingSegments.length > 0) {
          // Recursively navigate remaining path
          const results = this.findTargetVerticesForPath(
            [matchingEdge.toId],
            remainingSegments,
            projectContext
          );
          results.forEach(v => targetVertices.add(v));
        } else {
          // End of path - this is a target vertex
          targetVertices.add(matchingEdge.toId);
        }
      }
    }

    return Array.from(targetVertices);
  }

  /**
   * Validate attribute path (e.g., "io.input-link.data")
   */
  validateAttributePath(
    path: string[],
    projectContext: ProjectContext,
    startVertexId?: string
  ): { valid: boolean; invalidSegment?: string; message?: string } {
    let currentVertexId = startVertexId || projectContext.project.datamap.rootId;

    for (let i = 0; i < path.length; i++) {
      const segment = path[i];
      const vertex = projectContext.datamapIndex.get(currentVertexId);

      if (!vertex) {
        return {
          valid: false,
          invalidSegment: segment,
          message: `Vertex '${currentVertexId}' not found in datamap`,
        };
      }

      if (vertex.type !== 'SOAR_ID') {
        return {
          valid: false,
          invalidSegment: segment,
          message: `Vertex '${currentVertexId}' is not a SOAR_ID (cannot have attributes)`,
        };
      }

      // Find the edge with this attribute name
      const edge = vertex.outEdges?.find(e => e.name === segment);
      if (!edge) {
        return {
          valid: false,
          invalidSegment: segment,
          message: `Attribute '^${segment}' not found on vertex '${currentVertexId}'`,
        };
      }

      currentVertexId = edge.toId;
    }

    return { valid: true };
  }

  /**
   * Get suggestions for a misspelled attribute
   */
  getSuggestionsForAttribute(
    attributeName: string,
    projectContext: ProjectContext,
    maxSuggestions: number = 3
  ): string[] {
    const allAttributes = new Set<string>();

    // Collect all attribute names from datamap
    for (const vertex of projectContext.project.datamap.vertices) {
      if (vertex.type === 'SOAR_ID' && vertex.outEdges) {
        for (const edge of vertex.outEdges) {
          allAttributes.add(edge.name);
        }
      }
    }

    // Calculate Levenshtein distance and find closest matches
    const suggestions = Array.from(allAttributes)
      .map(name => ({
        name,
        distance: this.levenshteinDistance(attributeName, name),
      }))
      .filter(item => item.distance <= 3) // Only suggest if reasonably close
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxSuggestions)
      .map(item => item.name);

    return suggestions;
  }

  /**
   * Find the precise range for an attribute name in the document
   * Searches for ^attributeName in the line to get exact position
   */
  private findAttributeRange(
    attr: SoarAttribute,
    documentText?: string
  ): { start: { line: number; character: number }; end: { line: number; character: number } } {
    const line = attr.range.start.line;
    const attributeText = `^${attr.name}`;

    // If we have document text, search for the exact position
    if (documentText) {
      const lines = documentText.split('\n');
      if (line < lines.length) {
        const lineText = lines[line];
        const attrIndex = lineText.indexOf(attributeText);
        if (attrIndex !== -1) {
          return {
            start: { line: line, character: attrIndex },
            end: { line: line, character: attrIndex + attributeText.length },
          };
        }
      }
    }

    // Fallback to original range if we can't find it
    return attr.range;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1)
      .fill(0)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) {
      dp[i][0] = i;
    }
    for (let j = 0; j <= n; j++) {
      dp[0][j] = j;
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1, // deletion
            dp[i][j - 1] + 1, // insertion
            dp[i - 1][j - 1] + 1 // substitution
          );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Generate a diagnostic collection for VS Code
   */
  createDiagnostics(errors: ValidationError[], document: vscode.TextDocument): vscode.Diagnostic[] {
    if (!vscodeApi) {
      return [];
    }

    return errors.map(error => {
      // Use the range from the parser which has the correct line/column positions
      const range = new vscodeApi.Range(
        error.range.start.line,
        error.range.start.character,
        error.range.end.line,
        error.range.end.character
      );

      const severity =
        error.severity === 'error'
          ? vscodeApi.DiagnosticSeverity.Error
          : error.severity === 'warning'
            ? vscodeApi.DiagnosticSeverity.Warning
            : vscodeApi.DiagnosticSeverity.Information;

      const diagnostic = new vscodeApi.Diagnostic(range, error.message, severity);

      diagnostic.source = 'soar-datamap';
      return diagnostic;
    });
  }
}

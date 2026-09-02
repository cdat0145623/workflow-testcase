"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";

import { nodeRegistry, type NodeType } from "../model/node-registry";
import type { GraphProblem, WorkflowEdge, WorkflowGraph, WorkflowNode } from "../model/types";
import { validateGraph } from "../model/validate-graph";

export interface WorkflowEditorContextValue {
  graph: WorkflowGraph;
  selectedNodeId: string | null;
  problems: GraphProblem[];
  isDirty: boolean;
  isSaving: boolean;
  saveError: string | null;
  restoredFromVersion: number | null;
  addNode(type: NodeType, position: { x: number; y: number }): string | undefined;
  selectNode(nodeId: string | null): void;
  updateNodeValues(nodeId: string, values: Record<string, string>): void;
  connect(source: string, target: string): void;
  onNodesChange(changes: NodeChange<WorkflowNode>[]): void;
  onEdgesChange(changes: EdgeChange<WorkflowEdge>[]): void;
  onConnect(connection: Connection): void;
  deleteElements(nodeIds: string[], edgeIds: string[]): void;
  getGraph(): WorkflowGraph;
  applyApprovedGraph(graph: WorkflowGraph): void;
  restoreVersionGraph(graph: WorkflowGraph, versionNumber: number): void;
  save(): Promise<boolean>;
}

const WorkflowEditorContext = createContext<WorkflowEditorContextValue | null>(null);

interface WorkflowEditorProviderProps extends PropsWithChildren {
  initialGraph: WorkflowGraph;
  onSave(graph: WorkflowGraph): Promise<void>;
}

function newId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
}

export function WorkflowEditorProvider({ children, initialGraph, onSave }: WorkflowEditorProviderProps) {
  const [graph, setGraph] = useState<WorkflowGraph>(initialGraph);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [restoredFromVersion, setRestoredFromVersion] = useState<number | null>(null);

  const updateGraph = useCallback((updater: (current: WorkflowGraph) => WorkflowGraph) => {
    setGraph((current) => updater(current));
    setIsDirty(true);
    setSaveError(null);
    setRestoredFromVersion(null);
  }, []);

  const addNode = useCallback(
    (type: NodeType, position: { x: number; y: number }) => {
      const definition = nodeRegistry[type];
      if (definition.kind === "trigger" && graph.nodes.some((node) => node.data.kind === "trigger")) {
        return undefined;
      }

      const count = graph.nodes.filter((node) => node.data.type === type).length;
      const id = newId(type);
      updateGraph((current) => ({
        ...current,
        nodes: [
          ...current.nodes,
          {
            id,
            type: "step",
            position,
            data: {
              type,
              kind: definition.kind,
              title: `${definition.label} ${count + 1}`,
              values: {},
            },
          },
        ],
      }));
      setSelectedNodeId(id);
      return id;
    },
    [graph.nodes, updateGraph],
  );

  const updateNodeValues = useCallback(
    (nodeId: string, values: Record<string, string>) => {
      updateGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, values: { ...node.data.values, ...values } } }
            : node,
        ),
      }));
    },
    [updateGraph],
  );

  const connect = useCallback(
    (source: string, target: string) => {
      updateGraph((current) => ({
        ...current,
        edges: addEdge(
          { id: newId("edge"), source, target, type: "smoothstep" },
          current.edges,
        ) as WorkflowEdge[],
      }));
    },
    [updateGraph],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<WorkflowNode>[]) => {
      updateGraph((current) => ({
        ...current,
        nodes: applyNodeChanges(changes, current.nodes),
      }));
    },
    [updateGraph],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<WorkflowEdge>[]) => {
      updateGraph((current) => ({
        ...current,
        edges: applyEdgeChanges(changes, current.edges),
      }));
    },
    [updateGraph],
  );

  const deleteElements = useCallback(
    (nodeIds: string[], edgeIds: string[]) => {
      const removedNodes = new Set(nodeIds);
      const removedEdges = new Set(edgeIds);
      updateGraph((current) => ({
        nodes: current.nodes.filter((node) => !removedNodes.has(node.id)),
        edges: current.edges.filter(
          (edge) =>
            !removedEdges.has(edge.id) &&
            !removedNodes.has(edge.source) &&
            !removedNodes.has(edge.target),
        ),
      }));
      if (selectedNodeId && removedNodes.has(selectedNodeId)) setSelectedNodeId(null);
    },
    [selectedNodeId, updateGraph],
  );

  const problems = useMemo(() => validateGraph(graph), [graph]);
  const getGraph = useCallback(() => graph, [graph]);
  const applyApprovedGraph = useCallback((approvedGraph: WorkflowGraph) => {
    setGraph(approvedGraph);
    setSelectedNodeId(null);
    setIsDirty(false);
    setSaveError(null);
    setRestoredFromVersion(null);
  }, []);
  const restoreVersionGraph = useCallback((restoredGraph: WorkflowGraph, versionNumber: number) => {
    if (validateGraph(restoredGraph).length > 0) return;
    setGraph(restoredGraph);
    setSelectedNodeId(null);
    setIsDirty(true);
    setSaveError(null);
    setRestoredFromVersion(versionNumber);
  }, []);
  const save = useCallback(async () => {
    if (validateGraph(graph).length > 0) return false;
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(graph);
      setIsDirty(false);
      setRestoredFromVersion(null);
      return true;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save workflow");
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [graph, onSave]);

  const value = useMemo<WorkflowEditorContextValue>(
    () => ({
      graph,
      selectedNodeId,
      problems,
      isDirty,
      isSaving,
      saveError,
      restoredFromVersion,
      addNode,
      selectNode: setSelectedNodeId,
      updateNodeValues,
      connect,
      onNodesChange,
      onEdgesChange,
      onConnect: ({ source, target }) => {
        if (source && target) connect(source, target);
      },
      deleteElements,
      getGraph,
      applyApprovedGraph,
      restoreVersionGraph,
      save,
    }),
    [
      addNode,
      applyApprovedGraph,
      restoreVersionGraph,
      connect,
      deleteElements,
      getGraph,
      graph,
      isDirty,
      isSaving,
      onEdgesChange,
      onNodesChange,
      problems,
      save,
      saveError,
      restoredFromVersion,
      selectedNodeId,
      updateNodeValues,
    ],
  );

  return <WorkflowEditorContext.Provider value={value}>{children}</WorkflowEditorContext.Provider>;
}

export function useWorkflowEditor(): WorkflowEditorContextValue {
  const value = useContext(WorkflowEditorContext);
  if (!value) throw new Error("useWorkflowEditor must be used inside WorkflowEditorProvider");
  return value;
}

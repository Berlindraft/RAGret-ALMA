import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  Background,
  Controls,
  Panel,
  MarkerType,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import { kindIcons, relationLabels } from "./graphTypes";
import { Status } from "./Status";
function TraceNode({ data, selected }) {
  const Icon = kindIcons[data.kind] || kindIcons.topic;
  return (
    <div
      className={`trace-node node-${data.kind} ${selected ? "is-selected" : ""}`}
    >
      <Handle
        id="in-left"
        type="target"
        position={Position.Left}
        isConnectable={false}
      />
      <Handle
        type="source"
        id="out-left"
        position={Position.Left}
        isConnectable={false}
      />
      <Handle
        type="target"
        id="in-right"
        position={Position.Right}
        isConnectable={false}
      />
      <div className="node-meta">
        <span className="node-icon">
          <Icon size={13} />
        </span>
        <span>
          {data.kind === "source"
            ? "Source"
            : data.kind === "action"
              ? "Action"
              : data.kind}
        </span>
        {data.props.scope && <small>{data.props.scope}</small>}
      </div>
      <strong>{data.label}</strong>
      <div className="node-foot">
        {data.kind === "decision" ? (
          <>
            <Status state={data.props.state} />
            <span>
              {data.props.observations.length}{" "}
              {data.props.observations.length === 1 ? "receipt" : "receipts"}
            </span>
          </>
        ) : data.kind === "source" ? (
          <span>{data.props.filename}</span>
        ) : (
          <span>
            {data.connections} linked{" "}
            {data.connections === 1 ? "decision" : "decisions"}
          </span>
        )}
      </div>
      <Handle
        id="out-right"
        type="source"
        position={Position.Right}
        isConnectable={false}
      />
    </div>
  );
}
const nodeTypes = { trace: TraceNode };

function layout(graph, root, scope, showContext, cluster) {
  const lookup = new Map(graph.nodes.map((n) => [n.id, n]));
  let ids = new Set(graph.nodes.map((n) => n.id));
  if (scope === "focus" && root) {
    ids = new Set([root]);
    for (const e of graph.edges)
      if (e.source === root || e.target === root) {
        ids.add(e.source);
        ids.add(e.target);
      }
  } else if (cluster) {
    const decisions = new Set(
      graph.edges
        .filter((e) => e.target === cluster && e.kind === "in_cluster")
        .map((e) => e.source),
    );
    ids = new Set(decisions);
    for (const e of graph.edges)
      if (decisions.has(e.source) || decisions.has(e.target)) {
        ids.add(e.source);
        ids.add(e.target);
      }
  }
  const visible = graph.nodes.filter(
    (n) =>
      ids.has(n.id) &&
      (showContext
        ? scope === "all" || !["topic", "fact", "cluster"].includes(n.kind)
        : ["source", "decision"].includes(n.kind)),
  );
  const columns = [
    visible.filter((n) => n.kind === "source"),
    visible.filter((n) =>
      scope === "focus" ? n.id === root : n.kind === "decision",
    ),
    visible.filter((n) =>
      scope === "focus"
        ? n.kind !== "source" && n.id !== root
        : !["source", "decision"].includes(n.kind),
    ),
  ];
  columns[1].sort((a, b) =>
    a.id === root ? -1 : b.id === root ? 1 : a.label.localeCompare(b.label),
  );
  columns[2].sort(
    (a, b) =>
      ["person", "constraint", "action", "cluster", "topic", "fact"].indexOf(
        a.kind,
      ) -
      ["person", "constraint", "action", "cluster", "topic", "fact"].indexOf(
        b.kind,
      ),
  );
  const height = Math.max(...columns.map((c) => c.length), 1) * 124;
  const nodes = columns.flatMap((col, x) =>
    col.map((n, i) => ({
      id: n.id,
      type: "trace",
      position: { x: x * 310, y: (height - col.length * 124) / 2 + i * 124 },
      data: {
        ...n,
        connections: graph.edges.filter(
          (e) =>
            (e.source === n.id && lookup.get(e.target)?.kind === "decision") ||
            (e.target === n.id && lookup.get(e.source)?.kind === "decision"),
        ).length,
      },
      ariaLabel: `${n.kind}: ${n.label}${n.props.scope ? " " + n.props.scope : ""}`,
    })),
  );
  const included = new Set(nodes.map((n) => n.id));
  const edges = graph.edges
    .filter(
      (e) =>
        included.has(e.source) &&
        included.has(e.target) &&
        (scope === "all" || e.source === root || e.target === root),
    )
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle:
        nodes.find((n) => n.id === e.source).position.x >
        nodes.find((n) => n.id === e.target).position.x
          ? "out-left"
          : "out-right",
      targetHandle:
        nodes.find((n) => n.id === e.source).position.x >
        nodes.find((n) => n.id === e.target).position.x
          ? "in-right"
          : "in-left",
      label: relationLabels[e.kind] || e.kind,
      type: "default",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 13,
        height: 13,
        color: e.kind === "depends_on" ? "#7785b9" : "#bbc4d2",
      },
      style: {
        stroke: e.kind === "depends_on" ? "#929cc2" : "#c4cbd6",
        strokeWidth: e.kind === "depends_on" ? 1.5 : 1,
      },
      labelStyle: { fill: "#8a94a5", fontSize: 9 },
      labelBgStyle: { fill: "#fafbfc", fillOpacity: 0.94 },
      labelBgPadding: [4, 3],
      data: e,
      selectable: true,
    }));
  return { nodes, edges };
}
function Canvas({
  graph,
  root,
  selected,
  scope,
  showContext,
  cluster,
  onSelect,
  onReceipt,
}) {
  const model = useMemo(
    () => layout(graph, root, scope, showContext, cluster),
    [graph, root, scope, showContext, cluster],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(model.nodes);
  const { fitView } = useReactFlow();
  const fitCanvas = useCallback(
    () =>
      fitView(
        window.innerWidth < 760 && scope === "focus" && root
          ? {
              nodes: [{ id: root }],
              minZoom: 0.75,
              maxZoom: 0.8,
              duration: 0,
              padding: 0.3,
            }
          : { padding: 0.14, duration: 0, maxZoom: 1 },
      ),
    [fitView, root, scope],
  );
  const containerRef = useRef(null);
  useEffect(() => {
    let timer;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(fitCanvas, 100);
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [fitCanvas]);
  useEffect(() => {
    setNodes(model.nodes);
    const timer = setTimeout(fitCanvas, 80);
    return () => clearTimeout(timer);
  }, [model, setNodes, fitCanvas]);
  useEffect(
    () =>
      setNodes((current) =>
        current.map((n) => ({ ...n, selected: n.id === selected })),
      ),
    [selected, setNodes, model],
  );
  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={model.edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, n) => onSelect(n.id)}
        onEdgeClick={(_, e) =>
          e.data.receipts[0] &&
          onReceipt(e.data.receipts[0], relationLabels[e.data.kind])
        }
        nodesConnectable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
        minZoom={0.15}
        maxZoom={1.6}
        fitView
        fitViewOptions={{ padding: 0.17, maxZoom: 1 }}
      >
        <Background color="#dbe0e8" gap={18} size={1} />
        <Controls showInteractive={false} />
        <Panel position="bottom-right" className="canvas-hint">
          Drag to explore · select a link for evidence
        </Panel>
      </ReactFlow>
    </div>
  );
}
export default function ContextGraph(props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

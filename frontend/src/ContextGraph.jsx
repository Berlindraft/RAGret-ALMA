import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, RotateCcw } from "lucide-react";
import { useReducedMotion } from "motion/react";
import {
  ReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  Background,
  Controls,
  Panel,
  MarkerType,
  MiniMap,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import { kindIcons, relationLabels } from "./graphTypes";
import { graphTypes, nodeType, sourceContext, conversationMessage } from "./graphContext";
import GraphPreview from "./GraphPreview";
import "./graph-context.css";
import { Status } from "./Status";
function TraceNode({ data, selected }) {
  const type = graphTypes[nodeType(data)] || graphTypes.topic;
  const Icon = type.icon || kindIcons.topic;
  const context = data.context;
  const message = context && conversationMessage(context.receipt.quote);
  return (
    <div
      className={`trace-node typed-graph-node node-${data.kind} type-${nodeType(data)} ${data.kind === "source" ? "context-source-node" : ""} ${selected ? "is-selected" : ""} ${data.muted ? "is-muted" : ""} ${data.connected ? "is-connected" : ""}`}
      style={{ "--node-color": type.color, "--node-tint": type.tint }}
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
          {type.label}
        </span>
        {data.props.scope && <small>{data.props.scope}</small>}
      </div>
      <strong>{data.label}</strong>
      {data.kind === "decision" && <p className="node-summary">{data.props.summary}</p>}
      {data.kind === "source" && context && <div className="node-excerpt">
        <div className="source-card-meta">{data.props.source_type === "conversation" ? message.speaker || "Conversation excerpt" : `Cited page ${context.receipt.page} of ${data.props.pages}`}</div>
        <blockquote>{data.props.source_type === "conversation" ? message.body : context.receipt.quote}</blockquote>
        <button className="node-preview-button nodrag nopan" onClick={(event) => { event.stopPropagation(); data.onPreview(context, event); }}><Eye size={16} />{data.props.source_type === "conversation" ? "Preview conversation" : "Preview reference"}</button>
      </div>}
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
          <span>{data.props.pages} page{data.props.pages === 1 ? "" : "s"}{data.props.synthetic ? " · Synthetic" : ""}</span>
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

function layout(graph, root, scope, showContext, cluster, hiddenTypes) {
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
  const available = graph.nodes.filter(
    (n) =>
      ids.has(n.id) &&
      (showContext
        ? scope === "all" || !["topic", "fact", "cluster"].includes(n.kind)
        : ["source", "decision"].includes(n.kind)),
  );
  const counts = {};
  available.forEach((node) => { const type = nodeType(node); counts[type] = (counts[type] || 0) + 1; });
  const visible = available.filter((node) => !hiddenTypes.includes(nodeType(node)));
  const columns = [
    { items: visible.filter((n) => n.kind === "source"), step: 420 },
    { items: visible.filter((n) => n.kind === "decision"), step: 260 },
    { items: visible.filter((n) => n.kind === "person"), step: 200 },
    { items: visible.filter((n) => !["source", "decision", "person"].includes(n.kind)), step: 240 },
  ].filter((column) => column.items.length);
  const decisions = columns.find((column) => column.items[0]?.kind === "decision");
  decisions?.items.sort((a, b) => a.id === root ? -1 : b.id === root ? 1 : a.label.localeCompare(b.label));
  const height = Math.max(...columns.map((column) => column.items.length * column.step), 1);
  const nodes = columns.flatMap((column, x) =>
    column.items.map((n, i) => ({
      id: n.id,
      type: "trace",
      position: { x: x * 330, y: (height - column.items.length * column.step) / 2 + i * column.step },
      data: {
        ...n,
        context: n.kind === "source" ? sourceContext(graph, n.id, root) : null,
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
    .map((e) => {
      const source = lookup.get(e.source);
      const isReference = e.kind === "supports" && nodeType(source) === "reference";
      const color = e.kind === "supports" ? graphTypes[isReference ? "reference" : "conversation"].color : e.kind === "depends_on" ? graphTypes.decision.color : graphTypes[nodeType(lookup.get(e.target))]?.color || "#8290a8";
      return {
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
      label: e.kind === "supports" ? isReference ? "reference for" : "documents" : relationLabels[e.kind] || e.kind,
      type: "default",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 13,
        height: 13,
        color,
      },
      style: {
        stroke: color,
        strokeWidth: e.kind === "depends_on" ? 2.5 : 1.8,
        strokeDasharray: isReference ? "7 5" : e.kind === "constrained_by" ? "3 5" : undefined,
      },
      labelStyle: { fill: color, fontSize: 13, fontWeight: 500 },
      labelBgStyle: { fill: "#fafbfc", fillOpacity: 0.94 },
      labelBgPadding: [4, 3],
      data: { ...e, isReference },
      selectable: true,
    }; });
  return { nodes, edges, counts };
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
  onOpenSource,
}) {
  const [hiddenTypes, setHiddenTypes] = useState([]);
  const [hovered, setHovered] = useState(null);
  const [preview, setPreview] = useState(null);
  const previewTrigger = useRef(null);
  const reduced = useReducedMotion();
  const model = useMemo(
    () => layout(graph, root, scope, showContext, cluster, hiddenTypes),
    [graph, root, scope, showContext, cluster, hiddenTypes],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(model.nodes);
  const { fitView } = useReactFlow();
  const fitCanvas = useCallback(
    () =>
      fitView(
        window.innerWidth < 760 && scope === "focus" && root
          ? {
              nodes: [{ id: root }],
              minZoom: 0.9,
              maxZoom: 1,
              duration: 0,
              padding: 0.3,
            }
          : { padding: 0.08, duration: 0, minZoom: scope === "focus" ? 0.75 : 0.15, maxZoom: 1 },
      ),
    [fitView, root, scope],
  );
  const containerRef = useRef(null);
  const openPreview = useCallback((context, event) => { previewTrigger.current = event.currentTarget; setPreview(context); }, []);
  const closePreview = useCallback(() => { setPreview(null); previewTrigger.current?.focus(); }, []);
  const active = hovered || preview?.source.document_id;
  const connected = useMemo(() => {
    const ids = new Set(active ? [active] : []);
    if (active) model.edges.forEach((edge) => { if (edge.source === active || edge.target === active) { ids.add(edge.source); ids.add(edge.target); } });
    return ids;
  }, [active, model.edges]);
  const shownNodes = useMemo(() => nodes.map((node) => ({ ...node, data: { ...node.data, onPreview: openPreview, muted: !!active && !connected.has(node.id), connected: !!active && connected.has(node.id) } })), [nodes, openPreview, active, connected]);
  const shownEdges = useMemo(() => model.edges.map((edge) => {
    const highlighted = !!active && (edge.source === active || edge.target === active);
    return { ...edge, animated: !reduced && edge.data.kind === "depends_on" && (highlighted || edge.source === selected || edge.target === selected),
      style: { ...edge.style, opacity: active && !highlighted ? 0.13 : 0.85, strokeWidth: highlighted ? 3 : edge.style.strokeWidth }, labelStyle: { ...edge.labelStyle, opacity: active && !highlighted ? 0.15 : 1 } };
  }), [model.edges, active, reduced, selected]);
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
    <div className="interactive-context-graph">
      <div className="graph-type-filters" aria-label="Filter graph by type">
        <span className="graph-filter-label">SHOW IN GRAPH</span>
        {Object.entries(graphTypes).filter(([type]) => model.counts[type]).map(([key, type]) => {
          const Icon = type.icon;
          return <button key={key} className="graph-type-chip" aria-pressed={!hiddenTypes.includes(key)} disabled={key === "decision"} title={key === "decision" ? "Decisions stay visible" : `Toggle ${type.plural.toLowerCase()}`} style={{ "--type-color": type.color, "--type-tint": type.tint }} onClick={() => { setPreview(null); setHovered(null); setHiddenTypes((types) => types.includes(key) ? types.filter((t) => t !== key) : [...types, key]); }}><Icon size={16} />{type.plural}<span>{model.counts[key]}</span></button>;
        })}
        {!!hiddenTypes.length && <button className="graph-types-reset" onClick={() => setHiddenTypes([])}><RotateCcw size={15} />Reset</button>}
      </div>
      <div ref={containerRef} className="graph-flow-surface">
      <ReactFlow
        nodes={shownNodes}
        edges={shownEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, n) => onSelect(n.id)}
        onNodeMouseEnter={(_, node) => setHovered(node.id)}
        onNodeMouseLeave={() => setHovered(null)}
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
        <MiniMap pannable zoomable nodeColor={(node) => graphTypes[nodeType(node.data)]?.color || "#8290a8"} nodeStrokeWidth={0} maskColor="#edf1f8b0" className="context-minimap" />
        {preview && <Panel position="bottom-left" className="graph-preview-position"><GraphPreview key={preview.receipt.chunk_id + preview.receipt.quote} context={preview} onClose={closePreview} onOpen={(source, page, quote) => { setPreview(null); onOpenSource(source, page, quote); }} /></Panel>}
        <Panel position="bottom-right" className="canvas-hint">
          Hover to trace · select a link for evidence
        </Panel>
      </ReactFlow>
      </div>
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

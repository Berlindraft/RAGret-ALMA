import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  CheckCheck,
  ChevronRight,
  Download,
  FileText,
  GitBranch,
  Link2,
  Loader2,
  ShieldCheck,
  X,
  CircleAlert,
} from "lucide-react";
import { api, download, formatDate } from "./api";
import { Status } from "./Status";
import { kindIcons, relationLabels } from "./graphTypes";

export default function Inspector({
  graph,
  node,
  onSelect,
  onReceipt,
  onClose,
}) {
  const [tab, setTab] = useState("details");
  const [impact, setImpact] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (tab === "impact" && node?.kind === "decision") {
      api("/workspace/decisions/" + node.id + "/impact")
        .then((value) => {
          if (active) setImpact(value);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }
    return () => {
      active = false;
    };
  }, [node?.id, node?.kind, tab]);
  const lookup = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n])),
    [graph.nodes],
  );
  if (!node)
    return (
      <aside className="inspector inspector-empty">
        <GitBranch size={28} />
        <h3>A little more context.</h3>
        <p>Select a decision or a connection to follow its evidence.</p>
      </aside>
    );
  const Icon = kindIcons[node.kind] || GitBranch;
  const connections = graph.edges.filter(
    (e) => e.source === node.id || e.target === node.id,
  );
  const neighbors = connections
    .map((e) => ({
      edge: e,
      node: lookup.get(e.source === node.id ? e.target : e.source),
    }))
    .filter((x) => x.node);
  const observations = node.props.observations || [];
  const receipts =
    node.kind === "decision"
      ? observations.map((o) => ({
          ...o.receipt,
          title: o.title,
          date: o.date,
          engine: o.engine,
        }))
      : connections.flatMap((e) => e.receipts);
  const uniqueReceipts = receipts.filter(
    (r, i, all) =>
      all.findIndex((x) => x.chunk_id === r.chunk_id && x.quote === r.quote) ===
      i,
  );
  const facets = neighbors.filter((x) => x.node.kind !== "source");
  const cluster = neighbors.find((x) => x.node.kind === "cluster");
  function exportTrace() {
    download(
      "RAGret-" + node.label.replaceAll(" ", "-") + ".md",
      `# ${node.label}${node.props.scope ? " · " + node.props.scope : ""}\n\nStatus: ${node.props.state || node.kind}\n${node.props.summary || ""}\n\n## Documented connections\n${neighbors.map((x) => `- ${relationLabels[x.edge.kind]}: ${x.node.label} ${x.node.props.scope || ""}`).join("\n")}\n\n## Receipts\n${uniqueReceipts.map((r) => `### ${r.filename} · p. ${r.page}\n${r.synthetic ? "Synthetic source\n" : ""}> ${r.quote}`).join("\n\n")}`,
      "text/markdown",
    );
  }
  return (
    <aside className="inspector" id="detail-panel">
      <div className="inspector-heading">
        <span>
          <Icon size={15} />
          {node.kind === "decision" ? "Decision trace" : node.kind}
        </span>
        <div>
          <button
            className="icon-button"
            title="Export trace"
            aria-label="Export selected trace"
            onClick={exportTrace}
          >
            <Download size={15} />
          </button>
          <button
            className="icon-button"
            aria-label="Close detail panel"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
      </div>
      <div className="inspector-title">
        <h2>{node.label}</h2>
        {node.props.scope && (
          <span className="scope-label">{node.props.scope}</span>
        )}
        {node.kind === "decision" && <Status state={node.props.state} />}
      </div>
      {node.kind === "decision" && (
        <div className="detail-tabs">
          {["details", "evidence", "impact"].map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => {
                setTab(t);
                if (t === "impact") {
                  setImpact(null);
                  setError("");
                }
              }}
            >
              {t === "details"
                ? "Overview"
                : t === "evidence"
                  ? `Evidence (${uniqueReceipts.length})`
                  : "Impact"}
            </button>
          ))}
        </div>
      )}
      <div className="inspector-body">
        {node.kind === "decision" && tab === "details" && (
          <>
            {node.props.conflict && (
              <div className="callout warning">
                <CircleAlert size={16} />
                <span>
                  Conflicting records. No explicit supersession resolves the
                  disagreement.
                </span>
              </div>
            )}
            <div className="detail-section">
              <h4>CURRENT DOCUMENTED POSITION</h4>
              <p>{node.props.summary}</p>
              <div className="detail-meta">
                <span>{cluster?.node.label || "Ungrouped"}</span>
                <span>{formatDate(node.props.last_date)}</span>
              </div>
            </div>
            {["person", "constraint", "action"].map((kind) => {
              const items = facets.filter((x) => x.node.kind === kind);
              const K = kindIcons[kind];
              return (
                items.length > 0 && (
                  <div className="detail-section" key={kind}>
                    <h4>
                      {kind === "person"
                        ? "PEOPLE INVOLVED"
                        : kind === "constraint"
                          ? "CONSTRAINTS"
                          : "DOCUMENTED ACTIONS"}
                    </h4>
                    {items.map(({ edge, node: n }) => (
                      <button
                        className="facet-link"
                        key={edge.id}
                        onClick={() => onSelect(n.id)}
                      >
                        <span className={`facet-icon ${kind}`}>
                          <K size={14} />
                        </span>
                        <span>
                          <strong>{n.label}</strong>
                          <small>{relationLabels[edge.kind]}</small>
                        </span>
                        <ChevronRight size={13} />
                      </button>
                    ))}
                  </div>
                )
              );
            })}
            {facets.some((x) => x.node.kind === "decision") && (
              <div className="detail-section">
                <h4>DECISION RELATIONSHIPS</h4>
                {facets
                  .filter((x) => x.node.kind === "decision")
                  .map(({ edge, node: n }) => (
                    <button
                      className="relation-link"
                      key={edge.id}
                      onClick={() => onSelect(n.id)}
                    >
                      <Link2 size={14} />
                      <span>
                        <small>
                          {edge.source === node.id
                            ? relationLabels[edge.kind]
                            : edge.kind === "depends_on"
                              ? "required by"
                              : "connected through " +
                                relationLabels[edge.kind]}
                        </small>
                        <strong>
                          {n.label} <em>{n.props.scope}</em>
                        </strong>
                      </span>
                      <ChevronRight size={13} />
                    </button>
                  ))}
              </div>
            )}
            {!!node.props.pending_relations?.length && (
              <p className="muted-note">
                {node.props.pending_relations.length} documented relationship(s)
                await a matching decision record. They are excluded from impact
                analysis.
              </p>
            )}
            <div className="detail-section history-section">
              <h4>
                DECISION HISTORY <span>{observations.length}</span>
              </h4>
              {observations.map((o) => (
                <div className="mini-event" key={o.id}>
                  <i className={o.state} />
                  <time>{formatDate(o.date)}</time>
                  <strong>{o.title}</strong>
                  <Status state={o.state} />
                  <button onClick={() => onReceipt(o.receipt)}>
                    <FileText size={12} />
                    {o.receipt.filename}
                    <ChevronRight size={12} />
                  </button>
                </div>
              ))}
            </div>
            <p className="integrity-note">
              <ShieldCheck size={14} />
              Every event is linked to a stored source passage. Source support
              still requires review.
            </p>
          </>
        )}
        {(tab === "evidence" || node.kind !== "decision") && (
          <>
            {node.kind !== "decision" && (
              <div className="detail-section">
                <h4>
                  {node.kind === "source"
                    ? "SOURCE RECORD"
                    : "CONNECTED DECISIONS"}
                </h4>
                {node.kind === "source" && (
                  <>
                    <p>{node.props.filename}</p>
                    <p className="muted-note">
                      {formatDate(node.props.date)} · {node.props.pages} page(s)
                      {node.props.synthetic ? " · Synthetic" : ""}
                    </p>
                    <button
                      className="secondary-button source-view-button"
                      onClick={() =>
                        onReceipt({
                          chunk_id: node.props.first_chunk_id,
                          filename: node.props.filename,
                        })
                      }
                    >
                      <FileText size={14} />
                      Open source text
                    </button>
                  </>
                )}
                {neighbors
                  .filter((x) => x.node.kind === "decision")
                  .map(({ edge, node: n }) => (
                    <button
                      className="relation-link"
                      key={edge.id}
                      onClick={() => onSelect(n.id)}
                    >
                      <GitBranch size={15} />
                      <span>
                        <strong>
                          {n.label} <em>{n.props.scope}</em>
                        </strong>
                        <small>{relationLabels[edge.kind]}</small>
                      </span>
                      <ChevronRight size={13} />
                    </button>
                  ))}
              </div>
            )}
            <div className="receipt-list">
              {uniqueReceipts.length ? (
                <>
                  <div className="detail-section">
                    <h4>SUPPORTING PASSAGES</h4>
                    <p className="muted-note">
                      Original text, with a stable source reference.
                    </p>
                  </div>
                  {uniqueReceipts.map((r, i) => (
                    <button
                      className="receipt-card"
                      key={r.chunk_id + i}
                      onClick={() => onReceipt(r)}
                    >
                      <div>
                        <span>
                          <FileText size={13} />
                          {r.filename}
                        </span>
                        <small>p. {r.page}</small>
                      </div>
                      <blockquote>“{r.quote}”</blockquote>
                      <span className="receipt-caption">
                        {r.synthetic ? "Synthetic record" : "Uploaded record"}
                        <ArrowRight size={13} />
                      </span>
                    </button>
                  ))}
                </>
              ) : (
                <p className="muted-note">
                  No extracted decision currently cites this record.
                </p>
              )}
            </div>
          </>
        )}
        {node.kind === "decision" && tab === "impact" && (
          <>
            <div className="detail-section">
              <h4>DOWNSTREAM IMPACT</h4>
              <p>What could be affected if this decision changes?</p>
              <p className="muted-note">
                Follows explicit dependency links. Shared people or topics do
                not imply a dependency.
              </p>
            </div>
            {error ? (
              <div role="alert" className="callout warning">
                {error}
              </div>
            ) : !impact ? (
              <div className="inline-loading">
                <Loader2 size={18} className="spin" />
                Tracing dependencies…
              </div>
            ) : (
              <>
                <div className="impact-count">
                  <strong>{impact.affected.length}</strong>
                  <span>
                    downstream{" "}
                    {impact.affected.length === 1 ? "decision" : "decisions"}
                  </span>
                </div>
                {impact.affected.map((item) => (
                  <article className="impact-card" key={item.id}>
                    <div>
                      <ArrowDownRight size={15} />
                      <span>
                        {item.depth === 1
                          ? "Direct dependency"
                          : `${item.depth} steps downstream`}
                      </span>
                    </div>
                    <button onClick={() => onSelect(item.id)}>
                      {item.decision.label} <em>{item.decision.props.scope}</em>
                      <ArrowRight size={14} />
                    </button>
                    <Status state={item.decision.props.state} />
                    <ol>
                      {item.chain.map((n) => (
                        <li key={n.id}>
                          {n.label} {n.props.scope}
                        </li>
                      ))}
                    </ol>
                    {item.receipts.map((r, i) => (
                      <button
                        className="impact-receipt"
                        key={r.chunk_id + i}
                        onClick={() => onReceipt(r)}
                      >
                        <FileText size={12} />
                        {r.filename}
                        <ChevronRight size={12} />
                      </button>
                    ))}
                  </article>
                ))}
                {!impact.affected.length && (
                  <div className="quiet-empty">
                    <CheckCheck size={25} />
                    <h3>No documented dependents.</h3>
                    <p>
                      The graph does not establish a downstream decision for
                      this trace.
                    </p>
                  </div>
                )}
                <p className="integrity-note">
                  <CircleAlert size={14} />
                  {impact.limitation}
                </p>
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

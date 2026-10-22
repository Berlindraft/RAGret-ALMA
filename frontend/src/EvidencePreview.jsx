import { useEffect, useState } from "react";
import { ArrowUpRight, Quote } from "lucide-react";
import { api } from "./api";
import { conversationMessage, graphTypes } from "./graphContext";
import "./graph-context.css";

export default function EvidencePreview({ context: linkedContext, source, onOpen, onReceipt, compact = false }) {
  const [fallback, setFallback] = useState(null);
  useEffect(() => {
    if (linkedContext || !source?.first_chunk_id) return;
    let active = true;
    api(`/evidence/${encodeURIComponent(source.first_chunk_id)}`).then((value) => {
      if (active) setFallback({ source, receipt: { ...value, quote: value.text } });
    }).catch(() => {});
    return () => { active = false; };
  }, [linkedContext, source]);
  const context = linkedContext || fallback;
  if (!context?.source || !context.receipt?.quote) return null;
  const { source: previewSource, receipt, decision } = context;
  const isConversation = previewSource.source_type === "conversation";
  const meta = graphTypes[isConversation ? "conversation" : "reference"];
  const Icon = meta.icon;
  const message = isConversation ? conversationMessage(receipt.quote) : { body: receipt.quote };
  return <div className={`source-context-glimpse ${compact ? "compact" : ""}`} style={{ "--evidence-color": meta.color, "--evidence-tint": meta.tint }}>
    <div className="glimpse-heading"><Icon size={17} /><strong>{isConversation ? "Conversation context" : "Reference passage"}</strong><span>{isConversation ? message.date?.slice(0, 10) : `Page ${receipt.page}`}</span></div>
    {decision && <p className="glimpse-decision">For {decision.label}{decision.props.scope ? ` · ${decision.props.scope}` : ""}</p>}
    {message.speaker && <div className="glimpse-speaker">{message.speaker}</div>}
    <blockquote><Quote size={15} aria-hidden="true" />{message.body}</blockquote>
    {!compact && <div className="glimpse-actions">
      <button className="text-button" onClick={() => onReceipt(receipt)}>Inspect citation</button>
      <button className="text-button" onClick={() => onOpen(previewSource, receipt.page, receipt.quote)}>{isConversation ? "Open conversation" : "Open document page"}<ArrowUpRight size={16} /></button>
    </div>}
  </div>;
}

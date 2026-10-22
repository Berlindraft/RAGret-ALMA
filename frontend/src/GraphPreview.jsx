import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Loader2, X } from "lucide-react";
import { api } from "./api";
import { conversationMessage, graphTypes, normalizedText } from "./graphContext";

export default function GraphPreview({ context, onClose, onOpen }) {
  const [surrounding, setSurrounding] = useState([]);
  const [loading, setLoading] = useState(context.source.source_type === "conversation");
  const [error, setError] = useState("");
  const panel = useRef(null);
  const { source, receipt, decision } = context;
  const isConversation = source.source_type === "conversation";
  const type = graphTypes[isConversation ? "conversation" : "reference"];
  const Icon = type.icon;
  const message = conversationMessage(receipt.quote);
  useEffect(() => {
    panel.current?.focus();
    const key = (event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  useEffect(() => {
    if (!isConversation) return;
    let active = true;
    api(`/documents/${encodeURIComponent(source.document_id)}/content`).then((value) => {
      if (!active) return;
      if (!value.original_available) return;
      const blocks = value.pages.map((p) => p.text).join("\n\n").split(/\n\s*\n/).filter((block) => conversationMessage(block).speaker);
      const quote = normalizedText(receipt.quote);
      const index = blocks.findIndex((block) => normalizedText(block).includes(quote));
      if (index >= 0) setSurrounding(blocks.slice(Math.max(0, index - 1), index + 2).map((block, i) => ({ ...conversationMessage(block), cited: Math.max(0, index - 1) + i === index, position: Math.max(0, index - 1) + i < index ? "Previous message" : "Next message" })));
    }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isConversation, source.document_id, receipt.quote]);
  return <aside ref={panel} tabIndex={-1} className="graph-preview-panel nowheel nodrag nopan" aria-label="Source context preview" style={{ "--evidence-color": type.color, "--evidence-tint": type.tint }}>
    <header><span><Icon size={19} />{isConversation ? "Conversation context" : `Reference · page ${receipt.page}`}</span><button className="icon-button" aria-label="Close context preview" onClick={onClose}><X size={18} /></button></header>
    <div className="graph-preview-body">
      <h3>{source.title}</h3>
      {decision && <p className="preview-basis">{isConversation ? "Records the discussion about" : "Reference for"} <strong>{decision.label}</strong></p>}
      {source.synthetic && <small className="preview-synthetic">Synthetic demonstration record</small>}
      {isConversation ? <>
        {loading && <p className="preview-loading"><Loader2 className="spin" size={16} />Loading surrounding messages…</p>}
        {(surrounding.length ? surrounding : [{ ...message, cited: true }]).map((m, i) => m.cited ? <div key={i} className="preview-message cited"><div><strong>{m.speaker || "Source excerpt"}</strong><span>Cited message</span></div>{m.date && <time>{m.date}</time>}<p>{m.body}</p></div> : <details key={i} className="preview-message preview-neighbor"><summary>{m.position} · {m.speaker}</summary>{m.date && <time>{m.date}</time>}<p>{m.body}</p></details>)}
        {error && <p className="preview-loading">Surrounding messages unavailable. The saved citation is shown above.</p>}
      </> : <>
        <blockquote className="preview-reference-quote">{receipt.quote}</blockquote>
        {source.has_original && source.filename.toLowerCase().endsWith(".pdf") && <button className="preview-page-thumbnail" onClick={() => onOpen(source, receipt.page, receipt.quote)} aria-label={`Open reference page ${receipt.page}`}><img src={`/api/documents/${encodeURIComponent(source.document_id)}/pages/${receipt.page}/image`} alt={`Preview of original PDF page ${receipt.page}`} /><span>Original PDF · page {receipt.page}<ArrowUpRight size={15} /></span></button>}
        <p className="preview-basis">Reference guidance supplies context; the conversation records who made the decision.</p>
      </>}
    </div>
    <footer><button className="primary-button" onClick={() => onOpen(source, receipt.page, receipt.quote)}>{isConversation ? "Read full conversation" : "Open full document"}<ArrowUpRight size={17} /></button></footer>
  </aside>;
}

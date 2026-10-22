import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Download, FileText, Loader2, MessageSquare, Search, ZoomIn, ZoomOut } from "lucide-react";
import { api, formatDate } from "./api";
import { conversationMessage, normalizedText } from "./graphContext";
import "./SourceViewer.css";

function highlight(text, query) {
  if (!query.trim()) return text;
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.split(new RegExp(`(${escaped})`, "gi")).map((part, i) =>
    part.toLowerCase() === query.trim().toLowerCase() ? <mark key={i}>{part}</mark> : part,
  );
}

export default function SourceViewer({ source, initialPage = 1, initialQuote = "" }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(initialPage);
  const [zoomed, setZoomed] = useState(false);
  const [imageReady, setImageReady] = useState("");
  const [imageError, setImageError] = useState("");
  const transcript = useRef(null);
  const base = `/documents/${encodeURIComponent(source.document_id)}`;
  useEffect(() => {
    let active = true;
    api(base + "/content").then((value) => {
      if (active) { setData(value); setPage(Math.min(initialPage, value.pages.length || 1)); }
    }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [base, initialPage]);
  const isPdf = data?.format === "pdf";
  const isConversation = source.source_type === "conversation";
  const count = data?.pages.length || 1;
  const needle = query.trim().toLowerCase();
  const matches = useMemo(() => data?.pages.filter((p) => p.text.toLowerCase().includes(needle)) || [], [data, needle]);
  const blocks = useMemo(() => (data?.pages.map((p) => p.text).join("\n\n") || "").split(/\n\s*\n/).filter(Boolean), [data]);
  const visibleBlocks = needle ? blocks.filter((block) => block.toLowerCase().includes(needle)) : blocks;
  const imageUrl = `/api${base}/pages/${page}/image`;
  const current = data?.pages.find((p) => p.page === page);
  const focusQuote = normalizedText(initialQuote);
  const focusedBlock = focusQuote ? blocks.findIndex((block) => normalizedText(block).includes(focusQuote)) : -1;
  useEffect(() => {
    if (!data || isPdf || focusedBlock < 0) return;
    const timer = setTimeout(() => transcript.current?.querySelector('[data-cited="true"]')?.scrollIntoView({ block: "center", behavior: "auto" }), 80);
    return () => clearTimeout(timer);
  }, [data, isPdf, focusedBlock]);

  function go(next) { setPage(Math.max(1, Math.min(count, next))); setImageError(""); }
  function nextMatch() {
    if (matches.length) go((matches.find((p) => p.page > page) || matches[0]).page);
  }

  if (error) return <div className="viewer-state" role="alert"><FileText size={28} /><h2>Could not open this source.</h2><p>{error}</p></div>;
  if (!data) return <div className="viewer-state" role="status"><Loader2 className="spin" size={26} /><p>Opening the complete source…</p></div>;

  return (
    <div className="document-viewer">
      <header className="viewer-heading">
        <span className="viewer-source-icon">{isConversation ? <MessageSquare size={23} /> : <FileText size={23} />}</span>
        <div>
          <span className="viewer-eyebrow">{isConversation ? "CONVERSATION" : "REFERENCE DOCUMENT"}{source.synthetic ? " · SYNTHETIC" : ""}</span>
          <h2>{source.title}</h2>
          <p>{formatDate(source.document_date)} · {isPdf ? `${count} pages` : source.filename}</p>
        </div>
        {data.original_available && (
          <a className="primary-button viewer-download" href={`/api${base}/file?download=true`} download>
            <Download size={15} /> {isPdf ? "Download PDF" : "Download file"}
          </a>
        )}
      </header>
      {!data.original_available && <p className="viewer-notice">This older source contains stored excerpts. Its original file was not retained.</p>}
      <div className="viewer-toolbar">
        <form className="viewer-search" onSubmit={(e) => { e.preventDefault(); if (isPdf) nextMatch(); }}>
          <Search size={16} />
          <input aria-label="Search this source" placeholder={isConversation ? "Search messages, people, or decisions" : "Search this document"} value={query} maxLength={120} onChange={(e) => setQuery(e.target.value)} />
          {needle && <span role="status">{isPdf ? `${matches.length} page${matches.length === 1 ? "" : "s"}` : `${visibleBlocks.length} result${visibleBlocks.length === 1 ? "" : "s"}`}</span>}
          {isPdf && needle && <button type="submit" className="icon-button" disabled={!matches.length} title="Next matching page" aria-label="Next matching page"><ArrowRight size={15} /></button>}
        </form>
        {isPdf && <div className="viewer-pagination">
          <button className="icon-button" aria-label="Previous page" disabled={page === 1} onClick={() => go(page - 1)}><ArrowLeft size={16} /></button>
          <label>Page <input type="number" aria-label="PDF page" min="1" max={count} value={page} onChange={(e) => go(Number(e.target.value) || 1)} /> of {count}</label>
          <button className="icon-button" aria-label="Next page" disabled={page === count} onClick={() => go(page + 1)}><ArrowRight size={16} /></button>
          <button className="icon-button" aria-label={zoomed ? "Fit page width" : "Zoom page"} onClick={() => setZoomed(!zoomed)}>{zoomed ? <ZoomOut size={17} /> : <ZoomIn size={17} />}</button>
        </div>}
      </div>
      {isPdf && initialQuote && page === initialPage && <div className="viewer-cited-passage"><strong>CITED PASSAGE · PAGE {page}</strong><p>{initialQuote}</p></div>}
      {isPdf ? (
        <div className="viewer-scroll pdf-scroll" key={page}>
          {needle && !matches.length && <p className="viewer-notice" role="status">No pages contain “{query}”. Try another phrase.</p>}
          <div className={`viewer-paper ${zoomed ? "zoomed" : ""}`}>
            {imageError ? <p role="alert" className="viewer-state">{imageError}</p> : <>
              {imageReady !== imageUrl && <div className="viewer-page-loading" role="status"><Loader2 className="spin" size={22} /> Loading page {page}…</div>}
              <img src={imageUrl} alt={`Page ${page} of ${source.title}`} onLoad={() => setImageReady(imageUrl)} onError={() => setImageError("This page could not be rendered. You can download the original PDF above.")} />
            </>}
          </div>
          <details className="viewer-page-text" open={!!needle || !!initialQuote}>
            <summary>Page {page} text {needle && "· search highlights"}</summary>
            <pre>{highlight(current?.text || "No readable text on this page.", query || initialQuote)}</pre>
          </details>
        </div>
      ) : (
        <div ref={transcript} className="viewer-scroll transcript-scroll">
          {source.synthetic && <p className="transcript-provenance">Synthetic demonstration source. Messages, events, and decisions in this record are fictional.</p>}
          {!visibleBlocks.length && <div className="viewer-state" role="status"><Search size={24} /><p>No messages contain “{query}”.</p></div>}
          {visibleBlocks.map((block, index) => {
            const cited = !!focusQuote && normalizedText(block).includes(focusQuote);
            const message = block.match(/^(M\d+) \| (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) \| ([^:]+):\s*([\s\S]*)$/);
            if (message) return <article className={`transcript-message ${cited ? "is-cited" : ""}`} key={index} data-cited={cited ? "true" : undefined}>
              <span className="speaker-avatar" aria-hidden="true">{message[3].split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>
              <div>{cited && <span className="cited-message-label">Cited message</span>}<header><strong>{highlight(message[3], query)}</strong><time>{message[2]}</time><small>{message[1]}</small></header><p>{highlight(message[4], query || (cited ? conversationMessage(initialQuote).body : ""))}</p></div>
            </article>;
            if (block.startsWith("## ")) return <h3 className="transcript-session" key={index}>{highlight(block.slice(3), query)}</h3>;
            if (block.startsWith("# ")) return <h2 className="transcript-title" key={index}>{highlight(block.slice(2), query)}</h2>;
            return <p className="transcript-paragraph" key={index} data-cited={cited ? "true" : undefined}>{highlight(block, query || (cited ? initialQuote : ""))}</p>;
          })}
        </div>
      )}
    </div>
  );
}

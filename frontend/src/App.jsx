import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileText,
  GitBranch,
  HelpCircle,
  Link2,
  Loader2,
  Menu,
  MessageSquare,
  Network,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  X,
  Clock,
  Maximize2,
  Minimize2,
  RefreshCw,
  CircleAlert,
} from "lucide-react";
import { kindIcons } from "./graphTypes";
import { Status } from "./Status";
const ContextGraph = lazy(() => import("./ContextGraph"));
import Inspector from "./Inspector";
import SourceViewer from "./SourceViewer";
import EvidencePreview from "./EvidencePreview";
import { sourceContext } from "./graphContext";
import { api, post, formatDate, download } from "./api";

const EMPTY = {
  nodes: [],
  edges: [],
  sources: [],
  stats: {
    decisions: 0,
    sources: 0,
    people: 0,
    relationships: 0,
    clusters: 0,
    conflicts: 0,
    pending: 0,
  },
};
const VIEWS = {
  graph: ["Context graph", "Understand how your project’s decisions connect."],
  decisions: [
    "Decision register",
    "A durable record of what was proposed, approved, and changed.",
  ],
  timeline: [
    "Decision timeline",
    "Follow the documented history, one event at a time.",
  ],
  sources: ["Reference documents", "Keep requirements, policies, and project context in one place."],
  conversations: ["Conversations", "Capture the discussions behind your decisions."],
  context: [
    "People & context",
    "Explore the people, constraints, and topics behind your decisions.",
  ],
};
const NAV = [
  ["graph", Network, "Context graph"],
  ["decisions", GitBranch, "Decisions"],
  ["timeline", Clock, "Timeline"],
  ["conversations", MessageSquare, "Conversations"],
  ["sources", FileText, "Reference documents"],
  ["context", UserRound, "People & context"],
];

function Dialog({ label, onClose, children, wide = false, viewer = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector("button,input,textarea")?.focus();
    const key = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll(
          "button:not(:disabled),input,textarea,select,a[href]",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose, label]);
  return (
    <motion.div
      className="dialog-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.section
        ref={ref}
        className={`dialog ${wide ? "wide" : ""} ${viewer ? "source-viewer-dialog" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        initial={{ opacity: 0, y: 12, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.16 }}
      >
        <div className="dialog-heading">
          <span>{label}</span>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </motion.section>
    </motion.div>
  );
}

export default function App() {
  const [graph, setGraph] = useState(EMPTY),
    [view, setView] = useState("graph"),
    [health, setHealth] = useState(null),
    [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null),
    [root, setRoot] = useState(null),
    [scope, setScope] = useState("focus"),
    [showContext, setShowContext] = useState(true),
    [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [person, setPerson] = useState(""),
    [constraint, setConstraint] = useState(""),
    [cluster, setCluster] = useState("");
  const [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState(null),
    [asking, setAsking] = useState(false),
    [processing, setProcessing] = useState("");
  const [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [menu, setMenu] = useState(false),
    [dialog, setDialog] = useState(null);
  const [sourceText, setSourceText] = useState(null),
    [receiptError, setReceiptError] = useState(""),
    [importTitle, setImportTitle] = useState(""),
    [importDate, setImportDate] = useState(""),
    [importText, setImportText] = useState("");
  const fileInput = useRef(null),
    uploadType = useRef("reference"),
    askInput = useRef(null);
  const reduced = useReducedMotion();
  const closeDialog = useCallback(() => setDialog(null), []);
  function adopt(value) {
    setGraph(value);
    const decisions = value.nodes.filter((n) => n.kind === "decision");
    setRoot((old) =>
      decisions.some((n) => n.id === old)
        ? old
        : (
            decisions.find(
              (n) => n.label === "Offline mode" && n.props.scope === "v2",
            ) || decisions[0]
          )?.id || null,
    );
    setSelected((old) =>
      value.nodes.some((n) => n.id === old)
        ? old
        : (
            decisions.find(
              (n) => n.label === "Offline mode" && n.props.scope === "v2",
            ) || decisions[0]
          )?.id || null,
    );
  }
  const refresh = useCallback(async () => {
    const value = await api("/workspace");
    adopt(value);
    return value;
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([api("/workspace"), api("/health")])
      .then(([g, h]) => {
        if (active) {
          adopt(g);
          setHealth(h);
          if (h.configured && h.provider === "deepseek") {
            post("/provider/check").then((value) => { if (active) setHealth(value); }).catch(() => {});
          }
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const reconnect = () => api("/health").then((value) => {
      if (value.configured && value.provider === "deepseek") return post("/provider/check");
      return value;
    }).then((value) => { if (active) setHealth(value); }).catch(() => {});
    window.addEventListener("online", reconnect);
    return () => { active = false; window.removeEventListener("online", reconnect); };
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setView("graph");
        setTimeout(() => askInput.current?.focus(), 40);
      }
      if (e.key === "Escape") {
        setExpanded(false);
        setMenu(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const nodes = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n])),
    [graph.nodes],
  );
  const allDecisions = useMemo(
    () => graph.nodes.filter((n) => n.kind === "decision"),
    [graph.nodes],
  );
  const clusters = graph.nodes.filter((n) => n.kind === "cluster");
  const people = graph.nodes.filter((n) => n.kind === "person");
  const constraints = graph.nodes.filter((n) => n.kind === "constraint");
  const related = useCallback(
    (id) =>
      graph.edges
        .filter((e) => e.source === id || e.target === id)
        .map((e) => nodes.get(e.source === id ? e.target : e.source))
        .filter(Boolean),
    [graph.edges, nodes],
  );
  const decisions = useMemo(
    () =>
      allDecisions
        .filter((n) => {
          const neighbors = related(n.id);
          return (
            (!filter || n.props.state === filter) &&
            (!person || neighbors.some((x) => x.id === person)) &&
            (!constraint || neighbors.some((x) => x.id === constraint)) &&
            (!cluster || neighbors.some((x) => x.id === cluster)) &&
            (!query ||
              [
                n.label,
                n.props.scope,
                n.props.summary,
                ...neighbors.map((x) => x.label),
                ...n.props.observations.map((o) => o.description),
              ]
                .join(" ")
                .toLowerCase()
                .includes(query.toLowerCase()))
          );
        })
        .sort(
          (a, b) =>
            (b.props.last_date || "").localeCompare(a.props.last_date || "") ||
            a.label.localeCompare(b.label),
        ),
    [allDecisions, related, filter, person, constraint, cluster, query],
  );
  const timeline = decisions
    .flatMap((n) => n.props.observations.map((o) => ({ ...o, decision: n })))
    .sort(
      (a, b) =>
        (a.date || "9999").localeCompare(b.date || "9999") ||
        (a.source_order || 0) - (b.source_order || 0) ||
        a.id.localeCompare(b.id),
    );
  const isDemo =
    graph.sources.length > 0 && graph.sources.every((d) => d.synthetic);
  const workspaceName = graph.sources.find((s) => s.workspace_name)?.workspace_name || (isDemo ? "Project Atlas" : "My workspace");
  const suggestedQuestions = graph.sources.flatMap((s) => s.suggested_questions || []);
  const pending = graph.sources.filter(
    (s) => s.extraction_state !== "extracted",
  );
  const isConversations = view === "conversations";
  const visibleSources = graph.sources.filter((s) =>
    isConversations ? s.source_type === "conversation" : s.source_type !== "conversation",
  );
  const visiblePending = visibleSources.filter((s) => s.extraction_state !== "extracted");
  const busy = !!processing;
  const selectNode = useCallback(
    (id) => {
      setSelected(id);
      const n = graph.nodes.find((n) => n.id === id);
      if (n?.kind === "decision") setRoot(id);
      if (window.innerWidth < 1050)
        setTimeout(
          () =>
            document.getElementById("detail-panel")?.scrollIntoView({
              behavior: reduced ? "auto" : "smooth",
              block: "start",
            }),
          80,
        );
    },
    [graph.nodes, reduced],
  );
  function openDecision(id) {
    setCluster("");
    setView("graph");
    setScope("focus");
    setSelected(id);
    setRoot(id);
    setMenu(false);
  }
  function navigate(next) {
    setView(next);
    window.scrollTo(0, 0);
    setMenu(false);
    setQuery("");
    setFilter("");
    setPerson("");
    setConstraint("");
    setError("");
  }
  async function receipt(r, relation) {
    setDialog({ type: "receipt", receipt: r, relation });
    setSourceText(null);
    setReceiptError("");
    try {
      setSourceText(await api("/evidence/" + r.chunk_id));
    } catch (e) {
      setReceiptError(e.message);
    }
  }
  function openSource(source, page = 1, quote = "") {
    setDialog({ type: "viewer", source, page, quote });
  }
  async function extract(ids, force = false) {
    setProcessing("Extracting decisions and connecting the evidence…");
    setError("");
    try {
      const value = await post("/workspace/extract", {
        document_ids: ids || [],
        force,
      });
      adopt(value.workspace);
      const failed = value.results.filter((r) => r.state === "error");
      if (failed.length)
        setError(
          `${failed.length} source(s) could not be extracted. ${failed[0].message}`,
        );
      else setToast(value.results.some((r) => r.state === "indexed") ? "Reference indexed. It will be used to ground conversation decisions." : "Decision traces saved. Your graph is up to date.");
      setAnswer(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setProcessing("");
      api("/health").then(setHealth).catch(() => {});
    }
  }
  function chooseFiles(type = "reference") {
    uploadType.current = type;
    fileInput.current?.click();
  }
  async function upload(files, sourceType = "reference") {
    if (!files?.length || busy) return;
    setProcessing("Reading source documents…");
    setError("");
    const before = new Set(graph.sources.map((s) => s.document_id));
    const form = new FormData();
    form.append("source_type", sourceType);
    Array.from(files).forEach((f) => form.append("files", f));
    try {
      const docs = await api("/documents", { method: "POST", body: form });
      await refresh();
      const added = docs
        .filter((d) => !before.has(d.document_id))
        .map((d) => d.document_id);
      if (added.length) {
        await extract(added);
        setView(sourceType === "conversation" ? "conversations" : "sources");
      } else {
        setToast("These sources are already in the workspace.");
        setProcessing("");
      }
    } catch (e) {
      setError(e.message);
      setProcessing("");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function removeSource(id) {
    if (busy) return;
    setError("");
    try {
      adopt(await api("/workspace/sources/" + id, { method: "DELETE" }));
      setAnswer(null);
      setToast("Source and its unsupported graph links removed.");
    } catch (e) {
      setError(e.message);
    }
  }
  async function replaceWorkspace(type) {
    setProcessing(
      type === "demo"
        ? "Loading the synthetic example…"
        : "Creating an empty workspace…",
    );
    setError("");
    try {
      adopt(await post("/workspace/" + type));
      setAnswer(null);
      setSelected(null);
      setCluster("");
      setQuery("");
      setFilter("");
      setPerson("");
      setConstraint("");
      setView(type === "clear" ? "sources" : "graph");
      setDialog(null);
      setToast(
        type === "demo"
          ? "Project Atlas loaded. All example records are synthetic."
          : "New workspace ready. Add your first source.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setProcessing("");
    }
  }
  async function ask(value = question) {
    if (value.trim().length < 3 || asking || busy) return;
    setQuestion(value);
    setAnswer(null);
    setAsking(true);
    setError("");
    try {
      const result = await post("/workspace/ask", { question: value.trim() });
      setAnswer(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setAsking(false);
      api("/health").then(setHealth).catch(() => {});
    }
  }
  async function exportGraph() {
    try {
      const value = await api("/workspace/export");
      download(
        "RAGret-context-graph.json",
        JSON.stringify(value, null, 2),
        "application/json",
      );
      setToast("Context graph exported with its source receipts.");
    } catch (e) {
      setError(e.message);
    }
  }
  async function copyReceipt() {
    try {
      await navigator.clipboard.writeText(
        `${dialog.receipt.filename || sourceText?.filename}, p. ${dialog.receipt.page || sourceText?.page}\n\n${dialog.receipt.quote || sourceText?.text}`,
      );
      setToast("Source citation copied.");
    } catch {
      setToast("Select the passage to copy it manually.");
    }
  }
  function importConversation(e) {
    e.preventDefault();
    if (!importTitle.trim() || !importText.trim()) return;
    const body =
      (importDate ? "Date: " + importDate + "\n" : "") +
      "# " +
      importTitle +
      "\n\n" +
      importText;
    const file = new File(
      [body],
      importTitle.replace(/[^a-zA-Z0-9_-]/g, "_") + ".md",
      { type: "text/markdown" },
    );
    setDialog(null);
    upload([file], "conversation");
    setImportText("");
    setImportTitle("");
    setImportDate("");
  }
  function filterByContext(n) {
    setView("decisions");
    setQuery("");
    setFilter("");
    setCluster("");
    setPerson(n.kind === "person" ? n.id : "");
    setConstraint(n.kind === "constraint" ? n.id : "");
    if (!["person", "constraint"].includes(n.kind)) setQuery(n.label);
  }
  const filters = (
    <div className="register-filters">
      <label className="search-field">
        <Search size={15} />
        <input
          aria-label="Search decision traces"
          placeholder="Search decisions, people, context…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button aria-label="Clear search" onClick={() => setQuery("")}>
            <X size={13} />
          </button>
        )}
      </label>
      <select
        aria-label="Filter by status"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      >
        <option value="">All states</option>
        {[
          "proposed",
          "approved",
          "postponed",
          "rejected",
          "reversed",
          "unresolved",
        ].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <select
        aria-label="Filter by person"
        value={person}
        onChange={(e) => setPerson(e.target.value)}
      >
        <option value="">All people</option>
        {people.map((n) => (
          <option key={n.id} value={n.id}>
            {n.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by constraint"
        value={constraint}
        onChange={(e) => setConstraint(e.target.value)}
      >
        <option value="">All constraints</option>
        {constraints.map((n) => (
          <option key={n.id} value={n.id}>
            {n.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="app">
      {menu && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("graph");
          }}
        >
          <img className="brand-mark" src="/brand/ragret-logo.png" alt="" width="36" height="36" />
          RAGret<span className="brand-period">.</span>
        </a>
        <button
          className="workspace-switch"
          onClick={() => setDialog({ type: "workspace" })}
        >
          <span className="workspace-avatar">A</span>
          <span>
            <strong>{workspaceName}</strong>
            <small>{isDemo ? "Synthetic example" : "Local project"}</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {NAV.map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => navigate(key)}
              className={view === key ? "active" : ""}
            >
              <Icon size={17} />
              <span>{label}</span>
              {key === "decisions" && <small>{graph.stats.decisions}</small>}
              {key === "sources" && <small>{graph.sources.filter((s) => s.source_type !== "conversation").length}</small>}
              {key === "conversations" && <small>{graph.sources.filter((s) => s.source_type === "conversation").length}</small>}
            </button>
          ))}
        </nav>
        <div className="cluster-section">
          <div className="nav-label">
            DECISION GROUPS<span>{clusters.length}</span>
          </div>
          <button
            className={!cluster ? "cluster-item selected" : "cluster-item"}
            onClick={() => {
              setCluster("");
              setView("graph");
            }}
          >
            <span className="cluster-dot all" />
            All decisions
          </button>
          {clusters.map((n) => (
            <button
              className={
                cluster === n.id ? "cluster-item selected" : "cluster-item"
              }
              key={n.id}
              onClick={() => {
                setCluster(n.id);
                const first = graph.edges.find(
                  (e) => e.kind === "in_cluster" && e.target === n.id,
                );
                if (first) {
                  setRoot(first.source);
                  setSelected(first.source);
                }
                setView("graph");
                setMenu(false);
              }}
            >
              <span className="cluster-dot" />
              {n.label}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="local-status">
            <ShieldCheck size={15} />
            <span>
              Local workspace
              <small>
                Source excerpts sent to{" "}
                {health?.provider === "alma" ? "ALMA" : "the configured AI provider"} for AI
                processing.
              </small>
            </span>
          </div>
          <button
            className="help-link"
            onClick={() => setDialog({ type: "about" })}
          >
            <HelpCircle size={16} />
            How RAGret works
            <ArrowUpRight size={13} />
          </button>
          <div className="team-mark">
            <span>KT</span>
            <div>
              <strong>KodoTech</strong>
              <small>Future Forge · 2026</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={19} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{VIEWS[view][0]}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="secondary-button export-button"
              onClick={exportGraph}
              disabled={loading}
            >
              <Download size={14} />
              Export
            </button>
            <button
              className="primary-button"
              onClick={() => chooseFiles(isConversations ? "conversation" : "reference")}
              disabled={busy}
            >
              <Plus size={15} />
              {isConversations ? "Upload conversation" : "Add documents"}
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="page-kicker">YOUR PROJECT, CONNECTED</div>
              <h1>{VIEWS[view][0]}</h1>
              <p>{VIEWS[view][1]}</p>
            </div>
            <button
              className="project-badge"
              onClick={() => setDialog({ type: "workspace" })}
            >
              <span className="workspace-avatar">A</span>
              {workspaceName}
              {isDemo && <span className="sample-tag">SYNTHETIC</span>}
              <ChevronDown size={13} />
            </button>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <CircleAlert size={17} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {busy && (
            <div className="processing-banner" role="status">
              <Loader2 className="spin" size={17} />
              <span>
                {processing}
                <small>
                  Validating quotes, saving traces, and updating relationships.
                </small>
              </span>
            </div>
          )}
          {loading ? (
            <div className="page-loading">
              <Loader2 size={24} className="spin" />
              <p>Opening your decision workspace…</p>
            </div>
          ) : (
            <>
              {view === "graph" && (
                <>
                  <div className="stats-strip">
                    {[
                      [GitBranch, graph.stats.decisions, "decisions"],
                      [FileText, graph.stats.sources, "sources"],
                      [UserRound, graph.stats.people, "people"],
                      [Link2, graph.stats.relationships, "connections"],
                    ].map(([Icon, count, label]) => (
                      <div key={label}>
                        <Icon size={15} />
                        <strong>{count}</strong>
                        <span>{label}</span>
                      </div>
                    ))}
                    {graph.stats.conflicts > 0 && (
                      <button
                        onClick={() => {
                          navigate("decisions");
                          setFilter("unresolved");
                        }}
                      >
                        <CircleAlert size={14} />
                        {graph.stats.conflicts} unresolved{" "}
                        {graph.stats.conflicts === 1 ? "conflict" : "conflicts"}
                      </button>
                    )}
                  </div>
                  <section className="ask-section">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        ask();
                      }}
                    >
                      <Sparkles size={18} />
                      <input
                        ref={askInput}
                        aria-label="Ask the decision graph"
                        placeholder="Ask your project. What changed, and why?"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        maxLength={1500}
                      />
                      <kbd>⌘ / Ctrl K</kbd>
                      <button
                        className="ask-button"
                        type="submit"
                        disabled={asking || busy || question.trim().length < 3}
                      >
                        {asking ? (
                          <Loader2 className="spin" size={16} />
                        ) : (
                          <ArrowRight size={17} />
                        )}
                        <span>{asking ? "Investigating" : "Ask"}</span>
                      </button>
                    </form>
                    <div className="suggested-questions">
                      <span>Try</span>
                      {(suggestedQuestions.length ? suggestedQuestions.slice(0, 3) : isDemo ? [
                        "Why was offline mode postponed?",
                        "What depends on the synchronization prototype?",
                      ] : ["What decisions changed?", "Which decisions have dependencies?"]).map((q) => (
                        <button
                          key={q}
                          onClick={() => ask(q)}
                          disabled={asking || busy}
                        >
                          {q}
                          <ArrowUpRight size={11} />
                        </button>
                      ))}
                    </div>
                  </section>
                  <AnimatePresence>
                    {answer && (
                      <motion.section
                        className="graph-answer"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                      >
                        <div className="answer-heading">
                          <span>
                            {answer.engine === "saved-graph" ? <FileText size={14} /> : <Sparkles size={14} />}
                            {answer.engine === "saved-graph" ? "Saved evidence · AI unavailable" : answer.engine === "graph-retrieval"
                              ? "Evidence gap"
                              : "Answer from your decision graph"}
                          </span>
                          <button
                            className="icon-button"
                            aria-label="Close answer"
                            onClick={() => setAnswer(null)}
                          >
                            <X size={15} />
                          </button>
                        </div>
                        <h3>{answer.question}</h3>
                        <p>{answer.answer}</p>
                        <div className="answer-sources">
                          {answer.evidence.map((e) => (
                            <button
                              key={e.chunk_id}
                              onClick={() => receipt({ ...e, quote: e.text })}
                            >
                              <FileText size={12} />
                              {e.evidence_id} · {e.filename}
                            </button>
                          ))}
                        </div>
                        {answer.limitations.length > 0 && (
                          <p className="muted-note">
                            {answer.limitations.join(" ")}
                          </p>
                        )}
                      </motion.section>
                    )}
                  </AnimatePresence>
                  {!allDecisions.length ? (
                    <div className="empty-workspace">
                      <span>
                        <Network size={32} />
                      </span>
                      <h2>Your next decision starts here.</h2>
                      <p>
                        Add meeting notes, project documents, or conversation
                        exports. RAGret will extract the decisions and connect
                        the evidence.
                      </p>
                      <button
                        className="primary-button"
                        disabled={busy}
                        onClick={() =>
                          pending.length
                            ? extract(pending.map((s) => s.document_id))
                            : fileInput.current?.click()
                        }
                      >
                        {pending.length ? (
                          <>
                            <Sparkles size={15} />
                            Extract {pending.length} pending sources
                          </>
                        ) : (
                          <>
                            <Plus size={15} />
                            Add your first source
                          </>
                        )}
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setDialog({ type: "workspace" })}
                      >
                        Explore the synthetic example
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`graph-layout ${expanded ? "is-expanded" : ""} ${selected ? "" : "no-inspector"}`}
                    >
                      <section className="graph-shell">
                        <div className="graph-toolbar">
                          <div className="segmented-control">
                            <button
                              className={scope === "focus" ? "active" : ""}
                              onClick={() => setScope("focus")}
                            >
                              Focused trace
                            </button>
                            <button
                              className={scope === "all" ? "active" : ""}
                              onClick={() => setScope("all")}
                            >
                              Full graph
                            </button>
                          </div>
                          <div className="graph-options">
                            <label className="context-toggle">
                              <input
                                type="checkbox"
                                checked={showContext}
                                onChange={(e) =>
                                  setShowContext(e.target.checked)
                                }
                              />
                              Context
                            </label>
                            <button
                              className="icon-button"
                              aria-label={
                                expanded
                                  ? "Exit expanded graph"
                                  : "Expand graph"
                              }
                              onClick={() => setExpanded(!expanded)}
                            >
                              {expanded ? (
                                <Minimize2 size={15} />
                              ) : (
                                <Maximize2 size={15} />
                              )}
                            </button>
                          </div>
                        </div>
                        <div className="graph-subtoolbar">
                          <label>
                            <GitBranch size={13} />
                            <select
                              aria-label="Focus a decision"
                              value={root || ""}
                              onChange={(e) => {
                                setRoot(e.target.value);
                                setSelected(e.target.value);
                              }}
                            >
                              {(cluster
                                ? allDecisions.filter((n) =>
                                    graph.edges.some(
                                      (e) =>
                                        e.source === n.id &&
                                        e.target === cluster,
                                    ),
                                  )
                                : allDecisions
                              ).map((n) => (
                                <option value={n.id} key={n.id}>
                                  {n.label}
                                  {n.props.scope ? " · " + n.props.scope : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                          <span>
                            {scope === "focus"
                              ? "One decision. Its documented connections."
                              : "All saved decisions and their context."}
                          </span>
                        </div>
                        <div className="graph-canvas">
                          <Suspense
                            fallback={
                              <div className="page-loading">
                                <Loader2 className="spin" size={20} />
                                Opening the graph?
                              </div>
                            }
                          >
                            <ContextGraph
                              key={expanded ? "expanded" : "normal"}
                              graph={graph}
                              root={root}
                              selected={selected}
                              scope={scope}
                              showContext={showContext}
                              cluster={cluster}
                              onSelect={selectNode}
                              onReceipt={receipt}
                              onOpenSource={openSource}
                            />
                          </Suspense>
                        </div>
                        <div className="graph-legend">
                          <span><i className="edge-key" />Conversation evidence</span>
                          <span><i className="edge-key reference" />Reference context</span>
                          <span><i className="edge-key dependency" />Decision dependency</span>
                          <span className="legend-note">
                            <ShieldCheck size={12} />
                            Connections carry source receipts
                          </span>
                        </div>
                      </section>
                      {selected && (
                        <Inspector
                          key={selected}
                          graph={graph}
                          node={nodes.get(selected)}
                          onSelect={selectNode}
                          onReceipt={receipt}
                          onClose={() => setSelected(null)}
                        />
                      )}
                    </div>
                  )}
                </>
              )}
              {["decisions", "timeline"].includes(view) && (
                <>
                  {filters}
                  <div className="list-heading">
                    <span>
                      {decisions.length} decision
                      {decisions.length !== 1 ? "s" : ""}
                      {cluster && (
                        <>
                          {" "}
                          in <strong>{nodes.get(cluster)?.label}</strong>
                        </>
                      )}
                    </span>
                    {(filter || person || constraint || query || cluster) && (
                      <button
                        className="text-button"
                        onClick={() => {
                          setFilter("");
                          setPerson("");
                          setConstraint("");
                          setQuery("");
                          setCluster("");
                        }}
                      >
                        Clear filters
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  {view === "decisions" ? (
                    <div className="decision-table table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Decision</th>
                            <th>Documented state</th>
                            <th>People</th>
                            <th>Sources</th>
                            <th>Last recorded</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {decisions.map((n) => (
                            <tr key={n.id} onClick={() => openDecision(n.id)}>
                              <td>
                                <button
                                  className="table-decision"
                                  onClick={() => openDecision(n.id)}
                                >
                                  <span className="table-node-icon">
                                    <GitBranch size={16} />
                                  </span>
                                  <span>
                                    <strong>
                                      {n.label}
                                      <em>{n.props.scope}</em>
                                    </strong>
                                    <small>
                                      {related(n.id).find(
                                        (x) => x.kind === "cluster",
                                      )?.label || "Ungrouped"}
                                    </small>
                                  </span>
                                </button>
                              </td>
                              <td>
                                <Status state={n.props.state} />
                                {n.props.conflict && (
                                  <span className="conflict-note">
                                    Conflicting evidence
                                  </span>
                                )}
                              </td>
                              <td>
                                <div className="people-cell">
                                  {n.props.people.slice(0, 2).map((name) => (
                                    <span key={name}>{name}</span>
                                  ))}
                                  {n.props.people.length > 2 && (
                                    <small>+{n.props.people.length - 2}</small>
                                  )}
                                </div>
                              </td>
                              <td>
                                <span className="table-source-count">
                                  <FileText size={13} />
                                  {
                                    new Set(
                                      n.props.observations.map(
                                        (o) => o.receipt.document_id,
                                      ),
                                    ).size
                                  }
                                </span>
                              </td>
                              <td className="date-cell">
                                {formatDate(n.props.last_date)}
                              </td>
                              <td>
                                <ChevronRight size={14} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!decisions.length && (
                        <div className="quiet-empty">
                          <Search size={25} />
                          <h3>No matching decisions.</h3>
                          <p>Try another search or clear the filters.</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="timeline-list">
                      {timeline.map((o) => (
                        <article className="timeline-row" key={o.id}>
                          <time>{formatDate(o.date)}</time>
                          <span className={`event-dot ${o.state}`} />
                          <div>
                            <div className="timeline-row-heading">
                              <button
                                onClick={() => openDecision(o.decision_id)}
                              >
                                {o.title}
                              </button>
                              <Status state={o.state} />
                            </div>
                            <p>{o.description}</p>
                            <div className="timeline-row-meta">
                              <button
                                onClick={() => openDecision(o.decision_id)}
                              >
                                <GitBranch size={12} />
                                {o.decision.label} · {o.decision.props.scope}
                              </button>
                              <button onClick={() => receipt(o.receipt)}>
                                <FileText size={12} />
                                {o.receipt.filename}
                                <ArrowUpRight size={12} />
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                      {!timeline.length && (
                        <div className="quiet-empty">
                          <Clock size={25} />
                          <h3>No documented events match.</h3>
                          <p>Adjust the filters or add a source.</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {(view === "sources" || view === "conversations") && (
                <>
                  {isConversations && (
                    <section className="conversation-guide" aria-label="Conversation import guide">
                      <span className="conversation-guide-icon"><MessageSquare size={20} /></span>
                      <div>
                        <strong>The discussion here. The background alongside it.</strong>
                        <p>Keep names, dates, and replies in your transcript so decisions can be traced back to what was said.</p>
                      </div>
                      <button className="text-button" onClick={() => navigate("sources")}>
                        Add reference documents <ArrowUpRight size={14} />
                      </button>
                    </section>
                  )}
                  <section
                    className="source-dropzone"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      upload(e.dataTransfer.files, isConversations ? "conversation" : "reference");
                    }}
                  >
                    <span className="upload-symbol">
                      <Upload size={24} />
                    </span>
                    <div>
                      <h2>{isConversations ? "Every decision starts with a conversation." : "Give your decisions the full context."}</h2>
                      <p>
                        Drop PDFs, Markdown, or TXT files here. Up to 8 sources
                        · 10 MB each.
                      </p>
                      <small>
                        {isConversations
                          ? "Upload chat exports, meeting transcripts, or email threads. Keep speaker names and timestamps."
                          : "Upload requirements, policies, budgets, or technical specs. Include the version and effective date."}
                      </small>
                    </div>
                    <div className="upload-actions">
                      <button
                        className="primary-button"
                        disabled={busy}
                        onClick={() => chooseFiles(isConversations ? "conversation" : "reference")}
                      >
                        <Plus size={15} />
                        {isConversations ? "Upload conversation" : "Upload documents"}
                      </button>
                      {isConversations && <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => setDialog({ type: "import" })}
                      >
                        <MessageSquare size={14} />
                        Paste conversation
                      </button>}
                    </div>
                  </section>
                  <div className="sources-toolbar">
                    <h2>
                      {isConversations ? "Conversation library" : "Reference library"} <span>{visibleSources.length}</span>
                    </h2>
                    <div>
                      {visiblePending.length > 0 && (
                        <button
                          className="secondary-button"
                          disabled={busy}
                          onClick={() =>
                            extract(visiblePending.map((s) => s.document_id))
                          }
                        >
                          <Sparkles size={14} />
                          Extract pending ({visiblePending.length})
                        </button>
                      )}
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => setDialog({ type: "workspace" })}
                      >
                        New workspace
                        <ArrowUpRight size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="source-library">
                    {visibleSources.map((d) => {
                      const linked = graph.edges.filter(
                        (e) =>
                          e.source === d.document_id && e.kind === "supports",
                      ).length;
                      return (
                        <article key={d.document_id} className="source-row">
                          <span className="source-file-icon">
                            <FileText size={22} />
                          </span>
                          <div className="source-row-title">
                            <button
                              onClick={() => openSource(d)}
                            >
                              {d.title}
                            </button>
                            <span>
                              {d.filename} · {d.pages} page
                              {d.pages !== 1 ? "s" : ""} ·{" "}
                              {formatDate(d.document_date)}
                              {d.synthetic && <em>Synthetic</em>}
                            </span>
                            {d.extraction_error && <p>{d.extraction_error}</p>}
                            {d.warnings.map((w) => (
                              <small key={w}>{w}</small>
                            ))}
                          </div>
                          <div className="source-extraction">
                            <span
                              className={`extraction-state ${d.extraction_state}`}
                            >
                              {d.extraction_state === "extracted" ? (
                                <Check size={12} />
                              ) : d.extraction_state === "error" ? (
                                <CircleAlert size={12} />
                              ) : (
                                <Clock size={12} />
                              )}{" "}
                              {d.engine === "reference-index" ? "Indexed" : d.extraction_state === "extracted"
                                ? "Extracted"
                                : d.extraction_state === "error"
                                  ? "Needs attention"
                                  : "Ready to extract"}
                            </span>
                            <small>
                              {linked} decision{linked !== 1 ? "s" : ""} ·{" "}
                              {d.engine === "curated-synthetic"
                                ? "Curated example"
                                : d.engine === "reference-index" ? "Reference indexed"
                                : d.engine ? "AI extraction" : "Not processed"}
                            </small>
                          </div>
                          <div className="source-actions">
                            <button className="secondary-button" onClick={() => openSource(d)} aria-label={`View ${d.title}`}>
                              <Eye size={14} /> View
                            </button>
                            {d.source_type !== "conversation" && d.has_original && (
                              <a className="secondary-button source-download" href={`/api/documents/${encodeURIComponent(d.document_id)}/file?download=true`} download>
                                <Download size={14} /> {d.filename.toLowerCase().endsWith(".pdf") ? "Download PDF" : "Download file"}
                              </a>
                            )}
                            <button
                              className="icon-button"
                              aria-label={`${d.source_type === "conversation" && d.extraction_state === "extracted" ? "Re-extract" : "Extract"} ${d.title}`}
                              title={
                                d.extraction_state === "extracted"
                                  ? d.source_type === "conversation" ? "Re-extract with live AI using current reference documents" : "Reference already indexed"
                                  : "Extract decisions"
                              }
                              disabled={busy}
                              onClick={() => extract([d.document_id], d.source_type === "conversation" && d.extraction_state === "extracted")}
                            >
                              <RefreshCw size={15} />
                            </button>
                            <button
                              className="icon-button danger"
                              aria-label={`Remove ${d.title}`}
                              disabled={busy}
                              onClick={() => removeSource(d.document_id)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                          <EvidencePreview context={sourceContext(graph, d.document_id, root)} source={d} onOpen={openSource} onReceipt={receipt} />
                        </article>
                      );
                    })}
                    {!visibleSources.length && (
                      <div className="quiet-empty">
                        <FileText size={28} />
                        <h3>{isConversations ? "Your conversations belong here." : "Your reference library starts here."}</h3>
                        <p>
                          {isConversations
                            ? "Upload a conversation document or paste a thread to extract decisions and their evidence."
                            : "Add project documents to keep supporting context alongside your decisions."}
                        </p>
                      </div>
                    )}
                  </div>
                  <p className="source-privacy">
                    <ShieldCheck size={14} />
                    Records are stored locally. During extraction and live
                    questions, relevant text is sent to the configured AI
                    provider. Actions in the graph are documented tasks; RAGret
                    does not execute them.
                  </p>
                </>
              )}
              {view === "context" && (
                <div className="context-directory">
                  {[
                    [
                      "person",
                      "People",
                      "Who proposed, approved, or participated.",
                    ],
                    [
                      "constraint",
                      "Constraints & risks",
                      "The limits that shaped your decisions.",
                    ],
                    [
                      "topic",
                      "Topics",
                      "Common themes connecting the discussion.",
                    ],
                  ].map(([kind, title, description]) => (
                    <section className="directory-section" key={kind}>
                      <div>
                        <h2>
                          {title}
                          <span>
                            {graph.nodes.filter((n) => n.kind === kind).length}
                          </span>
                        </h2>
                        <p>{description}</p>
                      </div>
                      <div className="directory-grid">
                        {graph.nodes
                          .filter((n) => n.kind === kind)
                          .map((n) => {
                            const Icon = kindIcons[kind];
                            const count = graph.edges.filter(
                              (e) => e.target === n.id,
                            ).length;
                            return (
                              <button
                                className="directory-card"
                                key={n.id}
                                onClick={() => filterByContext(n)}
                              >
                                <span className={`directory-icon ${kind}`}>
                                  <Icon size={18} />
                                </span>
                                <span>
                                  <strong>{n.label}</strong>
                                  <small>
                                    {count} linked decision
                                    {count !== 1 ? "s" : ""}
                                  </small>
                                </span>
                                <ArrowUpRight size={15} />
                              </button>
                            );
                          })}
                      </div>
                      {!graph.nodes.some((n) => n.kind === kind) && (
                        <p className="muted-note">
                          No {title.toLowerCase()} extracted yet.
                        </p>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
          <footer>
            <span>
              RAGret<span> • </span>No more regrets. Just receipts.
            </span>
            <span>Built from records. Open to review.</span>
          </footer>
        </main>
      </div>
      <input
        className="visually-hidden"
        ref={fileInput}
        type="file"
        aria-label={isConversations ? "Upload conversation documents" : "Upload reference documents"}
        multiple
        accept=".pdf,.md,.txt"
        onChange={(e) => upload(e.target.files, uploadType.current)}
      />
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 12, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 8, x: "-50%" }}
          >
            <Check size={16} />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {dialog && (
          <Dialog
            label={
              dialog.type === "viewer"
                ? dialog.source.source_type === "conversation" ? "Conversation viewer" : "Document viewer"
                : dialog.type === "receipt"
                ? "Source evidence"
                : dialog.type === "import"
                  ? "Import a conversation"
                  : dialog.type === "workspace"
                    ? "Your workspace"
                    : "How RAGret works"
            }
            wide={dialog.type === "receipt"}
            viewer={dialog.type === "viewer"}
            onClose={closeDialog}
          >
            {dialog.type === "viewer" && <SourceViewer key={dialog.source.document_id} source={dialog.source} initialPage={dialog.page} initialQuote={dialog.quote} />}
            {dialog.type === "receipt" && (
              <div className="evidence-dialog">
                <div className="evidence-document-heading">
                  <span className="source-file-icon">
                    <FileText size={24} />
                  </span>
                  <div>
                    <h2>
                      {dialog.receipt.filename ||
                        sourceText?.filename ||
                        "Source passage"}
                    </h2>
                    <p>
                      {formatDate(
                        sourceText?.document_date ||
                          dialog.receipt.document_date,
                      )}{" "}
                      · Page {dialog.receipt.page || sourceText?.page || "—"}
                      {(sourceText?.synthetic || dialog.receipt.synthetic) &&
                        " · Synthetic record"}
                    </p>
                  </div>
                </div>
                {dialog.relation && (
                  <div className="relationship-caption">
                    <Link2 size={14} />
                    Evidence for “{dialog.relation}”
                  </div>
                )}
                {dialog.receipt.quote && (
                  <div className="quoted-evidence">
                    <span>EXTRACTED EVIDENCE</span>
                    <blockquote>{dialog.receipt.quote}</blockquote>
                  </div>
                )}
                <div className="full-source">
                  <h4>ORIGINAL STORED PASSAGE</h4>
                  {receiptError ? (
                    <p role="alert">{receiptError}</p>
                  ) : sourceText ? (
                    <pre>{sourceText.text}</pre>
                  ) : (
                    <p>
                      <Loader2 className="spin" size={16} />
                      Loading source text…
                    </p>
                  )}
                </div>
                <div className="evidence-footer">
                  <p>
                    <ShieldCheck size={14} />A source reference verifies where a
                    claim came from. Review whether the passage supports the
                    interpretation.
                  </p>
                  {sourceText && <button className="secondary-button" onClick={() => openSource(sourceText, sourceText.page)}>
                    <Eye size={14} /> Open full source
                  </button>}
                  <button
                    className="secondary-button"
                    onClick={copyReceipt}
                    disabled={!sourceText && !dialog.receipt.quote}
                  >
                    <Copy size={14} />
                    Copy citation
                  </button>
                </div>
              </div>
            )}
            {dialog.type === "workspace" && (
              <div className="workspace-dialog">
                <img className="dialog-symbol brand-image" src="/brand/ragret-logo.png" alt="RAGret" width="48" height="48" />
                <h2>Start with the right context.</h2>
                <p>
                  Use your own records or explore a fictional project with
                  verified decision traces.
                </p>
                <div className="workspace-options">
                  <button
                    disabled={busy}
                    onClick={() => replaceWorkspace("demo")}
                  >
                    <span className="workspace-avatar">A</span>
                    <span>
                      <strong>Explore Project Atlas</strong>
                      <small>
                        6 synthetic sources · connected decision history
                      </small>
                    </span>
                    <ArrowRight size={17} />
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => replaceWorkspace("clear")}
                  >
                    <span className="new-workspace-icon">
                      <Plus size={20} />
                    </span>
                    <span>
                      <strong>Create an empty workspace</strong>
                      <small>
                        Upload your team’s documents and conversations
                      </small>
                    </span>
                    <ArrowRight size={17} />
                  </button>
                </div>
                <div className="callout warning">
                  <CircleAlert size={16} />
                  <span>
                    Either option replaces the current sources and graph. Export
                    your workspace first if you want to keep a copy.
                  </span>
                </div>
              </div>
            )}
            {dialog.type === "import" && (
              <form className="import-form" onSubmit={importConversation}>
                <h2>Give the discussion a place.</h2>
                <p>
                  Paste meeting minutes, an email thread, or a conversation
                  export. Include speaker names to preserve who said what.
                </p>
                <label>
                  Source title
                  <input
                    required
                    maxLength={100}
                    value={importTitle}
                    onChange={(e) => setImportTitle(e.target.value)}
                    placeholder="e.g. Product planning · April 12"
                  />
                </label>
                <label>
                  Document date <span>(optional)</span>
                  <input
                    type="date"
                    value={importDate}
                    onChange={(e) => setImportDate(e.target.value)}
                  />
                </label>
                <label>
                  Conversation
                  <textarea
                    required
                    maxLength={50000}
                    rows={9}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder="John Lorenzo: I propose…&#10;Raymund Zyron: Approved, provided that…"
                  />
                </label>
                <p className="muted-note">
                  Text is sent to{" "}
                  {health?.provider === "alma" ? "ALMA" : "the configured AI provider"} for
                  decision extraction. Unknown dates and unnamed people remain
                  unknown.
                </p>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={busy || !importTitle.trim() || !importText.trim()}
                >
                  <Sparkles size={15} />
                  Import & extract decisions
                </button>
              </form>
            )}
            {dialog.type === "about" && (
              <div className="about-dialog">
                <div className="dialog-symbol">
                  <Network size={26} />
                </div>
                <h2>Decisions deserve context.</h2>
                <p>
                  RAGret turns dated project records into a connected,
                  inspectable decision memory.
                </p>
                <ol>
                  <li>
                    <strong>Bring your records.</strong>
                    <span>Upload documents or paste conversation exports.</span>
                  </li>
                  <li>
                    <strong>Extract once. Remember later.</strong>
                    <span>
                      AI extracts decisions, people, constraints, and explicit
                      relationships. Validated traces are saved locally.
                    </span>
                  </li>
                  <li>
                    <strong>Follow the evidence.</strong>
                    <span>
                      Inspect sources, explore decision history, and trace
                      downstream dependencies.
                    </span>
                  </li>
                </ol>
                <p className="muted-note">
                  Grouping combines canonical subject/scope identities with
                  conservative name matching. Model extraction can be wrong;
                  exact quotes are checked, but semantic support still requires
                  review. The sample is hand-curated and synthetic. Live
                  communication integrations and task execution are not part of
                  this app.
                </p>
                <a
                  href="https://medium.com/chettoai/we-built-a-system-that-extracts-decisions-from-conversations-0effb06f73ad"
                  target="_blank"
                  rel="noreferrer"
                  className="text-link"
                >
                  Inspired by Decision Traces / Context Graphs
                  <ArrowUpRight size={12} />
                </a>
              </div>
            )}
          </Dialog>
        )}
      </AnimatePresence>
    </div>
  );
}

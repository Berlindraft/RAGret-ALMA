import { MessageSquare, FileText, GitBranch, UserRound, CircleAlert, CheckCheck, Lightbulb, Tag, Folder } from "lucide-react";

export const graphTypes = {
  conversation: { label: "Conversation", plural: "Conversations", icon: MessageSquare, color: "#087f8c", tint: "#ecf9f8" },
  reference: { label: "Reference", plural: "References", icon: FileText, color: "#3563b9", tint: "#eff5ff" },
  decision: { label: "Decision", plural: "Decisions", icon: GitBranch, color: "#7950c1", tint: "#f5f0ff" },
  person: { label: "Person", plural: "People", icon: UserRound, color: "#ad6425", tint: "#fff6eb" },
  constraint: { label: "Constraint", plural: "Constraints", icon: CircleAlert, color: "#bd5367", tint: "#fff1f3" },
  action: { label: "Action", plural: "Actions", icon: CheckCheck, color: "#278263", tint: "#edf9f1" },
  fact: { label: "Fact", plural: "Facts", icon: Lightbulb, color: "#397a99", tint: "#edf7fc" },
  topic: { label: "Topic", plural: "Topics", icon: Tag, color: "#65758e", tint: "#f1f4f8" },
  cluster: { label: "Group", plural: "Groups", icon: Folder, color: "#9261a5", tint: "#faf0fc" },
};

export function nodeType(node) {
  if (!node) return "topic";
  return node.kind === "source" ? node.props?.source_type === "conversation" ? "conversation" : "reference" : node.kind;
}

export function sourceContext(graph, sourceId, decisionId) {
  const links = graph.edges.filter((e) => e.source === sourceId && e.kind === "supports");
  const link = links.find((e) => e.target === decisionId) || links[0];
  if (!link?.receipts?.length) return null;
  const source = graph.sources.find((s) => s.document_id === sourceId);
  if (!source) return null;
  return {
    source,
    decision: graph.nodes.find((n) => n.id === link.target),
    receipt: link.receipts[link.receipts.length - 1],
  };
}

export function conversationMessage(text) {
  const match = text.match(/^(?:M\d+\s*\|\s*)?(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)\s*\|\s*([^:]+):\s*([\s\S]*)$/);
  return match ? { date: match[1], speaker: match[2], body: match[3] } : { body: text };
}

export function normalizedText(text) { return (text || "").replace(/\s+/g, " ").trim().toLowerCase(); }

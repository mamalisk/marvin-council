export type CatalogKind = "Agents" | "Skills" | "Traits";
export type CatalogItem = {
  id: string;
  kind: CatalogKind;
  name: string;
  role: string;
  description: string;
  instructions: string;
  traits: string[];
  skills: string[];
};
export type ContextDocument = {
  id: string;
  name: string;
  source: string;
  audience: "all" | string[];
  content: string;
};
export type CouncilDraft = {
  name: string;
  grow: [string, string, string, string];
  agentIds: string[];
  documents: ContextDocument[];
  mode: "live" | "offline";
  invitees: string[];
  tokenLimit: number;
  minutes: number;
  quorum: number;
};
export type Message = { id: string; name: string; role: string; text: string; quote?: string; time: string };
export type Council = CouncilDraft & {
  id: string;
  agents: CatalogItem[];
  status: "live" | "offline" | "paused" | "review";
  messages: Message[];
  answer: string;
  approvals: string[];
  revision: number;
  createdAt: string;
};
export type Workspace = {
  version: 1;
  catalog: CatalogItem[];
  councils: Council[];
  draft: CouncilDraft;
  theme: "dark" | "light";
  canvas: "cards" | "conversation";
};

const makeAgent = (id: string, name: string, role: string, description: string, traits: string[], skills: string[]): CatalogItem => ({
  id, name, role, description, kind: "Agents", traits, skills,
  instructions: `# ${name} — ${role}\n\n${description}\n\n## Working instructions\n- Ground recommendations in cited evidence.\n- Make uncertainty and assumptions explicit.\n- Preserve material disagreement.\n- Ask people when important context is missing.`,
});

export const starterAgents = [
  makeAgent("maya", "Maya", "Architect", "Sees the system behind the specification. Tests boundaries, dependencies, and the decisions that are hard to undo.", ["Systems thinker", "Evidence-led"], ["Architecture review"]),
  makeAgent("theo", "Theo", "Developer", "Turns intent into something buildable. Spots edge cases, implementation gaps, and assumptions hiding in plain sight.", ["Pragmatic", "Detail-oriented"], ["Acceptance criteria"]),
  makeAgent("nova", "Nova", "Product owner", "Keeps the council focused on the problem worth solving, the customer, and a measurable definition of success.", ["Outcome-driven", "Curious"], ["Discovery framing"]),
  makeAgent("iris", "Iris", "UX researcher", "Brings the human perspective. Challenges confusing journeys and asks whose needs have been left out.", ["Empathetic", "Inclusive"], ["Journey review"]),
];
const definitions: [CatalogKind, string, string, string][] = [
  ["Traits", "Evidence-led", "Reasoning", "Support claims with sources. Separate what is known from what is assumed."],
  ["Traits", "Constructive skeptic", "Critical thinking", "Challenge weak assumptions. Offer a stronger alternative with every objection."],
  ["Traits", "Pragmatic", "Decision making", "Balance ambition with constraints. Prefer the smallest useful next step."],
  ["Traits", "Inclusive", "Human perspective", "Consider accessibility and the people whose needs are easy to overlook."],
  ["Skills", "Architecture review", "Engineering", "Inspect system boundaries, dependencies, and nonfunctional requirements."],
  ["Skills", "Discovery framing", "Product", "Turn an uncertain opportunity into testable assumptions and experiments."],
  ["Skills", "Journey review", "Design", "Identify friction, missing states, and accessibility needs in a user journey."],
  ["Skills", "Acceptance criteria", "Delivery", "Translate the specification into clear, verifiable conditions for success."],
];
export const starterCatalog = [...starterAgents, ...definitions.map(([kind, name, role, description]) => ({
  id: name.toLowerCase().replaceAll(" ", "-"), kind, name, role, description,
  instructions: `# ${name}\n\n${description}\n\n## Expected contribution\nExplain the rationale, cite the relevant context, and identify what remains uncertain.`, traits: [], skills: [],
}))];
export const sampleDocuments: ContextDocument[] = [
  {id:"brief", name:"onboarding-brief.md", source:"Sample upload · Markdown", audience:"all", content:"# Client onboarding\n\nSimplify the onboarding journey while preserving verification controls.\n\nClients currently repeat information across three forms. Operations manually checks each submission.\n\n## Desired outcome\nA development-ready specification, acceptance criteria, and a Marvin plan.\n\nIllustrative document for this mock workspace."},
  {id:"architecture", name:"Platform architecture", source:"Delphi KB · Confluence · sample", audience:["maya"], content:"# Platform architecture\n\nClient identity and account activation are separate lifecycle stages. Transactional operations require verified account activation.\n\nCitation [1] · Confluence via Delphi\n\nIllustrative source. No live KB connection."},
  {id:"research", name:"Client interview findings", source:"Delphi KB · Research · sample", audience:["iris"], content:"# Client interview findings\n\nParticipants reported uncertainty after submitting their information. They wanted to know whether anything else was required and what would happen next.\n\nCitation [2] · Research via Delphi\n\nIllustrative source. No live KB connection."},
];
export const sampleGrow: CouncilDraft["grow"] = [
  "Agree a development-ready specification for a simpler client onboarding journey.",
  "Clients repeat information across three forms. Operations manually checks every submission.",
  "Explore progressive onboarding, reusable client profiles, and automated checks.",
  "A reviewed specification, acceptance criteria, and a Marvin development plan.",
];
export function freshDraft(): CouncilDraft {
  return {name:"", grow:["", "", "", ""], agentIds:starterAgents.map(a=>a.id), documents:[], mode:"live", invitees:["alex-r"], tokenLimit:120000, minutes:60, quorum:2};
}
export function newCouncil(draft: CouncilDraft, catalog: CatalogItem[], id = crypto.randomUUID()): Council {
  const copy = structuredClone(draft);
  return {...copy, id, agents: structuredClone(catalog.filter(a=>a.kind==="Agents" && draft.agentIds.includes(a.id))), status:draft.mode, messages:[], answer:"", approvals:[], revision:1, createdAt:new Date().toISOString()};
}
export function initialWorkspace(): Workspace {
  const base: CouncilDraft = {...freshDraft(), name:"Client onboarding, reimagined", grow:[...sampleGrow], documents:structuredClone(sampleDocuments), invitees:["alex-r","sam-chen"]};
  const onboarding = newCouncil(base, starterCatalog,"onboarding");
  onboarding.revision=3;
  const research = newCouncil({...base,name:"A more useful research workspace",mode:"offline"},starterCatalog,"research-workspace");
  research.status="review";
  research.answer="Allow clients to save and resume across devices.";
  research.approvals=["sam-chen"];
  research.revision=3;
  return {version:1,catalog:structuredClone(starterCatalog),councils:[onboarding,research],draft:freshDraft(),theme:"dark",canvas:"cards"};
}
export function canLaunch(draft: CouncilDraft) {
  return Boolean(draft.name.trim() && draft.grow[0].trim() && draft.agentIds.length && draft.tokenLimit>=1000 && draft.minutes>0 && draft.minutes<=60 && draft.quorum>=1);
}
export function assignDocuments(documents: ContextDocument[], agentId: string) {
  return documents.filter(d=>d.audience==="all"||d.audience.includes(agentId));
}
export function invalidateApprovals(council: Council): Council {
  return {...council, approvals:[], revision:council.revision+1};
}
export function exportSpecification(council: Council): string {
  const sample=council.id==="onboarding"||council.id==="research-workspace";
  return `# ${council.name}\n\n> Mock specification — not generated by live agents.\n> Revision ${council.revision} · ${council.approvals.length}/${council.quorum} approvals\n\n${["Goal","Reality","Options","Way forward"].map((title,i)=>`## ${title}\n${council.grow[i]||"Not specified."}`).join("\n\n")}\n\n## Proposed behavior\n${sample?"- Separate profile creation and verified activation.\n- Explain verification status and the next action.":"- Refine the GROW brief into testable acceptance criteria.\n- Validate assumptions against the provided context."}\n\n## Human input\n${council.answer||"Open question: confirm the proposed direction before approval."}\n\n## Context\n${council.documents.map(d=>`- ${d.name} (${d.source})`).join("\n")||"No context documents."}\n\n## Limitations\nCouncil deliberation and evidence are simulated. YAML plan export awaits the existing Marvin schema.\n`;
}
export function exportDefinition(item: CatalogItem) {
  return `---\nname: ${JSON.stringify(item.name)}\nkind: ${JSON.stringify(item.kind)}\nspecialization: ${JSON.stringify(item.role)}\ntraits: ${JSON.stringify(item.traits)}\nskills: ${JSON.stringify(item.skills)}\n---\n\n${item.instructions}\n`;
}
export function importDefinition(text: string, filename: string, kind: CatalogKind): CatalogItem {
  const frontmatter=text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const read=(key:string) => {const line=frontmatter?.[1].split(/\r?\n/).find(l=>l.startsWith(key+":"));if(!line)return undefined;try{return JSON.parse(line.slice(key.length+1).trim());}catch{return line.slice(key.length+1).trim();}};
  const list=(key:string)=>{const v=read(key);return Array.isArray(v)?v.filter((x:unknown)=>typeof x==="string"):[];};
  const savedKind=read("kind");
  return {id:crypto.randomUUID(),kind:["Agents","Skills","Traits"].includes(savedKind)?savedKind:kind,name:String(read("name")||text.match(/^#\s+(.+)$/m)?.[1]||filename.replace(/\.md$/i,"")),role:String(read("specialization")||"Custom"),description:"Your reusable Markdown definition.",instructions:frontmatter?text.slice(frontmatter[0].length).trim():text,traits:list("traits"),skills:list("skills")};
}

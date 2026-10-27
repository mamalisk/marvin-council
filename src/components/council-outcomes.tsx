"use client";

import {useId, useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {addCouncilOutcome, followUpDraft, type Council, type ContextDocument} from "@/lib/workspace";
import {useWorkspace} from "./workspace-provider";
import {Badge, Button, Icon} from "./ui";

export function CreateFollowUpButton({council}: {council: Council}) {
  const {setWorkspace, notify} = useWorkspace();
  const router = useRouter();
  return <Button variant="ghost" onClick={() => {
    setWorkspace(s => ({...s, draft: followUpDraft(council)}));
    notify(`Specification v${council.revision} added as a fixed input. Define the follow-up goal and choose its participants.`);
    router.push("/councils/new");
  }}><Icon name="git-fork"/>Create follow-up council</Button>;
}

export function OutcomePicker() {
  const {workspace, setWorkspace, notify} = useWorkspace();
  const selectId = useId();
  const [id, setId] = useState("");
  const source = workspace.councils.find(c => c.id === id);
  const added = source && workspace.draft.documents.some(d => d.outcome?.councilId === source.id && d.outcome.revision === source.revision);
  return <section className="mc-panel mc-gap" aria-label="Start from a previous outcome">
    <div className="mc-eyebrow">Continue the thinking</div>
    <h3 className="mc-smallgap">Start from a previous council’s outcome</h3>
    <p className="mc-muted mc-smallgap">Bring its specification into this council as context. Set a new goal, choose different specialists, and decide what comes next.</p>
    <div className="mc-field mc-smallgap"><label htmlFor={selectId}>Previous council outcome</label>
      <select id={selectId} value={id} onChange={e => setId(e.target.value)}>
        <option value="">Choose a council</option>
        {workspace.councils.map(c => <option value={c.id} key={c.id}>{c.name} · v{c.revision} · {c.approvals.length >= c.quorum ? "Approved" : "Not yet approved"}</option>)}
      </select>
    </div>
    <Button className="mc-smallgap" disabled={!source || added} onClick={() => {
      if (!source) return;
      setWorkspace(s => ({...s, draft: addCouncilOutcome(s.draft, source)}));
      notify("Outcome attached. Your existing scope and other context are unchanged.");
    }}><Icon name="git-fork"/>{added ? "Outcome already attached" : "Use outcome as input"}</Button>
    {source && <details className="mc-smallgap"><summary>Preview selected outcome</summary><p className="mc-muted mc-smallgap">{source.grow[0]}</p><Link href={`/councils/${encodeURIComponent(source.id)}`}>Open source council</Link></details>}
  </section>;
}

export function OutcomeSources({documents, onRemove}: {documents: ContextDocument[]; onRemove?: (id: string) => void}) {
  const {workspace} = useWorkspace();
  const sources = documents.filter(d => d.outcome);
  if (!sources.length) return null;
  return <section className="mc-panel mc-gap mc-outcomes" aria-label="Previous council outputs">
    <div className="mc-eyebrow">Linked council outcomes</div>
    <p className="mc-muted mc-smallgap">Fixed input snapshots. All humans in this council can read them; agent assignments are set in Context.</p>
    {sources.map(doc => {
      const origin = doc.outcome!;
      const current = workspace.councils.find(c => c.id === origin.councilId);
      const approved = origin.approvalCount >= origin.approvalsRequired;
      return <article key={doc.id} className="mc-outcome-entry">
        <div className="mc-between"><strong>{origin.councilName}</strong><Badge tone={approved ? "green" : "amber"}>v{origin.revision} · {approved ? "Approved at capture" : "Not approved at capture"}</Badge></div>
        <p className="mc-muted mc-smallgap">{origin.approvalCount}/{origin.approvalsRequired} approvals at capture. This council needs its own review.</p>
        {current && current.revision !== origin.revision && <p className="mc-note">Source is now v{current.revision}. This input remains v{origin.revision}.</p>}
        <div className="mc-row mc-smallgap">
          {current ? <Link href={`/councils/${encodeURIComponent(origin.councilId)}`}>Open source council</Link> : <span className="mc-muted">Source council unavailable in this workspace. Its captured output is retained.</span>}
          {onRemove && <Button variant="ghost" aria-label={`Remove outcome from ${origin.councilName}`} onClick={() => onRemove(doc.id)}>Remove input</Button>}
        </div>
        <details className="mc-smallgap"><summary>Read captured specification v{origin.revision}</summary><pre className="mc-doc-preview mc-smallgap">{doc.content}</pre></details>
      </article>;
    })}
  </section>;
}

export function FollowUpLinks({councilId}: {councilId: string}) {
  const {workspace} = useWorkspace();
  const followUps = workspace.councils.filter(c => c.id !== councilId && c.documents.some(d => d.outcome?.councilId === councilId));
  if (!followUps.length) return null;
  return <section aria-label="Follow-up councils"><h3>Follow-up councils</h3><div className="mc-summary-list">{followUps.map(c => <Link key={c.id} href={`/councils/${encodeURIComponent(c.id)}`}>{c.name}</Link>)}</div></section>;
}

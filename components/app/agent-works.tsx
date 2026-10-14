'use client';
import { PageHeader } from '../ui/layout';
/** What the Agent does and what a person does, step by step. Plain words, the same for every role. */
const STEPS: { step: string; agent: string; person: string }[] = [
  { step: 'A problem comes in', agent: 'Reads the message, photo or voice note from the app or WhatsApp and writes it up as a suggested job.', person: 'An admin or supervisor approves, edits or declines it.' },
  { step: 'Missing details', agent: 'Asks one short question at a time until the site, the problem and the best time are clear. It never sends a request with gaps.', person: 'The person answers, or taps one of the choices.' },
  { step: 'Emergencies', agent: 'Spots words like smoke, gas, flood or sparks, puts a safety line first and marks the job urgent.', person: 'The supervisor sends someone straight away.' },
  { step: 'Any change', agent: 'Reads the change back on a card with Yes and Change. Nothing is saved before you tap Yes.', person: 'You tap Yes, or Change to fix it.' },
  { step: 'Planning the day', agent: 'Suggests who fits a job by trade, area and free time.', person: 'The supervisor decides who goes.' },
  { step: 'Finishing a job', agent: 'Helps write the job report from your words.', person: 'The technician picks how it ended: Fixed, Temporary fix, Needs a part or Can\u2019t be fixed. The Agent never picks it.' },
  { step: 'Keeping people told', agent: 'Answers questions like what is late or what needs attention from the app\u2019s own data, even when the AI is busy.', person: 'People message each other directly inside the job.' },
  { step: 'Prices and money', agent: 'Never makes up a price.', person: 'The office sets every price; the facility manager approves or declines it.' },
];
export function AgentWorks() {
  return <div className="page stack agent-works"><PageHeader><div><h1>How your Agent works</h1><p className="muted">Your Agent does the typing and checking. People make every decision.</p></div></PageHeader>
    <ol className="divided-list agent-steps">{STEPS.map(s => <li key={s.step} className="stack compact"><h2>{s.step}</h2><p><strong>Agent:</strong> {s.agent}</p><p><strong>Person:</strong> {s.person}</p></li>)}</ol>
    <p className="muted">Each person has their own Agent with its own name, history and learning. Nobody else can read it.</p></div>;
}

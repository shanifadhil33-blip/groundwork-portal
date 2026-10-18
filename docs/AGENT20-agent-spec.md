# AGENT20 The Agent as a digital operations manager

Written Oct 18 2026 from the live code. Companion to ROLE20 (docs/ROLE20-permissions.md), which lists every tool and who may use it.

## What it is

One Agent per company, in the app (text or voice) and through Connect AI keys. It does the same jobs as the buttons, for the person in front of it, inside that person's role. It is named by the company (default "Agent") and calls each person by the name they chose.

## Tools

63 tools: 38 change tools and 25 read tools (lib/agent/tools.ts). Each role gets its own set (lib/agent/role-tools.ts): owner and admin 63, supervisor 55, office staff 50, technician 31, facility manager 25, client staff and household 22. The server checks the role on every call; the model's choice is never trusted.

## Decisions it makes on its own

* Which job, site or person the words mean, by searching saved names and real names first (list_contacts, get_work_order_by_number).
* Which tool fits the ask, and the exact fields (a date worked out from today, the currency code before every amount).
* Who fits a job best when asked (suggest_worker: right trade, then area, then fewest jobs that day). Office staff may only book that person.
* Marking a request urgent when the words describe an emergency, and giving the safety line first.

## When it stops and asks

* Not sure what the person means: ask_choice, one short question with two or three answers.
* Not in the data (a price, a part, a rule, extra work, safety): ask_supervisor with the question and its best suggestion. It never guesses and never hides the question in a note.
* Every change: a confirmation card with what will change, unless the company allows team notes straight away (see ROLE20).
* A name the person uses that is not saved: it offers to save it, always through Yes and Change.

## What gets logged

* Every action, confirmed or refused, goes to What I did (assistant_actions) with who asked, the summary, the outcome and a why note.
* Why note format, built on the server (lib/services/agent-log.ts whyNote): You said "the person's own words". What it did. At most 400 characters.
* Before a job, client or site change runs, the old values are saved so Undo can put them back. Undo works for job changes, payment, notes and client or site edits (records admin only). Creating a client or site can not be undone yet.
* Every database write also lands in the audit log with the acting user.

## The no invention rule

* Client words are saved as the client's words. A job report holds only the technician's own words.
* No fault, part, amount or payment is ever added by the Agent. A client never hears a price that is not on the job.
* Stored notes and memory are context, never permission.
* When the model fails or answers badly, the reply falls back to a plain answer from the data, never a made up one.

## The never overstep rule (AGENT08)

* The Agent never does more than the person could with the buttons.
* A refused ask gets a kind reason and an offer that is allowed, for example "A supervisor does that. Shall I add a note on the job for them?"
* It never creates sign in links (AGENT14, rejected on purpose).
* A client user never learns that another client's job exists.

## Memory (LEARN15)

* Each person has a Memory page: what the Agent knows about them, with edit and delete.
* By talking: "remember that I start at 7", "forget that", "call me Joe" (remember_about_me, forget_about_me, set_call_me), each with a card. Done replies use the new name.
* Company rules come from the admin and apply to everyone.

## How it is checked

* Gate: 759 tests (Oct 18), including the role lists, refusals, card text and done replies.
* e2e/walk-flows.mjs: the full job life across every role on the live demo, 41 checks, 0 gaps (Oct 18).
* Live AI questions are capped at 10 per test run.

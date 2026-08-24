# Posita — AI-First Personal Mail Hub

## 1. Product overview

Build a desktop-first email application called **Posita**.

Posita is not a traditional email client with AI added on top.

The core idea is:

> **Instead of making the user manage multiple inboxes, Posita understands all of their email accounts as one personal communication layer.**

A user may have:

- Personal Gmail
- Work Gmail
- Freelance Gmail
- Outlook
- Other email accounts later

Today, those accounts are separate.

The user has to:

- open each inbox
- scan hundreds of emails
- remember who they are waiting for
- remember what requires action
- remember which account a conversation happened in
- manually search old threads
- mentally connect related conversations
- decide what is important
- decide what can be ignored
- remember deadlines
- draft responses
- create reminders

Posita should remove most of that work.

Instead of starting with an inbox, the user starts with:

> **What matters right now?**

The application should behave more like a personal AI communication assistant than an email client.

---

# 2. Fundamental product principle

Traditional email apps organize around:

**Accounts → Inbox → Threads → Messages**

Posita should organize around:

**People → Topics → Context → Actions**

Emails still exist underneath, but they are not the primary interface.

The user should feel that Posita understands:

- who people are
- which project they belong to
- what the conversation is about
- what happened previously
- what is waiting for the user
- what the user is waiting for
- what needs a reply
- what has a deadline
- what can safely be ignored
- what information belongs together across different accounts

The product should answer:

> “What do all these emails mean for me?”

rather than:

> “Here are all your emails.”

---

# 3. Core example

Imagine the user owns three accounts:

- personal@gmail.com
- work@company.com
- freelance@gmail.com

Rahul sends an email to the work account.

Figma sends a design notification to the work account.

A client sends feedback to the freelance account.

Another person forwards information related to the same project to the personal account.

Traditional email clients treat these as four separate threads.

Posita should understand:

> These messages are all related to the same project.

The user should be able to ask:

**“What happened with the Pulse project?”**

Posita should answer with one coherent context:

- Rahul requested updated scope on Monday
- Figma comments were resolved Tuesday
- client feedback arrived Wednesday
- final confirmation is still pending
- Rahul currently needs a response

The user should not need to know which email account contained each message.

---

# 4. Primary app structure

The application should use a three-column desktop layout.

## Left sidebar

The left side is not primarily folders like Inbox, Sent, Spam.

It acts more like a history and context browser.

Example sections:

### Home

- Today
- Important
- Waiting
- Drafts

### Recent conversations

- Pulse
- Apartment
- Freelance project
- Travel
- Insurance
- Credit card

### People

Optional later:

- Rahul
- Ajay
- Client
- Landlord
- Family

### Mailboxes

Still allow traditional access:

- All Mail
- Personal Gmail
- Work Gmail
- Freelance Gmail

But mailbox navigation should be secondary.

---

# 5. Main center area

The center is the primary AI workspace.

This should feel conversational, but not like a generic chatbot.

The interface can contain:

- daily briefs
- summaries
- questions
- context cards
- actions
- timelines
- suggested replies
- reminders
- grouped information

At the bottom is a persistent conversational input.

Example placeholder:

**Ask Posita anything about your mail…**

The user can type things like:

- What needs my attention?
- Who am I waiting for?
- What emails need a reply?
- What happened with Pulse?
- Find the apartment conversation.
- Did Rahul reply?
- Anything important from today?
- Show invoices I haven't paid.
- Summarize emails from my client.
- What commitments have I made this week?
- Tell Rahul I'll send it tomorrow.
- Remind me if Rahul hasn't replied by Friday.
- Draft replies for everything urgent.

The UI should respond with structured interactive objects, not giant paragraphs of AI text.

---

# 6. Right-side mail stream

The right side contains a compact real-time email stream.

It should behave like a supporting layer.

Each email appears as a compact card.

Example:

**Rahul Menon**

Can we finalize the scope today?

`work@company.com`

10:42 AM

Another:

**Amazon**

Your package is arriving today

`personal@gmail.com`

9:20 AM

Another:

**Client Name**

Feedback on landing page

`freelance@gmail.com`

Yesterday

The email account identity must always be visible but subtle.

The right panel proves that multiple accounts are flowing into one system.

However, it should never visually dominate the AI workspace.

---

# 7. Home / Daily Brief

This is one of the most important screens.

Instead of:

> 147 unread emails

show:

# Good morning

### 3 things need you today

**Rahul is waiting for confirmation**

Pulse · Work

Reply needed

---

**Electricity bill due Friday**

Personal

₹2,840

---

**Client requested revised designs**

Freelance

Due tomorrow

Then:

### You are waiting for

**Ajay**

Product requirements

Waiting 2 days

**Apartment broker**

Rental options

Waiting 1 day

Then:

### Worth knowing

- Your Amazon package arrives today
- Figma released an update
- Bank statement is available

Then something reassuring such as:

**Everything else can wait.**

This is important.

Posita should reduce anxiety rather than create another stream requiring attention.

---

# 8. AI understanding model

Every incoming email should be interpreted.

For every message or thread, Posita should attempt to understand:

## Identity

- sender
- recipients
- related people
- company
- relationship to user

## Context

- topic
- project
- category
- related conversations
- relevant past messages

## Importance

- urgency
- importance
- whether user needs to respond
- whether sender expects something
- deadline
- financial implication

## Action

- reply required
- follow-up required
- payment required
- meeting required
- decision required
- informational only

## State

- unresolved
- resolved
- waiting for user
- waiting for another person
- completed
- expired

---

# 9. Suggested internal email object

The application can normalize messages internally into something like:

```typescript
type MailItem = {
  id: string

  accountId: string

  sender: Person
  recipients: Person[]

  subject: string
  body: string

  receivedAt: Date

  threadId: string

  topicId?: string
  projectId?: string

  summary: string

  importance: "low" | "medium" | "high"
  urgency: "low" | "medium" | "high"

  requiresReply: boolean

  actionItems: ActionItem[]

  deadline?: Date

  peopleMentioned: Person[]

  entities: Entity[]

  status:
    | "informational"
    | "needs_user"
    | "waiting_external"
    | "resolved"
}
```

This structure should evolve, but the app should avoid treating raw email text as the only source of truth.

---

# 10. Topics

Topics are extremely important.

A Topic represents a real-world subject involving multiple emails.

Examples:

**Pulse**

Could include:

- messages from Rahul
- GitHub ticket emails
- Figma notifications
- PM discussion
- design review feedback

Even if those came from different email accounts.

Topic UI:

# Pulse

**3 conversations · 2 accounts · 4 people**

### Current status

Waiting for Rahul to confirm final scope.

### What happened

**Monday**

Rahul requested scope changes.

**Tuesday**

Figma feedback was resolved.

**Wednesday**

Updated designs were shared.

**Today**

Final confirmation pending.

### Open actions

- Confirm final design
- Send updated prototype

### Related mail

Show the underlying messages underneath.

The raw email should always remain accessible.

---

# 11. People

Posita should gradually understand people.

Example:

# Rahul Menon

Product Manager

### Relationship

Work

### Active topics

- Pulse
- Onboarding 3.0
- GTM Profile

### Waiting

Rahul is waiting for:

**Pulse design confirmation**

You are waiting for:

**Updated ticket requirements**

### Recent interactions

Aug 15

Asked to finalize scope

Aug 13

Commented on Figma

Aug 11

Shared requirements

The user should be able to ask:

**“What am I currently waiting for from Rahul?”**

---

# 12. Waiting system

One important differentiator should be automatic waiting detection.

Traditional email apps mainly track unread messages.

Posita should track:

> **Who owes the next move?**

Examples:

### Waiting for you

Rahul

Needs scope confirmation

2 hours ago

---

Client

Needs revised designs

Yesterday

### Waiting for them

Apartment broker

You asked for available flats

2 days

---

Ajay

You asked for requirements

Yesterday

This could become one of the strongest features in the product.

---

# 13. AI action layer

AI should not only summarize.

It should help the user move work forward.

Possible actions:

### Draft reply

User:

**Tell Rahul I'll send the design tomorrow.**

Posita:

> Got it — I'll send the updated design tomorrow.

Buttons:

**Edit**

**Send**

Sending should require explicit user action.

---

### Follow-up

User:

**If Rahul doesn't respond by Friday, remind me.**

Posita creates a follow-up condition.

---

### Bundle replies

User:

**Draft replies for everything that needs me today.**

Posita creates a review queue.

Example:

**3 replies ready**

1 of 3

Rahul

Pulse

Draft reply…

**Approve & Next**

---

# 14. Smart notifications

Notifications should be extremely selective.

Do not notify the user for every new email.

Instead notify when AI decides something has changed.

Examples:

**Rahul replied — Pulse is unblocked**

**Your client moved tomorrow's deadline**

**Payment reminder: invoice due tomorrow**

**You have been waiting 4 days for the apartment broker**

**Meeting location changed**

This should feel more like an intelligent personal assistant than email notifications.

---

# 15. Search

Search should support both traditional and natural-language search.

Traditional:

`from:rahul pulse`

AI search:

- Show the email Rahul sent about Pulse last month.
- Find that invoice for ₹12,000.
- What did the broker say about parking?
- Find emails where I promised something for Friday.
- Which companies contacted me about design jobs?
- Show every conversation related to Kanyakumari.

Results should group around meaning, not only keyword matches.

---

# 16. Classic mode

Posita should still provide a traditional email view.

This is important for trust.

At the top of the application, have a very subtle switch:

**Posita / Classic**

## Posita

AI-first interface.

## Classic

Normal mail interface.

Possible Classic structure:

- unified inbox
- account inboxes
- threaded emails
- drafts
- sent
- archive
- spam

Users should always be able to drop back into a familiar email interface.

The AI experience should enhance email rather than lock users into an opaque system.

---

# 17. Email detail

When the user opens an email, show a refined drawer or detail view.

Example:

# Rahul Menon

`rahul@company.com`

To: `work@company.com`

10:42 AM

### Can we finalize this today?

Full email body.

Above or beside the email, optionally show:

**Posita context**

Pulse

Needs response

Rahul is waiting for scope confirmation.

Actions:

**Reply**

**Ask Posita**

**Mark resolved**

**Remind me**

---

# 18. Ask Posita about an email

Any email should allow:

**Ask Posita**

Then suggestions:

- Summarize this
- What does Rahul need from me?
- Find related conversations
- Draft a response
- Is this urgent?
- Have we discussed this before?
- What commitments did I make?

The conversation should understand that selected email automatically.

---

# 19. Context graph

Long term, Posita should maintain relationships between:

```text
People
   ↓
Organizations
   ↓
Projects
   ↓
Topics
   ↓
Threads
   ↓
Emails
   ↓
Actions
   ↓
Deadlines
```

Example:

Rahul

→ Factors.ai

→ Pulse

→ Buyer Stage Automation

→ 7 threads

→ 34 messages

→ Waiting for scope confirmation

This internal context graph is one of the most important parts of the product.

It does not need to be visually exposed as a literal graph.

It exists so the AI can reason intelligently.

---

# 20. Accounts

Create an account management screen.

Example:

# Connected accounts

### Work Gmail

`name@company.com`

Synced

### Personal Gmail

`name@gmail.com`

Synced

### Freelance Gmail

`freelance@gmail.com`

Synced

Button:

**Connect account**

For the prototype, Gmail alone is enough.

Support multiple Gmail accounts belonging to the same user.

Outlook can come later.

---

# 21. First-run onboarding

Onboarding should communicate the idea clearly.

### Screen 1

# One place for all your mail.

Connect your accounts.

Posita understands them together.

**Continue**

---

### Screen 2

# Posita learns what matters.

It identifies:

- people
- topics
- deadlines
- replies
- things you're waiting for

---

### Screen 3

# You remain in control.

Posita can draft and organize automatically.

Nothing is sent without your approval.

---

### Screen 4

Connect Gmail.

**Connect Gmail**

---

After synchronization:

# You're ready.

**247 conversations understood**

**18 active topics**

**4 things need your attention**

**Open Posita**

---

# 22. Visual design direction

The product should feel:

- calm
- intelligent
- minimal
- premium
- native
- sophisticated
- personal
- trustworthy

Avoid the visual language of enterprise dashboards.

Do not create lots of colorful cards and widgets.

Do not make the interface look like Notion with AI pasted onto it.

Do not create a giant generic chatbot.

Posita should feel closer to:

> a native communication environment

than:

> an analytics dashboard.

---

# 23. Desktop design

Primary target:

**macOS desktop**

Approximate application layout:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Posita                                      Search        Posita ◉      │
├───────────────┬────────────────────────────────────┬─────────────────┤
│               │                                    │                 │
│ Today         │ Good morning                       │ Incoming        │
│ Important     │                                    │                 │
│ Waiting       │ 3 things need you today            │ Rahul           │
│ Drafts        │                                    │ Work            │
│               │ Rahul needs confirmation           │ 10:42           │
│ Pulse         │                                    │                 │
│ Apartment     │ Payment due Friday                 │ Figma           │
│ Freelance     │                                    │ Work            │
│               │ Meeting moved to 4 PM              │ 10:20           │
│ ───────────   │                                    │                 │
│ All Mail      │                                    │ Amazon          │
│ Work          │                                    │ Personal        │
│ Personal      │                                    │ 9:20            │
│ Freelance     │                                    │                 │
│               │                                    │                 │
│               │ Ask Posita anything…                 │                 │
└───────────────┴────────────────────────────────────┴─────────────────┘
```

Suggested widths:

- sidebar: ~220px
- AI workspace: flexible / primary
- right stream: ~260px

The AI center should have most visual weight.

---

# 24. Visual styling

Use:

- subtle translucent surfaces
- near-white / charcoal backgrounds depending on mode
- soft separators
- restrained corner radii
- premium typography
- strong typographic hierarchy
- minimal color
- meaningful status colors only when necessary
- subtle motion
- native-feeling controls

Do not overuse glassmorphism.

Avoid excessive blur.

Avoid rounded cards around every piece of content.

Many parts can simply exist in the layout with typography and spacing.

---

# 25. Motion

Motion should convey intelligence.

Examples:

When related messages are found:

separate email cards subtly move together and become a topic.

When AI summarizes:

information reorganizes rather than just fading in.

When opening a topic:

the current brief can smoothly expand into the topic timeline.

When selecting an email:

the right-side mail card expands into its detailed view.

Motion should use:

- smooth easing
- subtle scale
- position interpolation
- opacity
- blur only when helpful
- continuity between states

Avoid:

- bouncing
- flashy AI particles
- glowing gradients everywhere
- animated robots
- excessive typing animations

---

# 26. AI architecture concept

Use a central AI agent called:

**Posita**

The agent has access to tools.

Example tools:

```typescript
searchMail()
getRecentMail()
getThread()
getRelatedThreads()

getPerson()
getTopic()

getWaitingItems()
getActionItems()

draftReply()
sendReply()

createReminder()
markResolved()
```

The AI should decide which tools to call depending on the user request.

Example:

User:

**What happened with Pulse?**

Agent:

1. search topic
2. retrieve related threads
3. retrieve important messages
4. inspect current unresolved actions
5. generate structured answer

---

# 27. AI responses

Avoid long ChatGPT-like prose.

Prefer:

## Summary

Pulse is waiting for final scope confirmation.

### What happened

**Monday**

Rahul requested changes.

**Tuesday**

Design updated.

**Wednesday**

Feedback resolved.

### Next step

**Confirm scope with Rahul**

Buttons:

**Draft reply**

**Mark resolved**

---

# 28. Structured AI output

Whenever possible, AI responses should produce structured objects.

Example:

```json
{
  "topic": "Pulse",
  "summary": "Waiting for final scope confirmation",
  "status": "needs_user",
  "priority": "high",

  "events": [
    {
      "date": "2026-08-11",
      "text": "Rahul requested updated scope"
    },
    {
      "date": "2026-08-13",
      "text": "Design feedback resolved"
    }
  ],

  "actions": [
    {
      "type": "reply",
      "text": "Confirm final scope with Rahul"
    }
  ]
}
```

The interface should render this structured information beautifully.

---

# 29. Privacy and trust

This product handles extremely sensitive personal communication.

Trust must be designed into the product.

Important principles:

- clearly show which account an email came from
- never send an email without user approval
- always allow access to the original email
- show why AI believes something is important when useful
- allow users to correct topic/person associations
- allow users to disconnect an account
- avoid hiding information behind AI summaries
- support deletion of AI-derived memory

The AI should augment reality rather than replace the underlying source.

---

# 30. MVP scope

Do not build the entire vision immediately.

For the first usable version, build:

## Authentication

- basic user account

## Gmail

- connect multiple Gmail accounts
- fetch emails
- threads
- sender
- recipients
- timestamps
- labels

## Unified inbox

Combine all accounts.

Every email visibly shows its originating account.

## AI classification

For messages determine:

- summary
- priority
- requires reply
- category
- topic
- action item

## Daily Brief

Generate:

- needs you
- waiting
- worth knowing

## Chat

Allow:

- search emails
- summarize topics
- ask about conversations

## Topics

Group related messages.

## Draft reply

Generate replies.

Do not automatically send.

## Classic inbox

Provide normal email access.

---

# 31. Do not build yet

Leave these for later:

- Outlook
- Yahoo
- iCloud
- Slack
- WhatsApp
- Teams
- Calendar automation
- autonomous sending
- complex multi-agent architecture
- mobile applications
- company-wide accounts
- shared/team inbox
- enterprise analytics

First prove:

> One person + several Gmail accounts + one intelligent communication layer.

---

# 32. Example prototype dataset

Use fake realistic data.

Accounts:

### Work

`shafi@factors.ai`

### Personal

`shafi.personal@gmail.com`

### Freelance

`hello@shafidesign.com`

People:

### Rahul Menon

Product Manager

Work

### Ajay

Product

Work

### Maya

Freelance Client

### Neeraj

Apartment Broker

Topics:

### Pulse

Work project

### Onboarding 3.0

Work project

### Apartment Search

Personal

### Acme Website

Freelance

---

# 33. Example Daily Brief

# Good morning, Shafi.

### 3 things need you

**Rahul needs final confirmation**

Pulse

He asked whether the latest scope can move to development.

`Reply`

---

**Maya is waiting for revised designs**

Acme Website

You said you would send them today.

`Open`

---

**Electricity bill is due Friday**

Personal

₹2,840

`Remind me`

### Waiting for others

**Ajay**

Updated requirements

2 days

**Neeraj**

Apartment shortlist

1 day

### Worth knowing

Amazon package arriving today.

Figma added two new comments to Pulse.

Nothing else needs your attention.

---

# 34. Example conversational experience

User:

**What happened with Pulse?**

Posita:

# Pulse

Waiting for final confirmation.

### Monday

Rahul asked to revise the scope.

### Tuesday

You updated the Figma design.

### Thursday

Two design comments were resolved.

### Today

Rahul asked whether it can move to development.

### Next step

Reply to Rahul.

**Draft reply**

---

User:

**Draft something short.**

Posita:

> Yep, the latest scope is reflected in the design. You can move ahead with this version.

Buttons:

**Edit**

**Send**

---

# 35. Product personality

Posita should communicate like a highly competent personal assistant.

Characteristics:

- concise
- calm
- contextual
- non-judgmental
- proactive when valuable
- quiet when nothing matters

Avoid:

- unnecessary enthusiasm
- overly friendly AI chatter
- constant suggestions
- emojis everywhere
- long explanations

Good:

**Rahul is waiting for a reply.**

Bad:

**Great news! It looks like Rahul has sent you an exciting email that might require your attention!**

---

# 36. Core product promise

The entire application should reinforce this idea:

> **Your inboxes, understood as one.**

Secondary positioning:

> **AI for everything that reaches you.**

But the product itself is more important than the tagline.

---

# 37. Build philosophy

Do not create a traditional mail client first and then add an AI sidebar.

That would miss the point.

Build:

```text
Mail
↓
Understanding
↓
Context
↓
Action
↓
Interface
```

Not:

```text
Inbox
↓
AI button
```

The AI layer is the main interface.

The inbox exists underneath it.

---

# 38. Definition of success

When someone opens Posita for the first time, they should understand within seconds:

1. multiple mail accounts are connected
2. Posita understands all of them together
3. the center tells me what matters
4. I can ask questions naturally
5. related conversations are automatically connected
6. I don't have to constantly check inboxes
7. I can always inspect the underlying email
8. Posita can help me act, not merely summarize

The emotional outcome should be:

> **“I finally don't need to manage email.”**

rather than:

> **“This is a nicer inbox.”**
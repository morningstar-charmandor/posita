import { createContext, useContext, useMemo, useState } from 'react'
import {
  Archive, ArrowLeft, ArrowUp, Bell, Check, ChevronDown, ChevronRight, CircleHelp,
  Clock3, FileText, Inbox, LayoutGrid, Mail, MessageCircleMore, MoreHorizontal,
  Paperclip, PenLine, Search, Send, Sparkles, Users, X
} from 'lucide-react'
import type { Account, BriefItem, MailDataset, Message, Topic } from '@shared/domain'
import { buildDailyBrief, createGroundedDraft, getMessage, getTopic, getTopicMessages } from '../../domain/mailService'

type CenterView = { kind: 'home' } | { kind: 'topic'; topicId: string } | { kind: 'classic' }

const MailDatasetContext = createContext<MailDataset | null>(null)

const useMailDataset = (): MailDataset => {
  const dataset = useContext(MailDatasetContext)
  if (!dataset) throw new Error('MailDatasetContext is unavailable.')
  return dataset
}

const accountById = (dataset: MailDataset, id: string): Account =>
  dataset.accounts.find((account) => account.id === id)!
const senderName = (dataset: MailDataset, message: Message): string =>
  dataset.people.find((person) => person.id === message.senderId)?.name ?? 'Unknown'

function AccountPill({ accountId, compact = false }: { accountId: string; compact?: boolean }): React.JSX.Element {
  const dataset = useMailDataset()
  const account = accountById(dataset, accountId)
  return <span className={`account-pill account-${account.tone} ${compact ? 'compact' : ''}`}><i />{compact ? account.label : account.address}</span>
}

function Sidebar({ view, onNavigate }: { view: CenterView; onNavigate: (view: CenterView) => void }): React.JSX.Element {
  const dataset = useMailDataset()
  const isHome = view.kind === 'home'
  return (
    <aside className="sidebar">
      <div className="brand-row"><div className="brand-mark">P</div><span>Posita</span><ChevronDown size={14} /></div>
      <nav aria-label="Primary">
        <div className="nav-section">
          <button className={`nav-item ${isHome ? 'active' : ''}`} onClick={() => onNavigate({ kind: 'home' })}><LayoutGrid /><span>Today</span><kbd>⌘1</kbd></button>
          <button className="nav-item"><Sparkles /><span>Important</span><span className="count">3</span></button>
          <button className="nav-item"><Clock3 /><span>Waiting</span><span className="count quiet">2</span></button>
          <button className="nav-item"><FileText /><span>Drafts</span><span className="count quiet">1</span></button>
        </div>
        <div className="nav-heading"><span>Recent conversations</span><button aria-label="Conversation options"><MoreHorizontal size={15} /></button></div>
        <div className="topic-list">
          {dataset.topics.map((topic) => (
            <button key={topic.id} className={`topic-link ${view.kind === 'topic' && view.topicId === topic.id ? 'active' : ''}`} onClick={() => onNavigate({ kind: 'topic', topicId: topic.id })}>
              <span className={`topic-dot priority-${topic.priority}`} />
              <span><strong>{topic.name}</strong><small>{topic.eyebrow}</small></span>
            </button>
          ))}
        </div>
        <div className="nav-heading mailbox-heading"><span>Mailboxes</span></div>
        <button className={`nav-item ${view.kind === 'classic' ? 'active' : ''}`} onClick={() => onNavigate({ kind: 'classic' })}><Inbox /><span>All mail</span><span className="count quiet">12</span></button>
        {dataset.accounts.map((account) => <button className="account-link" key={account.id}><span className={`account-dot account-${account.tone}`} /><span>{account.label}</span></button>)}
      </nav>
      <div className="sidebar-footer">
        <button><CircleHelp size={17} /> Help & feedback</button>
        <div className="profile"><span className="avatar avatar-user">MS</span><span><strong>Muhamed Shafi</strong><small>3 accounts connected</small></span><MoreHorizontal size={17} /></div>
      </div>
    </aside>
  )
}

function BriefCard({ item, onOpen }: { item: BriefItem; onOpen: () => void }): React.JSX.Element {
  return (
    <article className="brief-card" onClick={onOpen} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onOpen()}>
      <div className="brief-card-top">
        <div className="person-stack">
          {item.topicId === 'pulse' ? <><span className="avatar avatar-rahul">RM</span><span className="avatar avatar-maya">MC</span></> : <span className="avatar avatar-neutral">{item.topicId === 'apartment' ? 'AN' : 'NS'}</span>}
        </div>
        {item.dueLabel && <span className="due-label"><Clock3 size={13} />{item.dueLabel}</span>}
      </div>
      <h3>{item.title}</h3>
      <p>{item.detail}</p>
      <div className="why-row"><Sparkles size={14} /><span>{item.reason}</span></div>
      <div className="brief-card-footer"><AccountPill accountId={item.accountId} compact /><button>View context <ChevronRight size={14} /></button></div>
    </article>
  )
}

function AskBar({ onSubmit }: { onSubmit: (query: string) => void }): React.JSX.Element {
  const [value, setValue] = useState('')
  const submit = (): void => { if (value.trim()) { onSubmit(value); setValue('') } }
  return (
    <div className="ask-wrap">
      <div className="ask-bar"><Sparkles size={18} /><input aria-label="Ask Posita" value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submit()} placeholder="Ask Posita anything about your mail…" /><button onClick={submit} aria-label="Send question"><ArrowUp size={17} /></button></div>
      <span className="prototype-note">Prototype data · no mail leaves this device</span>
    </div>
  )
}

function HomeView({ onOpenTopic, onAsk }: { onOpenTopic: (id: string) => void; onAsk: (query: string) => void }): React.JSX.Element {
  const dataset = useMailDataset()
  const brief = buildDailyBrief(dataset)
  return (
    <main className="center-pane">
      <div className="center-scroll">
        <header className="brief-header"><div><span className="date-label">FRIDAY, 15 AUGUST</span><h1>Good afternoon, Shafi.</h1><p>Here’s what matters across your three inboxes.</p></div><button className="refresh-button"><Sparkles size={15} /> Brief is up to date</button></header>
        <section className="brief-section"><div className="section-title"><span className="section-icon needs"><Bell size={16} /></span><div><h2>{brief.needsYou.length} things need you</h2><p>Ordered by urgency and consequence</p></div></div><div className="brief-grid">{brief.needsYou.map((item) => <BriefCard key={item.id} item={item} onOpen={() => onOpenTopic(item.topicId)} />)}</div></section>
        <section className="brief-section compact-section"><div className="section-title"><span className="section-icon waiting"><Clock3 size={16} /></span><div><h2>You’re waiting for</h2><p>Posita will keep an eye on these</p></div></div>{brief.waiting.map((item) => <button key={item.id} className="brief-row" onClick={() => onOpenTopic(item.topicId)}><span className="avatar avatar-neutral">NS</span><span className="brief-row-copy"><strong>{item.title}</strong><small>{item.detail}</small></span><AccountPill accountId={item.accountId} compact /><ChevronRight size={17} /></button>)}</section>
        <section className="brief-section compact-section"><div className="section-title"><span className="section-icon knowing"><Sparkles size={16} /></span><div><h2>Worth knowing</h2><p>Useful updates, no action required</p></div></div>{brief.worthKnowing.map((item) => <button key={item.id} className="brief-row" onClick={() => onOpenTopic(item.topicId)}><span className="avatar avatar-maya">MC</span><span className="brief-row-copy"><strong>{item.title}</strong><small>{item.detail}</small></span><span className="resolved"><Check size={13} /> No action</span><ChevronRight size={17} /></button>)}</section>
      </div>
      <AskBar onSubmit={onAsk} />
    </main>
  )
}

function TopicView({ topic, onBack, onOpenMessage, onDraft, onAsk }: { topic: Topic; onBack: () => void; onOpenMessage: (id: string) => void; onDraft: () => void; onAsk: (query: string) => void }): React.JSX.Element {
  const dataset = useMailDataset()
  const people = topic.participantIds.map((id) => dataset.people.find((person) => person.id === id)!).filter(Boolean)
  return (
    <main className="center-pane">
      <div className="center-scroll topic-view">
        <button className="back-button" onClick={onBack}><ArrowLeft size={16} /> Today</button>
        <header className="topic-header"><div><div className="topic-kicker"><span className="priority-tag">Needs you</span><span>Updated 18 minutes ago</span></div><h1>{topic.name}</h1><p>{topic.eyebrow}</p></div><div className="topic-people">{people.map((person) => <span key={person.id} className={`avatar avatar-${person.id}`}>{person.initials}</span>)}<button><Users size={15} /> {people.length}</button></div></header>
        <section className="context-summary"><div className="summary-icon"><Sparkles size={19} /></div><div><span className="card-eyebrow">Current status</span><h2>{topic.summary}</h2><p>Posita connected {topic.messageIds.length} messages across {new Set(getTopicMessages(dataset, topic).map((message) => message.accountId)).size} accounts.</p></div></section>
        <section className="timeline-section"><div className="section-heading-row"><div><h2>What happened</h2><p>Each update is linked to its source.</p></div><button><Archive size={15} /> {topic.messageIds.length} messages</button></div><div className="timeline">{topic.events.map((event, index) => <button key={event.id} className="timeline-event" onClick={() => onOpenMessage(event.citationMessageId)}><span className="timeline-date">{event.dateLabel}</span><span className="timeline-track"><i className={index === topic.events.length - 1 ? 'current' : ''} /></span><span className="timeline-copy"><strong>{event.description}</strong><small><Mail size={13} /> Open source email</small></span><ChevronRight size={17} /></button>)}</div></section>
        <section className="next-step-card"><div className="next-step-icon"><PenLine size={18} /></div><div><span className="card-eyebrow">Suggested next step</span><h2>{topic.nextStep}</h2><p>Based on Rahul’s request and the resolved design feedback.</p></div><button className="primary-button" onClick={onDraft}><Sparkles size={15} /> Draft reply</button><button className="secondary-button"><Check size={15} /> Mark resolved</button></section>
      </div>
      <AskBar onSubmit={onAsk} />
    </main>
  )
}

function ClassicView({ onOpenMessage }: { onOpenMessage: (id: string) => void }): React.JSX.Element {
  const dataset = useMailDataset()
  return <main className="center-pane"><div className="center-scroll classic-view"><header><span className="date-label">ALL ACCOUNTS</span><h1>All mail</h1><p>Original messages, in chronological order.</p></header><div className="classic-toolbar"><button className="filter-active">All</button><button>Unread</button><button>Attachments</button><span /><button><Archive size={15} /> Archive</button></div><div className="classic-list">{dataset.messages.map((message) => <button key={message.id} className={`classic-message ${!message.isRead ? 'unread' : ''}`} onClick={() => onOpenMessage(message.id)}><span className="unread-dot" /><span className="avatar avatar-neutral">{dataset.people.find((person) => person.id === message.senderId)?.initials}</span><span className="classic-copy"><span><strong>{senderName(dataset, message)}</strong><time>{message.receivedAt}</time></span><b>{message.subject}</b><small>{message.preview}</small></span><AccountPill accountId={message.accountId} compact /></button>)}</div></div></main>
}

function MailStream({ focusedMessageId, onFocus, onClose }: { focusedMessageId: string | null; onFocus: (id: string) => void; onClose: () => void }): React.JSX.Element {
  const dataset = useMailDataset()
  const focused = focusedMessageId ? getMessage(dataset, focusedMessageId) : undefined
  if (focused) return <MessageDetail message={focused} onClose={onClose} />
  return (
    <aside className="mail-pane"><div className="mail-pane-header"><div><span className="live-dot" /> Mail stream</div><button aria-label="Mail stream options"><MoreHorizontal size={18} /></button></div><div className="mail-filters"><button className="active">All</button><button>Unread</button><button><Paperclip size={13} /></button></div><div className="mail-list">{dataset.messages.slice(0, 5).map((message) => <button key={message.id} className={`mail-item ${!message.isRead ? 'unread' : ''}`} onClick={() => onFocus(message.id)}><div className="mail-item-top"><span className="avatar avatar-small avatar-neutral">{dataset.people.find((person) => person.id === message.senderId)?.initials}</span><span className="mail-sender"><strong>{senderName(dataset, message)}</strong><small>{message.receivedAt}</small></span>{!message.isRead && <i className="new-dot" />}</div><h3>{message.subject}</h3><p>{message.preview}</p><AccountPill accountId={message.accountId} compact /></button>)}</div><button className="view-all-mail">View all mail <ChevronRight size={15} /></button></aside>
  )
}

function MessageDetail({ message, onClose }: { message: Message; onClose: () => void }): React.JSX.Element {
  const dataset = useMailDataset()
  const sender = dataset.people.find((person) => person.id === message.senderId)!
  return <aside className="mail-pane message-detail"><div className="mail-pane-header"><button className="icon-text" onClick={onClose}><ArrowLeft size={16} /> Mail</button><div><button aria-label="Archive"><Archive size={17} /></button><button aria-label="More"><MoreHorizontal size={18} /></button></div></div><div className="message-scroll"><AccountPill accountId={message.accountId} /><h2>{message.subject}</h2><div className="message-author"><span className="avatar avatar-neutral">{sender.initials}</span><span><strong>{sender.name}</strong><small>to {accountById(dataset, message.accountId).address}</small></span><time>{message.receivedAt}</time></div><div className="message-body">{message.body.split('\n').map((paragraph, index) => <p key={index}>{paragraph || <br />}</p>)}</div><div className="source-trust"><Check size={15} /><span><strong>Source email</strong><small>Posita uses this message to support its summary.</small></span></div><button className="reply-button"><PenLine size={15} /> Reply</button></div></aside>
}

function DraftPanel({ topic, onClose }: { topic: Topic; onClose: () => void }): React.JSX.Element {
  const [draft, setDraft] = useState(createGroundedDraft(topic))
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="draft-panel" role="dialog" aria-modal="true" aria-labelledby="draft-title"><header><div><span className="draft-spark"><Sparkles size={17} /></span><span><strong id="draft-title">Draft reply</strong><small>Generated from 3 cited messages</small></span></div><button onClick={onClose} aria-label="Close draft"><X size={19} /></button></header><div className="draft-fields"><div><span>From</span><AccountPill accountId="work" /></div><div><span>To</span><b>Rahul Menon</b><small>&lt;rahul@northstar.io&gt;</small></div><div><span>Subject</span><b>Re: Pulse launch scope</b></div></div><textarea aria-label="Draft reply text" value={draft} onChange={(event) => setDraft(event.target.value)} /><div className="grounding-note"><Sparkles size={15} /><span><strong>Why this draft?</strong> It confirms the three agreed launch items and moves analytics to the following release.</span></div><footer><button className="discard-button" onClick={onClose}>Discard</button><span>Sending is disabled in prototype mode</span><button className="send-disabled" disabled><Send size={15} /> Review & send</button></footer></section></div>
}

function WorkspaceContent(): React.JSX.Element {
  const dataset = useMailDataset()
  const [view, setView] = useState<CenterView>({ kind: 'home' })
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null)
  const [draftTopicId, setDraftTopicId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const topic = useMemo(
    () => view.kind === 'topic' ? getTopic(dataset, view.topicId) : undefined,
    [dataset, view]
  )
  const draftTopic = draftTopicId ? getTopic(dataset, draftTopicId) : undefined
  const navigate = (next: CenterView): void => { setView(next); setFocusedMessageId(null) }
  const ask = (query: string): void => {
    if (/pulse|scope|rahul/i.test(query)) navigate({ kind: 'topic', topicId: 'pulse' })
    else if (/apartment|ajay|document/i.test(query)) navigate({ kind: 'topic', topicId: 'apartment' })
    else if (/invoice|acme|payment/i.test(query)) navigate({ kind: 'topic', topicId: 'acme' })
  }
  return (
    <div className="app-shell">
      <div className="titlebar"><span className="drag-space" /><button className="global-search" onClick={() => setSearchOpen(!searchOpen)}><Search size={15} /><span>{searchOpen ? 'Try “What happened with Pulse?”' : 'Search mail or ask Posita'}</span><kbd>⌘K</kbd></button><button className="title-action"><Bell size={17} /><i /></button><span className="ai-status"><Sparkles size={14} /> Posita <i /></span></div>
      <div className="workspace"><Sidebar view={view} onNavigate={navigate} />{view.kind === 'home' && <HomeView onOpenTopic={(topicId) => navigate({ kind: 'topic', topicId })} onAsk={ask} />}{view.kind === 'topic' && topic && <TopicView topic={topic} onBack={() => navigate({ kind: 'home' })} onOpenMessage={setFocusedMessageId} onDraft={() => setDraftTopicId(topic.id)} onAsk={ask} />}{view.kind === 'classic' && <ClassicView onOpenMessage={setFocusedMessageId} />}<MailStream focusedMessageId={focusedMessageId} onFocus={setFocusedMessageId} onClose={() => setFocusedMessageId(null)} /></div>
      {draftTopic && <DraftPanel topic={draftTopic} onClose={() => setDraftTopicId(null)} />}
    </div>
  )
}

export function Workspace({ dataset }: { dataset: MailDataset }): React.JSX.Element {
  return (
    <MailDatasetContext.Provider value={dataset}>
      <WorkspaceContent />
    </MailDatasetContext.Provider>
  )
}

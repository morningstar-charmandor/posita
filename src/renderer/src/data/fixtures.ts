import type { MailDataset } from '@shared/domain'

export const fixtures: MailDataset = {
  accounts: [
    { id: 'work', label: 'Work', address: 'shafi@studio.co', tone: 'sage' },
    { id: 'personal', label: 'Personal', address: 'shafi@gmail.com', tone: 'blue' },
    { id: 'freelance', label: 'Freelance', address: 'hello@shafi.design', tone: 'sand' }
  ],
  people: [
    { id: 'rahul', name: 'Rahul Menon', initials: 'RM', role: 'Product lead at Northstar', email: 'rahul@northstar.io' },
    { id: 'maya', name: 'Maya Chen', initials: 'MC', role: 'Design partner', email: 'maya@northstar.io' },
    { id: 'ajay', name: 'Ajay Nair', initials: 'AN', role: 'Property agent', email: 'ajay@homes.in' },
    { id: 'neeraj', name: 'Neeraj Shah', initials: 'NS', role: 'Acme Studio', email: 'neeraj@acme.studio' },
    { id: 'figma', name: 'Figma', initials: 'F', role: 'Design updates', email: 'updates@figma.com' }
  ],
  messages: [
    {
      id: 'pulse-scope', threadId: 'thread-pulse', accountId: 'work', senderId: 'rahul',
      subject: 'Re: Pulse launch scope',
      preview: 'Can we lock the reduced scope today? Engineering needs the final call before tomorrow morning.',
      body: 'Hi Shafi,\n\nThe revised flow looks good from our side. Can we lock the reduced scope today? Engineering needs the final call before tomorrow morning. If you confirm the onboarding and dashboard pieces, I’ll update the launch plan.\n\nThanks,\nRahul',
      receivedAt: 'Today · 10:42 AM', isRead: false
    },
    {
      id: 'pulse-figma', threadId: 'thread-figma', accountId: 'work', senderId: 'figma',
      subject: 'Maya resolved 8 comments in Pulse',
      preview: 'All blocking comments on the onboarding flow have been resolved.',
      body: 'Maya resolved 8 comments in Pulse / Onboarding. All blocking comments on the onboarding flow have been resolved. Two copy notes remain and are marked non-blocking.',
      receivedAt: 'Yesterday · 4:18 PM', isRead: true
    },
    {
      id: 'pulse-feedback', threadId: 'thread-pulse-feedback', accountId: 'freelance', senderId: 'maya',
      subject: 'Pulse feedback — final pass',
      preview: 'The client approved the dashboard direction. We only need your scope confirmation.',
      body: 'The client approved the dashboard direction in today’s review. We only need your scope confirmation before Rahul can update the launch plan. I’ve closed the remaining blocking design comments.',
      receivedAt: 'Yesterday · 2:06 PM', isRead: true
    },
    {
      id: 'apartment-docs', threadId: 'thread-apartment', accountId: 'personal', senderId: 'ajay',
      subject: 'Documents for Indiranagar apartment',
      preview: 'I have sent the ownership documents. Please review them before our visit on Saturday.',
      body: 'Hi Shafi, I have sent the ownership documents and maintenance history for the Indiranagar apartment. Please review them before our visit on Saturday. Let me know if your lawyer needs anything else.',
      receivedAt: 'Today · 9:15 AM', isRead: false
    },
    {
      id: 'acme-payment', threadId: 'thread-acme', accountId: 'freelance', senderId: 'neeraj',
      subject: 'Invoice 1048 processed',
      preview: 'Finance processed the invoice this morning. It should arrive within two business days.',
      body: 'Quick update: finance processed invoice 1048 this morning. The transfer should arrive in your account within two business days. No action is needed from you.',
      receivedAt: 'Today · 8:34 AM', isRead: true
    },
    {
      id: 'pulse-followup', threadId: 'thread-pulse', accountId: 'work', senderId: 'rahul',
      subject: 'Re: Pulse launch scope',
      preview: 'Sharing the smaller launch plan we discussed. Let me know if Friday still works.',
      body: 'Sharing the smaller launch plan we discussed: onboarding, the new dashboard, and migration notes. We can move analytics to the following release. Let me know if Friday still works for final sign-off.',
      receivedAt: 'Monday · 3:22 PM', isRead: true
    }
  ],
  topics: [
    {
      id: 'pulse', name: 'Pulse', eyebrow: 'Work project',
      summary: 'The launch is waiting on your confirmation of the reduced scope.',
      status: 'needs-user', priority: 'high', participantIds: ['rahul', 'maya'],
      messageIds: ['pulse-scope', 'pulse-figma', 'pulse-feedback', 'pulse-followup'],
      events: [
        { id: 'event-1', dateLabel: 'Monday', description: 'Rahul proposed moving analytics to the next release.', citationMessageId: 'pulse-followup' },
        { id: 'event-2', dateLabel: 'Yesterday', description: 'Maya resolved all blocking onboarding comments.', citationMessageId: 'pulse-figma' },
        { id: 'event-3', dateLabel: 'Yesterday', description: 'The client approved the dashboard direction.', citationMessageId: 'pulse-feedback' },
        { id: 'event-4', dateLabel: 'Today', description: 'Rahul asked for final confirmation before tomorrow morning.', citationMessageId: 'pulse-scope' }
      ],
      nextStep: 'Confirm the reduced launch scope with Rahul'
    },
    {
      id: 'apartment', name: 'Apartment search', eyebrow: 'Personal',
      summary: 'Ownership documents are ready to review before Saturday’s visit.',
      status: 'needs-user', priority: 'medium', participantIds: ['ajay'],
      messageIds: ['apartment-docs'],
      events: [{ id: 'event-5', dateLabel: 'Today', description: 'Ajay sent the ownership and maintenance documents.', citationMessageId: 'apartment-docs' }],
      nextStep: 'Review the ownership documents'
    },
    {
      id: 'acme', name: 'Acme website', eyebrow: 'Freelance',
      summary: 'Invoice 1048 was processed and should arrive within two business days.',
      status: 'waiting', priority: 'low', participantIds: ['neeraj'],
      messageIds: ['acme-payment'],
      events: [{ id: 'event-6', dateLabel: 'Today', description: 'Acme finance processed invoice 1048.', citationMessageId: 'acme-payment' }],
      nextStep: 'Check for the transfer in two business days'
    }
  ],
  briefItems: [
    {
      id: 'brief-pulse', section: 'needs-you', topicId: 'pulse', title: 'Confirm Pulse scope with Rahul',
      detail: 'The launch plan cannot move forward until you confirm the reduced scope.',
      reason: 'Rahul asked for a decision before tomorrow morning.', accountId: 'work',
      citationMessageIds: ['pulse-scope', 'pulse-feedback'], dueLabel: 'Today'
    },
    {
      id: 'brief-apartment', section: 'needs-you', topicId: 'apartment', title: 'Review apartment documents',
      detail: 'Ownership and maintenance documents arrived ahead of Saturday’s visit.',
      reason: 'Ajay asked you to review them before the visit.', accountId: 'personal',
      citationMessageIds: ['apartment-docs'], dueLabel: 'Before Sat'
    },
    {
      id: 'brief-acme', section: 'waiting', topicId: 'acme', title: 'Payment from Acme',
      detail: 'Invoice 1048 has been processed.', reason: 'Expected within two business days.',
      accountId: 'freelance', citationMessageIds: ['acme-payment']
    },
    {
      id: 'brief-figma', section: 'worth-knowing', topicId: 'pulse', title: 'Pulse design is unblocked',
      detail: 'All blocking onboarding comments were resolved yesterday.',
      reason: 'No design action is needed.', accountId: 'work', citationMessageIds: ['pulse-figma']
    }
  ]
}

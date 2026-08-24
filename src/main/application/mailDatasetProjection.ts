import type { Message, Person, Topic } from '../../shared/domain'

export const retainReferencedPeople = (
  people: readonly Person[],
  messages: readonly Message[],
  topics: readonly Topic[]
): Person[] => {
  const retainedPersonIds = new Set(messages.map((message) => message.senderId))
  for (const topic of topics) {
    for (const personId of topic.participantIds) retainedPersonIds.add(personId)
  }
  return people.filter((person) => retainedPersonIds.has(person.id))
}

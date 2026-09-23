/* Whether, and how, the Fireflies notetaker is asked into a meeting.

   Fireflies is set to join only meetings it is invited to, so an invitation
   is the whole mechanism: a calendar invite, carrying the join link, with
   fred@fireflies.ai on it. It goes two ways at once, because Fireflies can
   pick it up either way:
     - to Fred directly, and
     - to the organiser's own mailbox, so the event with Fred on it lands in
       the calendar Fireflies watches.
   Guests' invitations are never touched: they are the same whether or not
   Fireflies is on. For Google Meet the calendar event itself carries Fred as
   an attendee, and Google sends his invite.

   Nothing here happens unless the booking asked for it (add_fireflies: true,
   from a checkbox that is off by default).

   Plain JavaScript so it runs in the Edge Function (Deno) and in the Node
   tests (tests/fireflies.test.mjs). */

export const FIREFLIES_DEFAULT = 'fred@fireflies.ai';

/**
 * @param {object} a
 * @param {boolean} a.requested       the checkbox was ticked for this call
 * @param {boolean} a.alreadyInvited  the meeting row says Fred was invited before
 * @param {string}  a.provider        'zoom' | 'teams' | 'meet'
 * @param {boolean} a.isReuse         the meeting already exists (Send an email)
 * @param {string[]} a.recipients     every guest address on this call (to, cc, bcc)
 * @param {string}  a.organizer       the address invitations are sent from
 * @param {string}  a.fireflies       Fred's address
 */
export function firefliesPlan(a) {
  const fred = String(a.fireflies || FIREFLIES_DEFAULT).toLowerCase();
  const none = { addToEvent: false, sendInvite: false, inviteTo: [], inviteCc: [], on: !!a.alreadyInvited };
  if (a.requested !== true) return none;
  // Already on the meeting, or typed in as a guest by hand: nothing to add.
  if (a.alreadyInvited || (a.recipients || []).map((x) => String(x).toLowerCase()).includes(fred)) {
    return { ...none, on: true };
  }
  // A new Google Meet event: Fred goes on the event and Google invites him.
  if (a.provider === 'meet' && !a.isReuse) return { ...none, addToEvent: true, on: true };
  const org = String(a.organizer || '').toLowerCase();
  return { addToEvent: false, sendInvite: true, inviteTo: [fred],
    inviteCc: org && org !== fred ? [org] : [], on: true };
}

// @polsia:user-owned — shared zod contract for the events resource. Keep
// client-importable: zod only — no server-only imports.

import { z } from 'zod';

export const EventId = z.string().min(1);
export type EventId = z.infer<typeof EventId>;

export const EventQuery = z.object({
  cursor: z.string().optional(),
});
export type EventQuery = z.infer<typeof EventQuery>;

export const EventItem = z.object({
  id: EventId,
  hostId: z.string().min(1),
  title: z.string().min(1),
  hostName: z.string().min(1),
  startTime: z.string().datetime(),
  city: z.string().min(1),
  attendeeCount: z.number().int().min(0),
});
export type EventItem = z.infer<typeof EventItem>;

// Request body for `POST /api/events`. `startTime` arrives as an ISO-8601
// datetime string; the route handler converts it to a `Date` before insert.
export const EventCreate = z.object({
  title: z.string().min(1),
  hostName: z.string().min(1),
  startTime: z.string().datetime(),
  city: z.string().min(1),
  maxAttendees: z.number().int().positive(),
});
export type EventCreate = z.infer<typeof EventCreate>;

// Response body for a freshly-created event. A new event has zero RSVPs, so
// `attendeeCount` is hard-coded to 0 on insert; the shape is identical to
// `EventItem` so the listing surface can render newly-created rows the same
// way it renders un-RSVPed listed rows. `hostId` is the authed session id of
// the host (sourced from Event.userId on the row).
export const EventCreated = z.object({
  id: EventId,
  hostId: z.string().min(1),
  title: z.string().min(1),
  hostName: z.string().min(1),
  startTime: z.string().datetime(),
  city: z.string().min(1),
  attendeeCount: z.number().int().min(0),
});
export type EventCreated = z.infer<typeof EventCreated>;

export const EventList = z.object({
  items: z.array(EventItem),
  nextCursor: z.string().nullable(),
});
export type EventList = z.infer<typeof EventList>;

// Response body for `GET /api/events/[id]`. Source row is `Event` (the row's
// scalar `userId` is renamed to `hostId`) plus a per-row RSVP count sourced
// from `EventRsvp` at request time — `currentAttendees` lives ONLY here, on
// the detail surface, never on the list `EventItem`. The listing also omits
// `maxAttendees`; the cap is only surfaced where the RSVP UI needs it.
export const EventDetail = z.object({
  id: EventId,
  hostId: z.string().min(1),
  title: z.string().min(1),
  hostName: z.string().min(1),
  startTime: z.string().datetime(),
  city: z.string().min(1),
  maxAttendees: z.number().int().positive(),
  currentAttendees: z.number().int().min(0),
});
export type EventDetail = z.infer<typeof EventDetail>;

// Response shape for `POST /api/events/[id]/rsvp`. Mirrors the `EventRsvp`
// row (id/eventId/userId/createdAt) — `createdAt` is serialised to an
// ISO-8601 string so the contract is identical on every wire transfer
// (Prisma returns a `Date`, the client gets a `string`).
export const EventRsvpResult = z.object({
  id: z.string().cuid(),
  eventId: EventId,
  userId: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type EventRsvpResult = z.infer<typeof EventRsvpResult>;

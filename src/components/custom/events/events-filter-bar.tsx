// @polsia:user-owned — Filter bar for the /events listing. Owns the markup
// of the city text input + start/end date range + the Clear-filters button.
// Parent (<EventsList/>) owns the filter STATE and the actual filtering;
// this island just exposes primitives for that state to flow through.
//
// Pins itself inside the dashboard content area (sticky) so the controls are
// always reachable while the user scrolls the card grid below.

'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface EventsFilterBarProps {
  city: string;
  startDate: string;
  endDate: string;
  onCityChange: (v: string) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onClear: () => void;
}

export function EventsFilterBar({
  city,
  startDate,
  endDate,
  onCityChange,
  onStartDateChange,
  onEndDateChange,
  onClear,
}: EventsFilterBarProps) {
  const hasActiveFilter = Boolean(city || startDate || endDate);

  return (
    <div className="sticky top-0 z-10 -mx-4 border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="events-filter-city" className="text-eyebrow text-muted-foreground">
            City
          </Label>
          <Input
            id="events-filter-city"
            type="text"
            value={city}
            onChange={(e) => onCityChange(e.target.value)}
            placeholder="Filter by city…"
            aria-label="Filter events by city"
            className="w-48 md:w-56"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="events-filter-start" className="text-eyebrow text-muted-foreground">
            From
          </Label>
          <input
            id="events-filter-start"
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            aria-label="Filter events from start date"
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="events-filter-end" className="text-eyebrow text-muted-foreground">
            Until (optional)
          </Label>
          <input
            id="events-filter-end"
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            aria-label="Filter events until end date"
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={!hasActiveFilter}
          aria-label="Clear all filters"
        >
          Clear filters
        </Button>
      </div>
    </div>
  );
}

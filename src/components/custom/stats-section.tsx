// @polsia:user-owned

import { Card, CardContent } from '@/components/ui/card';

const STATS = [
  {
    value: '3×',
    label: 'Growth in dating app usage among 55–64 year olds over the past three years',
  },
  {
    value: '72%',
    label: 'Of singles 50+ say they want a serious relationship — not casual dating',
  },
  {
    value: '100%',
    label: 'Of profiles manually reviewed before appearing in match suggestions',
  },
];

export function StatsSection() {
  return (
    <section className="section bg-primary/5 dark:bg-primary/10">
      <div className="container-page">
        <div className="grid gap-6 lg:grid-cols-3">
          {STATS.map((stat) => (
            <Card key={stat.label} className="border-primary/20 bg-card text-center">
              <CardContent className="flex flex-col gap-3 pt-8">
                <div className="font-display text-5xl font-bold tracking-tight text-primary">
                  {stat.value}
                </div>
                <p className="text-body text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

import './calendar.css';

/** Class names for the calendar scene; rules live in calendar.css (global, cal- prefixed). */
const styles = {
  attendee: 'cal-attendee',
  billboard: 'cal-billboard',
  boardArea: 'cal-boardArea',
  boardCenter: 'cal-boardCenter',
  boardHeader: 'cal-boardHeader',
  boardScroll: 'cal-boardScroll',
  dayLabel: 'cal-dayLabel',
  daySection: 'cal-daySection',
  emptyLine: 'cal-emptyLine',
  errorText: 'cal-errorText',
  eventName: 'cal-eventName',
  fab: 'cal-fab',
  foreground: 'cal-foreground',
  ground: 'cal-ground',
  hall: 'cal-hall',
  hallCanvas: 'cal-hallCanvas',
  intentChip: 'cal-intentChip',
  row: 'cal-row',
  rowIcon: 'cal-rowIcon',
  rowLink: 'cal-rowLink',
  rows: 'cal-rows',
  rowSub: 'cal-rowSub',
  rowText: 'cal-rowText',
  rowTime: 'cal-rowTime',
  rowTitle: 'cal-rowTitle',
  screen: 'cal-screen',
  stage: 'cal-stage',
} as const;

export default styles;

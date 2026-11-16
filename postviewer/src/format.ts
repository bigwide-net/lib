// Text formatting for post cards.

/**
 * Formats a published time into a human-readable string with contextual formatting.
 * Same day: "3:29 p.m.", Yesterday: "Yesterday 3:29 p.m.",
 * Same year: "Jan 2 3:29 p.m.", Previous year: "Jan 2, 2024 3:29 p.m."
 */
export const formatPublishedTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() == d2.getFullYear() &&
    d1.getMonth() == d2.getMonth() &&
    d1.getDate() == d2.getDate();

  const isYesterday = (d: Date) => {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return isSameDay(d, yesterday);
  };

  const formatTime = (d: Date) => {
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'p.m.' : 'a.m.';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const time = formatTime(date);

  if (isSameDay(date, now)) return time;
  if (isYesterday(date)) return `Yesterday ${time}`;

  const month = monthNames[date.getMonth()];
  const day = date.getDate();
  if (date.getFullYear() == now.getFullYear()) return `${month} ${day} ${time}`;
  return `${month} ${day}, ${date.getFullYear()} ${time}`;
};

/**
 * Parse a post/newsletter author string into a display name and email.
 * Handles "Name <email>" (newsletter), the RSS `<author>` form "email (Name)", a bare email,
 * or a plain name. Either field may be absent.
 */
export function parseAuthor(raw: string): { name?: string; email?: string } {
  const s = (raw || '').trim();
  // "Joe Public <joe@example.com>"
  const angle = /^(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>$/.exec(s);
  if (angle) {
    const name = angle[1].trim().replace(/^"(.*)"$/, '$1').trim();
    return { name: name || undefined, email: angle[2] };
  }
  // "joe@example.com (Joe Public)" — RSS author convention
  const paren = /^([^\s<>()]+@[^\s<>()]+)\s*\((.+)\)$/.exec(s);
  if (paren)
    return { name: paren[2].trim() || undefined, email: paren[1] };
  // bare email
  if (/^[^\s<>@]+@[^\s<>@]+$/.test(s))
    return { email: s };
  // plain name (or anything else)
  return { name: s || undefined };
}

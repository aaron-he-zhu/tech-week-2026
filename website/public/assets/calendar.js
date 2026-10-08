'use strict';
(() => {
  function matches(event, state, addressCounts, ignoreDate = false) {
    const query = state.q.trim().toLowerCase();
    return (
      (ignoreDate ||
        !state.date ||
        (event.date <= state.date && (event.endDate || event.date) >= state.date)) &&
      (!state.format || event.formats.includes(state.format)) &&
      (!state.purpose || event.purposes.includes(state.purpose)) &&
      (!state.status || event.status === state.status) &&
      (!state.featured || event.featured === true) &&
      (!state.address || (addressCounts?.[event.id] || 0) > 0) &&
      (!query ||
        [
          event.name,
          event.brief,
          event.hosts.join(' '),
          event.place,
          event.themes.join(' '),
          event.searchText || '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(query))
    );
  }
  function entries(events, dates) {
    return dates.flatMap((date) =>
      events
        .filter((event) => event.date <= date && (event.endDate || event.date) >= date)
        .sort(
          (a, b) =>
            (a.date < date ? '' : a.time).localeCompare(b.date < date ? '' : b.time) ||
            a.name.localeCompare(b.name),
        )
        .map((event) => ({ date, event, continuing: event.date < date })),
    );
  }
  function dayCounts(events, dates) {
    const counts = Object.fromEntries(dates.map((date) => [date, 0]));
    for (const { date } of entries(events, dates)) counts[date]++;
    return counts;
  }
  window.EventCalendar = { matches, entries, dayCounts };
})();

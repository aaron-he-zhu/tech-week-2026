"""Small, precomputed calendar links for the homepage hero."""


def calendar_weeks(events):
    weeks = []
    for city, first_day in (("sf", 5), ("la", 12)):
        days = []
        for day in range(first_day, first_day + 7):
            date = f"2026-10-{day:02}"
            count = sum(
                event["citySlug"] == city
                and event["date"] <= date <= (event.get("endDate") or event["date"])
                for event in events
            )
            days.append({"date": date, "day": day, "count": count})
        weeks.append({"city": city, "days": days})
    return weeks
